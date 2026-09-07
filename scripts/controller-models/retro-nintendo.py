"""Original articulated retro Nintendo hardware. See retro-nintendo-provenance.md."""
import argparse
import bpy
import json
import re
import math
import os
import sys
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svg_paths import path_contours
import xml.etree.ElementTree as ET
parser=argparse.ArgumentParser()
parser.add_argument('--family', choices=['nes','snes','gb','gbc','gba'], required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--proof', required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
os.makedirs(args.output,exist_ok=True)
os.makedirs(args.proof,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def material(name, color, roughness=.6, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return mat


def pivot(name, parent=None, location=(0, 0, 0), button=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    if button is not None:
        obj['buttonIndex'] = button
    return obj


root = pivot('controller_root')


def mesh_object(name, vertices, faces, mat, parent=root, location=(0, 0, 0), smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    mesh.materials.append(mat)
    uv=mesh.uv_layers.new(name='SurfaceUV')
    for loop in mesh.loops:
        point=mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(point.x*4,point.y*4)
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    return obj


def weighted(obj):
    modifier = obj.modifiers.new('Weighted broad surface normals', 'WEIGHTED_NORMAL')
    modifier.keep_sharp = True
    modifier.weight = 35


def rounded(obj, radius=.005, segments=3):
    modifier = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
    modifier.width = radius
    modifier.segments = segments
    weighted(obj)
    return obj


def rounded_block(name,location,dimensions,mat,parent=root,radius=.025):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=bpy.context.object
    obj.name=name
    obj.scale=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.parent=parent
    obj.location=location
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    return rounded(obj,radius,5)


def cylinder(name, location, radius, depth, mat, parent=root, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return rounded(obj, .003, 3)


def curve_outline(points, steps=5):
    coords = []
    for i, p1 in enumerate(points):
        p0 = points[(i - 1) % len(points)]
        p2 = points[(i + 1) % len(points)]
        p3 = points[(i + 2) % len(points)]
        for j in range(steps):
            t = j / steps
            coords.append(tuple(.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2*p0[k] - 5*p1[k] + 4*p2[k] - p3[k]) * t*t + (-p0[k] + 3*p1[k] - 3*p2[k] + p3[k]) * t*t*t) for k in range(2)))
    return coords


def loft(name, coords, rings, mat, parent=root, center=(0, 0), location=(0, 0, 0)):
    n = len(coords)
    vertices = [(center[0] + (x-center[0])*scale, center[1] + (y-center[1])*scale, z) for scale, z in rings for x, y in coords]
    faces = [tuple(reversed(range(n))), tuple((len(rings)-1)*n+i for i in range(n))]
    faces += [(k*n+i, k*n+(i+1)%n, (k+1)*n+(i+1)%n, (k+1)*n+i) for k in range(len(rings)-1) for i in range(n)]
    obj = mesh_object(name, vertices, faces, mat, parent, location)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    weighted(obj)
    return obj


def rectangle(name, location, width, height, depth, radius, mat, parent=root):
    outline = []
    for x, y, start in [(width/2-radius, height/2-radius, 0), (-width/2+radius, height/2-radius, 90), (-width/2+radius, -height/2+radius, 180), (width/2-radius, -height/2+radius, 270)]:
        for j in range(7):
            angle = math.radians(start+j*90/6)
            outline.append((x+radius*math.cos(angle), y+radius*math.sin(angle)))
    return loft(name, outline, [(1, -depth/2), (1, depth/2-.002), (.985, depth/2)], mat, parent, location=location)


def text_mesh(name, text, location, size, mat, parent=root):
    font = bpy.data.curves.new(name, 'FONT')
    font.body = text
    font.align_x = 'CENTER'
    font.align_y = 'CENTER'
    font.size = size
    font.extrude = .00025
    font.resolution_u = 5
    obj = bpy.data.objects.new(name, font)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    font.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return obj


def lathe(name, radial_profile, mat, parent, segments=64):
    vertices = [(radius*math.cos(i*math.tau/segments), radius*math.sin(i*math.tau/segments), z) for radius, z in radial_profile for i in range(segments)]
    faces = [(ring*segments+i, ring*segments+(i+1)%segments, (ring+1)*segments+(i+1)%segments, (ring+1)*segments+i) for ring in range(len(radial_profile)-1) for i in range(segments)]
    faces += [tuple(reversed(range(segments))), tuple((len(radial_profile)-1)*segments+i for i in range(segments))]
    return mesh_object(name, vertices, faces, mat, parent)


# All interactive IDs are libretro, not browser Gamepad indices.
root['hardwareFamily']=args.family
root['hardwareRevision']={'nes':'NES-004 US','snes':'SNS-005 US','gb':'DMG-01 grey','gbc':'CGB-001 Grape','gba':'AGB-001 Indigo'}[args.family]
root['controlIndexStandard']='libretro'
root['authoringLicense']='MIT, original GameLord geometry; third-party wordmark provenance documented separately'
root['frontAxis']='+Z'
root['upAxis']='+Y'
gray=material('Warm light grey molded ABS',(.57,.58,.57),.55)
light=material('Warm off-white molded ABS',(.70,.69,.64),.58)
dark=material('Charcoal ABS',(.048,.051,.055),.59)
rubber=material('Matte charcoal rubber',(.012,.014,.017),.81)
ink=material('Printed graphite legends',(.12,.13,.15),.8)
blue=material('Nintendo navy printed legends',(.025,.028,.11),.65)
red=material('Classic red buttons',(.63,.012,.025),.34)
burgundy=material('Game Boy burgundy buttons',(.30,.005,.055),.36)
purple=material('SNES deep purple',(.20,.12,.39),.38)
lavender=material('SNES concave lavender',(.43,.39,.66),.40)
bezel=material('Game Boy graphite bezel',(.21,.23,.26),.48)
lcd=material('Unlit olive reflective LCD',(.33,.40,.11),.29)
lcd_dark=material('LCD inset dark border',(.10,.14,.045),.38)


def control(name,index,location,parent=root):
    obj=pivot(name,parent,location)
    obj['gamepadButtonIndex']=index
    obj['controlRole']='button'
    obj['pressAxis']='Z'
    return obj


def logo(location,width,mat=ink,source="nintendo.svg",capsule=True,glyph=None):
    doc=ET.parse(os.path.join(os.path.dirname(__file__),'logos',source))
    paths=doc.findall('.//{http://www.w3.org/2000/svg}path')
    if source=='super-nintendo.svg':paths=[p for p in paths if p.attrib.get('class')=='st1']
    if source=='gbc.svg':paths=paths[:5]
    if source=='gba.svg':paths=[p for p in paths if p.attrib.get('fill')=='#FFFFFF']
    if not capsule:paths=paths[:-1]
    contours=[c for path in paths for c in path_contours(path.attrib['d'])]
    for polygon in doc.findall('.//{http://www.w3.org/2000/svg}polygon')+doc.findall('.//{http://www.w3.org/2000/svg}polyline'):
        values=[float(v) for v in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',polygon.attrib['points'])]
        a,b,c,d,e,f=[float(v) for v in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',polygon.attrib['transform'])] if 'transform' in polygon.attrib else [1,0,0,1,0,0]
        contours.append([(a*x+c*y+e,b*x+d*y+f) for x,y in zip(values[::2],values[1::2])])
    if source=='gameboy.svg':contours=[c for c in contours if max(p[0] for p in c)<1130]
    points=[p for c in contours for p in c]
    xmin,xmax=min(p[0] for p in points),max(p[0] for p in points)
    ymin,ymax=min(p[1] for p in points),max(p[1] for p in points)
    if glyph is not None:contours=path_contours(paths[glyph].attrib['d'])
    contours=[[( (x-(xmin+xmax)/2)/(xmax-xmin), (1 if source=='gbc.svg' else -1)*(y-(ymin+ymax)/2)/(xmax-xmin)) for x,y in c] for c in contours]
    curve=bpy.data.curves.new('Nintendo supplied public-domain textlogo','CURVE')
    curve.dimensions='2D'
    curve.fill_mode='BOTH'
    curve.resolution_u=1
    for points in contours:
        spline=curve.splines.new('POLY')
        spline.points.add(len(points)-1)
        for point,(x,y) in zip(spline.points,points):point.co=(x*width,y*width,0,1)
        spline.use_cyclic_u=True
    obj=bpy.data.objects.new('Nintendo identification wordmark',curve)
    bpy.context.collection.objects.link(obj)
    obj.parent=root
    obj.location=location
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)


def face(name,index,x,y,z,r,mat,concave=False,label=None):
    cylinder(name+' socket',(x,y,z-.009),r*1.11,.017,dark)
    obj=control(name,index,(x,y,z))
    profile=[(r*.86,-.015),(r,0),(r,.028),(r*.92,.038),(r*.60,.032 if concave else .045),(.0001,.024 if concave else .049)]
    lathe(name+' molded cap',profile,mat,obj)
    if label:text_mesh(name+' printed letter',label,(x,y-r-.040,z+.005),r*.65,ink)
    return obj


def capsule(name,index,x,y,z,w,h,mat,angle=.58):
    obj=control(name,index,(x,y,z))
    obj.rotation_euler.z=angle
    rectangle(name+' rubber cap',(0,0,.012),w,h,.045,h/2-.001,mat,obj)
    return obj


def dpad(x,y,z,size):
    if args.family in ('snes','gb'):
        cylinder('D-pad circular recess',(x,y,z-.012),size*.60,.013,gray if args.family=='snes' else light)
    obj=pivot('D-pad rocker',root,(x,y,z))
    obj['controlRole']='dpad'
    a=size/2
    b=size*.165
    cross=[(-b,a),(b,a),(b,b),(a,b),(a,-b),(b,-b),(b,-a),(-b,-a),(-b,-b),(-a,-b),(-a,b),(-b,b)]
    if args.family in ('snes','nes','gba','gbc'):
        loft('D-pad cross recess',[(x*1.09,y*1.09) for x,y in cross],[(1,-.012),(1,.002)],light if args.family=='nes' else dark,obj)
    part=loft('Cross directional control',cross,[(1,-.008),(1,.034),(.93,.048)],rubber,obj)
    rounded(part,.008,3)
    cutter=cylinder('D-pad center depression tool',(0,0,.055),size*.13,.045,dark,obj,48)
    bpy.context.view_layer.objects.active=part
    cut=part.modifiers.new('Directional center depression','BOOLEAN')
    cut.operation='DIFFERENCE'
    cut.solver='EXACT'
    cut.object=cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    lathe('D-pad shallow center dish',[(size*.13,.047),(size*.10,.041),(.0001,.039)],dark,obj,48)
    for direction,index,dx,dy in [('up',4,0,1),('down',5,0,-1),('left',6,-1,0),('right',7,1,0)]:
        node=control('D-pad '+direction,index,(dx*size*.30,dy*size*.30,.05),obj)
        node['dpadDirection']=direction
        # Recess-tone tactile arrows match original cross controls.
        a=size*.075
        if dx==0: pts=[(-a,-dy*a*.5,.003),(a,-dy*a*.5,.003),(0,dy*a,.003)]
        else: pts=[(-dx*a*.5,-a,.003),(-dx*a*.5,a,.003),(dx*a,0,.003)]
        mesh_object('Directional arrow '+direction,pts,[(0,1,2)],rubber,node,smooth=False)
    return obj


def handheld_outline(w,h,br=.36):
    points=[]
    for x,y,r,start in [(w/2-.12,h/2-.12,.12,0),(-w/2+.12,h/2-.12,.12,90),(-w/2+.12,-h/2+.12,.12,180),(w/2-br,-h/2+br,br,270)]:
        for i in range(12):
            angle=math.radians(start+i*90/11)
            points.append((x+r*math.cos(angle),y+r*math.sin(angle)))
    return points


def cut_block(target,name,location,dimensions,radius=.012):
    cutter=rounded_block(name+' tool',location,dimensions,dark,radius=radius)
    bpy.context.view_layer.objects.active=cutter
    for modifier in list(cutter.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active=target
    modifier=target.modifiers.new(name,'BOOLEAN')
    modifier.operation='DIFFERENCE'
    modifier.solver='EXACT'
    modifier.object=cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter,do_unlink=True)


def side_panel(name,location,width,height,mat,axis):
    obj=rectangle(name,location,width,height,.007,min(width,height)*.16,mat)
    obj.rotation_euler=(0,math.pi/2 if axis=='right' else -math.pi/2,0) if axis in ('right','left') else (math.pi/2 if axis=='bottom' else -math.pi/2,0,0)
    return obj


def dial(name,location,axis,radius=.085):
    node=pivot(name,root,location)
    node.rotation_euler=(0,math.pi/2 if axis=='right' else -math.pi/2,0) if axis in ('right','left') else (math.pi/2,0,0)
    cylinder(name+' wheel',(0,0,0),radius,.035,rubber,node)
    for i in range(28):
        angle=i*math.tau/28
        rib=rounded_block(name+' knurl',(radius*math.cos(angle),radius*math.sin(angle),0),(.009,.009,.038),dark,node,.002)
    return node


def jack(name,location,axis,radius=.035):
    node=pivot(name,root,location)
    node.rotation_euler=(0,math.pi/2 if axis=='right' else -math.pi/2,0) if axis in ('right','left') else (math.pi/2,0,0)
    cylinder(name+' dark opening',(0,0,0),radius,.01,rubber,node)
    lathe(name+' metal rim',[(radius*.94,.007),(radius*1.13,.007),(radius*1.13,.013),(radius*.94,.013)],gray,node,40)
    return node


def screw_socket(x,y,z,parent):
    cylinder('Rear screw recess',(x,y,z),.036,.007,rubber,parent)
    cylinder('Recessed screw head',(x,y,z+.004),.022,.003,ink,parent)
    for angle in [0,math.pi/2]:
        slot=rectangle('Screw cross slot',(x,y,z+.006),.024,.005,.002,.001,rubber,parent)
        slot.rotation_euler.z=angle


if args.family=='snes':
    outline=curve_outline([(0,.40),(-.55,.405),(-.78,.34),(-.96,.15),(-1,-.08),(-.90,-.30),(-.68,-.435),(-.48,-.44),(-.31,-.355),(0,-.35),(.31,-.355),(.48,-.44),(.68,-.435),(.90,-.30),(1,-.08),(.96,.15),(.78,.34),(.55,.405)],8)
    loft('SNES rear shell',outline,[(.96,-.24),(1,-.035)],gray)
    loft('SNES seam',outline,[(1,-.035),(1,-.026)],dark)
    loft('SNES face shell',outline,[(1,-.026),(1,.048),(.98,.085)],gray)
    for name,index,x in [('L',10,-.61),('R',11,.61)]:
        node=control(name+' shoulder',index,(x,.362,-.002))
        shoulder=curve_outline([(-.24,-.025),(-.24,.035),(-.12,.06),(.11,.06),(.24,.022),(.23,-.025)],6)
        loft(name+' curved shoulder cap',[(a,b*.7-.60*max(0,abs(x+a)-.62)) for a,b in shoulder],[(.94,-.18),(1,.015),(.97,.05)],gray,node)
        text_mesh(name+' shoulder legend',name,(0,.023,.052),.055,ink,node)
    cylinder('Face-button dark grey well',(.59,-.006,.087),.367,.012,bezel,vertices=96)
    for x,y in [(.493,.071),(.681,-.078)]:
        ob=rectangle('Diagonal face button inset',(x,y,.099),.36,.192,.009,.092,gray)
        ob.rotation_euler.z=.63
    face('Y',1,.397,.005,.105,.077,lavender,True)
    face('X',9,.594,.139,.105,.077,lavender,True)
    face('B',0,.588,-.149,.105,.077,purple)
    face('A',8,.770,-.008,.105,.077,purple)
    for name,x,y in [('Y',.33,.09),('X',.57,.267),('B',.565,-.282),('A',.875,-.013)]:text_mesh(name+' moulded legend',name,(x,y,.111),.064,gray)
    dpad(-.566,.003,.092,.355)
    capsule('Select',2,-.177,-.06,.09,.155,.060,rubber)
    capsule('Start',3,.045,-.06,.09,.155,.060,rubber)
    text_mesh('SELECT legend','SELECT',(-.19,-.193,.092),.040,ink)
    text_mesh('START legend','START',(.049,-.193,.092),.040,ink)
    logo((-.11,.265,.088),.52,ink,'super-nintendo.svg')
    rounded_block('Cable strain relief',(0,.442,-.04),(.09,.12,.09),dark,radius=.014)
elif args.family in ('gb','gbc'):
    color=args.family=='gbc'
    h=3.42 if color else 3.29
    body=material('Game Boy Color grape ABS',(.13,.035,.30),.43) if color else light
    outline=curve_outline([(0,h/2),(-.80,h/2),(-.95,h/2-.05),(-1,h/2-.17),(-1,.90),(-1,0),(-1,-.9),(-.99,-1.35),(-.91,-1.55),(-.65,-1.65),(0,-1.71),(.65,-1.65),(.91,-1.55),(.99,-1.35),(1,-.9),(1,0),(1,.9),(1,h/2-.17),(.95,h/2-.05),(.8,h/2)],8) if color else handheld_outline(2,h,.40)
    rear_depth=-.56 if color else -.58
    rear_shell=loft('Rear enclosure',outline,[(.94,rear_depth),(.985,rear_depth+.04),(1,-.065)],body)
    loft('Enclosure seam',outline,[(1,-.065),(1,-.054)],dark)
    loft('Front enclosure',outline,[(1,-.054),(1,.092),(.979,.125)],body)
    if color:
        screen_bezel=rectangle('Game Boy Color black lens',(0,.77,.132),1.78,1.55,.021,.12,dark)
        screen_y=.84
        rectangle('LCD border',(.04,screen_y,.147),1.24,1.11,.007,.013,ink)
        rectangle('LCD',(.04,screen_y,.154),1.14,1.035,.009,.004,material('Color LCD unlit',(.23,.29,.23),.31))
        logo((-.25,.10,.151),.60,gray,'gameboy.svg')
        colors=[material('Logo '+str(i),c,.7) for i,c in enumerate([(.8,.03,.1),(.2,.35,.8),(.2,.6,.25),(.8,.7,.03),(.2,.55,.65)])]
        for i,color_index in enumerate([1,3,4,2,0]):logo((.34,.10,.15),.49,colors[color_index],'gbc.svg',glyph=i)
        logo((0,-.21,.127),.48,body)
    else:
        rectangle('Grey display lens',(0,.82,.133),1.77,1.35,.019,.11,bezel)
        screen_y=.82
        rectangle('LCD dark inner frame',(.03,screen_y,.149),1.27,1.10,.006,.013,lcd_dark)
        rectangle('LCD olive display',(.03,screen_y,.154),1.15,1.035,.005,.007,lcd)
        for y,mat in [(1.387,burgundy),(1.353,blue)]:rectangle('Bezel decorative line',(0,y,.146),1.52,.009,.002,.003,mat)
        rectangle('Bezel label backing',(.13,1.37,.15),1.1,.05,.001,.003,bezel)
        text_mesh('Dot matrix lens text','DOT MATRIX WITH STEREO SOUND',(.13,1.37,.154),.040,gray)
        text_mesh('Battery text','BATTERY',(-.731,.64,.154),.032,gray)
        logo((-.61,.024,.13),.45,blue)
        logo((.065,.019,.133),.80,blue,'gameboy.svg')
    cylinder('Red battery indicator',(-.742,.83,.156),.020,.005,red)
    dpad(-.57,-.61,.137,.51)
    b_button=face('B',0,.36,-.68,.14,.124,dark if color else burgundy)
    a_button=face('A',8,.72,-.515,.14,.124,dark if color else burgundy)
    text_mesh('B label','B',(0,0,.051) if color else (.35,-.86,.14),.09 if color else .078,ink if color else blue,b_button if color else root)
    text_mesh('A label','A',(0,0,.051) if color else (.735,-.70,.14),.09 if color else .078,ink if color else blue,a_button if color else root)
    capsule('Select',2,-.28,-1.16,.139,.20,.064,dark if color else bezel,0 if color else .34)
    capsule('Start',3,.08,-1.16 if color else -1.11,.139,.20,.064,dark if color else bezel,0 if color else .34)
    for label,x,y in [('SELECT',-.30,-1.285),('START',.061,-1.245)]:
        ob=text_mesh(label+' legend',label,(x,y,.134),.057,blue if not color else gray)
        ob.rotation_euler.z=0 if color else .34
    for i in range(0 if color else 6):
        ob=rectangle('Speaker vent '+str(i),(.46+i*.083,-1.27+i*.019,.130),.030,.40,.007,.014,dark)
        ob.rotation_euler.z=.42
    if color:
        for row in range(6):
            for col in range(6):
                if (col-2.5)**2+(row-2.5)**2<10:
                    cylinder('Speaker grille perforation',(.56+(col-2.5)*.070,-1.30+(row-2.5)*.07,.131),.018,.005,dark)
    if not color:
        rounded_block('Power slider',(-.66,h/2+.009,-.15),(.22,.036,.13),dark,radius=.008)
        text_mesh('Power legend','OFF • ON',(-.60,h/2-.064,.13),.035,ink)
elif args.family=='nes':
    rectangle('NES rear enclosure',(0,0,-.095),2,.87,.17,.035,gray)
    rectangle('NES enclosure seam',(0,0,-.006),2,.87,.010,.035,dark)
    rectangle('NES front enclosure',(0,0,.054),2,.87,.11,.035,light)
    rectangle('NES dark face printing',(0,0,.113),1.86,.72,.004,.017,dark)
    for y in [.32,.18,.04,-.33]:
        rectangle('Central grey printed stripe',(-.11,y,.117),.64,.09,.002,.018,gray)
    rectangle('SELECT START panel',(-.11,-.175,.123),.64,.22,.014,.025,light)
    dpad(-.64,-.015,.127,.40)
    capsule('Select',2,-.27,-.175,.139,.19,.063,rubber,0)
    capsule('Start',3,.05,-.175,.139,.19,.063,rubber,0)
    text_mesh('SELECT printed','SELECT',(-.27,.039,.123),.053,red)
    text_mesh('START printed','START',(.05,.039,.123),.053,red)
    for name,index,x in [('B',0,.45),('A',8,.77)]:
        rectangle(name+' ivory square recess',(x,-.15,.122),.27,.25,.011,.014,light)
        face(name,index,x,-.15,.141,.103,red)
        text_mesh(name+' red label',name,(x,-.331,.12),.066,red)
    logo((.61,.205,.123),.46,red,capsule=False)
    rounded_block('Cord strain relief',(-.61,.46,-.05),(.075,.10,.09),dark,radius=.009)
elif args.family=='gba':
    indigo=material('Game Boy Advance indigo ABS',(.16,.08,.36),.48)
    outline=curve_outline([(0,.62),(-.41,.63),(-.67,.58),(-.94,.49),(-1.04,.27),(-1.08,-.08),(-1.04,-.32),(-.91,-.47),(-.60,-.55),(0,-.58),(.60,-.55),(.91,-.47),(1.04,-.32),(1.08,-.08),(1.04,.27),(.94,.49),(.67,.58),(.41,.63)],8)
    rear_shell=loft('GBA rear enclosure',outline,[(.94,-.255),(.985,-.22),(1,-.055)],indigo)
    loft('GBA enclosure seam',outline,[(1,-.055),(1,-.045)],dark)
    loft('GBA front shell',outline,[(1,-.045),(1,.055),(.98,.11)],indigo)
    rectangle('GBA screen lens',(0,.01,.119),1.17,1.02,.022,.11,dark)
    rectangle('GBA recessed LCD border',(0,.065,.135),1.01,.70,.006,.013,ink)
    screen=material('Unlit GBA reflective LCD',(.22,.26,.23),.3)
    rectangle('GBA LCD',(0,.065,.14),.96,.64,.006,.006,screen)
    logo((0,-.41,.136),.72,gray,'gba.svg')
    logo((0,.545,.114),.31,lavender)
    node=dpad(-.80,.12,.125,.29)
    for child in node.children:
        if child.type=='MESH' and child.name.startswith('Cross'):
            child.data.materials.clear();child.data.materials.append(light)
    for name,index,x,y in [('B',0,.73,-.015),('A',8,.95,.08)]:
        node=face(name,index,x,y,.13,.078,light)
        text_mesh(name+' embossed glyph',name,(0,0,.051),.07,gray,node)
    face('Start',3,-.68,-.23,.13,.034,light)
    face('Select',2,-.68,-.36,.13,.034,light)
    text_mesh('START shell marking','START',(-.80,-.23,.115),.036,lavender)
    text_mesh('SELECT shell marking','SELECT',(-.80,-.36,.115),.036,lavender)
    for i in range(6):rectangle('GBA speaker slot '+str(i),(.80,-.22-i*.037,.115),.22,.011,.005,.005,dark)
    for name,index,x in [('L',10,-.83),('R',11,.83)]:
        node=control(name+' shoulder',index,(x,.48,-.014))
        side=-1 if x<0 else 1
        wing=curve_outline([(-.22,-.03),(-.18,.09),(0,.10),(.16,.055),(.23,-.015),(.24,-.12),(.15,-.10),(-.04,-.055)],5)
        if side<0:wing=[(-a,b) for a,b in reversed(wing)]
        loft(name+' curved shoulder wing',wing,[(.93,-.14),(1,-.06),(.94,.04)],light,node)
    cylinder('Green power indicator',(.80,.36,.12),.018,.005,lcd_dark)

# Secondary surfaces follow original Nintendo component diagrams and rear photos.
if args.family in ('gb','gbc'):
    # The cartridge seat is an actual opening through the upper rear enclosure.
    cut_block(rear_shell,'Cartridge seat',(0,h/2-.22,rear_depth-.015),(1.36,.83,.34),.016)
    rear=pivot('Rear hardware details',root,(0,0,rear_depth+.010))
    rear.rotation_euler.y=math.pi
    rectangle('Cartridge inner seat',(0,h/2-.30,-.125),1.31,.57,.018,.018,body,rear)
    for x in [-.65,.65]:
        rounded_block('Cartridge guide rail',(x,h/2-.30,-.067),(.037,.60,.13),body,rear,.009)
    rectangle('Cartridge connector slot',(0,h/2-.60,-.02),1.30,.065,.022,.014,rubber,rear)
    for x in [-.82,.82]:
        screw_socket(x,h/2-.31,.01,rear)
        screw_socket(x,-.04,.01,rear)
    if color:
        cover_y,cover_h=-.92,1.08
        rectangle('Battery cover seam',(0,cover_y,.009),1.66,cover_h,.008,.11,dark,rear)
        rectangle('Battery cover',(0,cover_y,.022),1.63,cover_h-.028,.024,.10,body,rear)
        rectangle('Battery release recess',(0,-1.47,.037),.30,.14,.008,.025,dark,rear)
        rounded_block('Battery release tab',(0,-1.48,.052),(.19,.058,.022),body,rear,.009)
        rectangle('Rear product label',(0,.08,.013),1.45,.55,.005,.025,dark,rear)
        text_mesh('Rear model identifier','GAME BOY COLOR  CGB-001',(0,.23,.02),.07,gray,rear)
        text_mesh('Rear rating','DC 3V   0.6W     AA x 2',(0,.08,.02),.043,gray,rear)
        # GBC has its power slider on the right edge, not the DMG top switch.
        side_panel('Power slider recess',(1.004,.51,-.12),.17,.35,dark,'right')
        rounded_block('Power side slider',(1.014,.57,-.12),(.035,.14,.10),body,radius=.009)
        for y in [.535,.56,.585]:rounded_block('Power slider grip',(1.036,y,-.12),(.005,.006,.10),dark,radius=.001)
        dial('Volume dial',(-1.005,-.92,-.15),'left',.085)
        side_panel('External extension socket',(-1.007,.73,-.14),.18,.11,ink,'left')
        side_panel('External extension contact cavity',(-1.013,.73,-.14),.125,.065,rubber,'left')
        jack('External DC input',(-.26,-1.694,-.21),'bottom',.027)
        jack('Headphone jack',(.20,-1.70,-.23),'bottom',.036)
        infrared=material('Dark red infrared lens',(.030,.002,.006),.22)
        side_panel('Infrared communication window',(-.53,h/2+.006,-.22),.39,.20,infrared,'top')
        text_mesh('Infrared marking','COMM.',(-.48,h/2-.062,.13),.037,body)
        text_mesh('Power lens print','POWER',(-.734,.71,.158),.035,gray)
        for offset in [0,.038,.076]:
            arc=[]
            for i in range(12):
                angle=-1.05+i*2.10/11
                arc.append((-.70+offset+.020*math.cos(angle),.83+.032*math.sin(angle)))
            for i in range(11):
                a,b=arc[i],arc[i+1]
                mesh_object('Power wave print',[(a[0],a[1],.16),(a[0]-.004,a[1],.16),(b[0]-.004,b[1],.16),(b[0],b[1],.16)],[(0,1,2,3)],gray,smooth=False)
        # A small embossed logo needs relief and a slight tonal shift to remain visible.
        molded=material('Grape molded identification relief',(.18,.060,.35),.58)
        logo((0,-.21,.129),.48,molded)
    else:
        cover_y,cover_h=-.94,1.20
        rectangle('Battery cover seam',(0,cover_y,.01),1.52,cover_h,.012,.065,gray,rear)
        rectangle('Battery cover',(0,cover_y,.027),1.49,cover_h-.025,.020,.055,body,rear)
        rectangle('Battery release notch',(0,-.30,.02),.31,.15,.014,.02,gray,rear)
        rounded_block('Battery cover latch',(0,-.33,.047),(.20,.065,.025),body,rear,.008)
        for i in range(13):
            y=-.20-i*.09
            rounded_block('Rear grip rib',(0,y,.035),(1.78,.025,.05),body,rear,.009)
        rectangle('Molded product info region',(0,.39,.012),1.17,.48,.006,.018,gray,rear)
        text_mesh('Rear model identifier','MODEL NO. DMG-01',(0,.50,.02),.062,body,rear)
        text_mesh('Rear rating','DC 6V  0.7W   AA x 4',(0,.30,.02),.046,body,rear)
        dial('Contrast dial',(-1.004,.78,-.15),'left',.10)
        dial('Volume dial',(1.004,.80,-.15),'right',.10)
        side_panel('External extension port',(1.006,.30,-.22),.24,.15,ink,'right')
        side_panel('External connector interior',(1.013,.30,-.22),.18,.09,rubber,'right')
        jack('External DC 6V',(-1.006,-.17,-.20),'left',.035)
        jack('Stereo headphone jack',(0,-1.643,-.22),'bottom',.043)
if args.family=='gba':
    cut_block(rear_shell,'GBA Game Pak opening',(0,.51,-.26),(1.06,.36,.23),.02)
    rear=pivot('Rear hardware details',root,(0,0,-.245))
    rear.rotation_euler.y=math.pi
    rectangle('Game Pak inner seat',(0,.47,-.065),1.02,.30,.018,.02,indigo,rear)
    rectangle('Game Pak connector edge',(0,.32,.01),.90,.045,.016,.01,rubber,rear)
    rectangle('Battery cover seam',(0,-.30,.014),1.03,.50,.008,.07,dark,rear)
    rectangle('Battery cover',(0,-.30,.026),1.005,.48,.023,.06,indigo,rear)
    rectangle('Battery release opening',(0,-.06,.04),.22,.14,.012,.025,dark,rear)
    rounded_block('Battery cover release',(0,-.065,.05),(.15,.045,.016),indigo,rear,.006)
    rectangle('GBA rear product label',(0,.15,.012),1.12,.23,.004,.028,dark,rear)
    text_mesh('Rear GBA model','GAME BOY ADVANCE  AGB-001',(0,.18,.02),.046,gray,rear)
    text_mesh('Rear GBA rating','DC 3V  0.6W   AA x 2',(0,.10,.02),.034,gray,rear)
    for x,y in [(-.78,.37),(.78,.37),(-.98,-.30),(.98,-.30)]:screw_socket(x,y,.006,rear)
    side_panel('Top external connector',(0,.635,-.065),.16,.085,gray,'top')
    side_panel('External contact opening',(0,.640,-.065),.115,.040,rubber,'top')
    for x in [-.38,.38]:side_panel('Accessory fixation slot',(x,.60,-.085),.075,.085,dark,'top')
    side_panel('Bottom power switch opening',(-.80,-.505,-.085),.22,.10,dark,'bottom')
    rounded_block('GBA power slider',(-.80,-.518,-.085),(.10,.025,.075),indigo,radius=.009)
    jack('GBA headphone jack',(.60,-.55,-.10),'bottom',.033)
    dial('GBA volume dial',(.80,-.513,-.08),'bottom',.062)
    side_panel('Wrist strap recess',(1.063,-.20,-.17),.10,.055,dark,'right')
    text_mesh('POWER molded legend','POWER',(.88,.36,.115),.030,lavender)


# Export geometry before adding proof-only lighting and camera.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(args.output,args.family+'.glb'),export_format='GLB',export_yup=False,export_extras=True,export_apply=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.render.film_transparent=True
scene.world.color=(.18,.18,.18)
scene.view_settings.view_transform='AgX'
for name,loc,energy,size in [('Key',(-3,4,5),350,4),('Fill',(3,1,4),180,3),('Rim',(0,-3,2),80,2)]:
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy
    data.shape='DISK'
    data.size=size
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Proof camera')
cam=bpy.data.objects.new('Proof camera',camdata)
bpy.context.collection.objects.link(cam)
cam.location=(0,0,7)
cam.rotation_euler=(0,0,0)
camdata.type='ORTHO'
camdata.ortho_scale=3.75 if args.family in ('gb','gbc') else 2.38
scene.camera=cam
scene.render.resolution_x=880
scene.render.resolution_y=880 if args.family in ('gb','gbc') else 560 if args.family=='gba' else 480
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=os.path.join(args.proof,args.family+'-front.png')
bpy.ops.render.render(write_still=True)
scene.render.resolution_percentage=50
scene.render.filepath=os.path.join(args.proof,args.family+'-440.png')
bpy.ops.render.render(write_still=True)
def aim_camera_y_up(camera):
    backward=camera.location.normalized()
    right=Vector((0,1,0)).cross(backward).normalized()
    up=backward.cross(right)
    camera.rotation_euler=Matrix((right,up,backward)).transposed().to_euler()

# Additional proof angles reveal enclosure thickness, ports, shoulder contours and rear work.
scene.render.resolution_percentage=100
scene.render.resolution_y=880 if args.family in ('gb','gbc') else 620
camdata.ortho_scale=4.10 if args.family in ('gb','gbc') else 2.60
cam.location=(3,2,7)
aim_camera_y_up(cam)
scene.render.filepath=os.path.join(args.proof,args.family+'-angled.png')
bpy.ops.render.render(write_still=True)
if args.family in ('gb','gbc','gba'):
    data=bpy.data.lights.new('Rear proof fill','AREA')
    data.energy=280
    data.size=4
    obj=bpy.data.objects.new('Rear proof fill',data)
    bpy.context.collection.objects.link(obj)
    obj.location=(-3,3,-5)
    obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
    cam.location=(-2,1.5,-7)
    aim_camera_y_up(cam)
    scene.render.filepath=os.path.join(args.proof,args.family+'-rear.png')
    bpy.ops.render.render(write_still=True)
