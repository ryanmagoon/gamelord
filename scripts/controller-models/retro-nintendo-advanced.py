"""Original MIT-licensed NUS-005, DOL-003 and NTR-001 geometry.
Reference drawings inform proportions only. No external meshes or textures.
Blender --background --python this-file -- --family n64 --output PATH --render
"""
import argparse
import bpy
import json
import math
import os
import sys
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from svg_paths import path_contours
import xml.etree.ElementTree as ET
import re

p = argparse.ArgumentParser()
p.add_argument('--family', choices=['n64', 'gamecube', 'nds'], required=True)
p.add_argument('--output', required=True)
p.add_argument('--render', action='store_true')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
os.makedirs(a.output, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, rgb, rough=.48, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metallic
    return m

silver = mat('Silver grey polymer', (.46,.49,.52), .48)
grey = mat('Warm grey molded plastic', (.52,.52,.49), .57)
indigo = mat('GameCube indigo shell', (.105,.065,.30), .39)
dark = mat('Joint recess charcoal', (.018,.022,.026), .75)
black = mat('Graphite controls', (.065,.072,.08), .46)
light = mat('Control grey', (.50,.52,.55), .42)
white = mat('Light legends', (.70,.72,.70), .55)
yellow = mat('C control yellow', (.94,.61,.013), .38)
green = mat('A control green', (.025,.52,.21), .33)
red = mat('B and START red', (.68,.026,.029), .34)
blue = mat('N64 A blue', (.035,.16,.68), .35)
purple = mat('GameCube Z violet', (.32,.14,.64), .36)
screen = mat('Unlit LCD glass', (.030,.057,.068), .16)

def pivot(name, xyz=(0,0,0), parent=None, index=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = xyz
    o.parent = parent
    if index is not None:
        o['gamepadButtonIndex'] = index
        o['buttonIndex'] = index
    return o
root = pivot('controller_root')
root['assetLicense'] = 'MIT'
root['hardwareModel'] = {'n64':'NUS-005','gamecube':'DOL-003','nds':'NTR-001'}[a.family]

def finish(o, name, xyz, material, parent, bevel=0):
    o.name = name
    o.location = xyz
    o.parent = parent
    o.data.materials.append(material)
    if bevel:
        m=o.modifiers.new('Molded edge radius','BEVEL')
        m.width=bevel
        m.segments=3
        n=o.modifiers.new('Surface normals','WEIGHTED_NORMAL')
        n.keep_sharp=True
    return o

def box(name, xyz, size, material, parent=root, bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o=bpy.context.object
    o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,xyz,material,parent,bevel)

def cyl(name, xyz, radius, depth, material, parent=root, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth)
    o=finish(bpy.context.object,name,xyz,material,parent,.003 if vertices not in [12,16] else 0)
    for f in o.data.polygons: f.use_smooth=True
    return o

def label(text, xyz, size, material=black, parent=root):
    c=bpy.data.curves.new('Legend '+text,'FONT')
    c.body=text
    c.align_x='CENTER'
    c.align_y='CENTER'
    c.size=size
    c.extrude=.0001
    c.resolution_u=3
    o=bpy.data.objects.new('Legend '+text,c)
    bpy.context.collection.objects.link(o)
    o.location=xyz
    o.parent=parent
    c.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH')
    return o

def vector_mark(filename, width, xyz):
    source=ET.parse(os.path.join(os.path.dirname(__file__),'logos',filename)).getroot()
    contours=[]
    def collect(element, inherited):
        transform=Matrix.Identity(3)
        for kind,values in re.findall(r'(matrix|translate)\(([^)]+)\)',element.get('transform','')):
            v=[float(x) for x in re.split(r'[ ,]+',values.strip())]
            if kind=='matrix': transform=transform @ Matrix(((v[0],v[2],v[4]),(v[1],v[3],v[5]),(0,0,1)))
            else: transform=transform @ Matrix(((1,0,v[0]),(0,1,v[1] if len(v)>1 else 0),(0,0,1)))
        transform=inherited @ transform
        tag=element.tag.split('}')[-1]
        paths=[]
        if tag=='path': paths=path_contours(element.get('d',''))
        if tag=='polygon':
            values=[float(x) for x in re.split(r'[ ,]+',element.get('points','').strip())]
            paths=[list(zip(values[::2],values[1::2]))]
        for points in paths:
            contours.append([tuple((transform @ Vector((x,y,1)))[:2]) for x,y in points])
        for child in element: collect(child,transform)
    collect(source,Matrix.Identity(3))
    xs=[x for points in contours for x,y in points]
    ys=[y for points in contours for x,y in points]
    cx,cy=(max(xs)+min(xs))/2,(max(ys)+min(ys))/2
    span=max(xs)-min(xs)
    contours=[[( (x-cx)/span,(cy-y)/span) for x,y in points] for points in contours]
    curve=bpy.data.curves.new('Nintendo identification outline','CURVE')
    curve.dimensions='2D'
    curve.fill_mode='BOTH'
    curve.extrude=.0003
    for points in contours:
        spline=curve.splines.new('POLY')
        spline.points.add(len(points)-1)
        for point,(x,y) in zip(spline.points,points): point.co=(x*width,y*width,0,1)
        spline.use_cyclic_u=True
    obj=bpy.data.objects.new('Nintendo identification outline',curve)
    bpy.context.collection.objects.link(obj)
    obj.location=xyz
    obj.parent=root
    curve.materials.append(black)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')

def screw(x,y,z):
    q=pivot('Rear triwing screw',(x,y,z),root)
    q.rotation_euler.x=math.pi
    for name,z,r,material in [('Recess',0,.027,dark),('Steel screw head',.004,.019,light)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=.006)
        finish(bpy.context.object,name,(0,0,z),material,q)
    for angle in [0,math.tau/3,math.tau*2/3]:
        slot=box('Triwing recess',(math.sin(angle)*.006,math.cos(angle)*.006,.008),(.004,.017,.002),dark,q,0)
        slot.rotation_euler.z=-angle

def smooth_outline(points, steps=5):
    out=[]
    for i,p1 in enumerate(points):
        p0,p2,p3=points[i-1],points[(i+1)%len(points)],points[(i+2)%len(points)]
        for j in range(steps):
            t=j/steps
            out.append(tuple(.5*(2*p1[k]+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t) for k in range(2)))
    return out

def loft(name, points, rings, material, parent=root):
    n=len(points)
    verts=[(x*s,y*s,z) for s,z in rings for x,y in points]
    faces=[tuple(reversed(range(n))),tuple((len(rings)-1)*n+i for i in range(n))]
    faces += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)]
    m=bpy.data.meshes.new(name)
    m.from_pydata(verts,[],faces)
    m.update()
    o=bpy.data.objects.new(name,m)
    bpy.context.collection.objects.link(o)
    o.parent=parent
    m.materials.append(material)
    for f in m.polygons: f.use_smooth=len(f.vertices)==4
    n=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    n.keep_sharp=True
    return o

def boundary_distance(x,y,pts):
    best=10
    for p,q in zip(pts,pts[1:]+pts[:1]):
        dx,dy=q[0]-p[0],q[1]-p[1]
        t=max(0,min(1,((x-p[0])*dx+(y-p[1])*dy)/(dx*dx+dy*dy)))
        best=min(best,math.hypot(x-p[0]-t*dx,y-p[1]-t*dy))
    return best

def inside(x,y,pts):
    odd=False
    for p,q in zip(pts,pts[1:]+pts[:1]):
        if (p[1]>y)!=(q[1]>y) and x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0]: odd=not odd
    return odd

def shell_height(x,y):
    d=boundary_distance(x,y,shell_outline)
    roll=.135
    arc=math.sqrt(max(0,roll*roll-max(0,roll-d)**2))
    t=min(d/.24,1)
    crown=.060*max(0,1-(x/1.3)**2-(y/1.3)**2)*t*t*(3-2*t)
    return .012+arc+crown

def shell(points, material):
    global shell_outline
    shell_outline=smooth_outline([(x,y*(1.12 if a.family=='n64' else 1)) for x,y in points],8)
    pts=shell_outline
    loft('Back shell',pts,[(.91,-.16),(.95,-.145),(.98,-.105),(.995,-.06),(1,-.045)],material)
    loft('Case seam',pts,[(1,-.045),(1,-.033)],dark)
    loft('Front sidewall',pts,[(1,-.033),(1,.012)],material)
    # Constrained interior triangulation follows the concave three-prong/wing perimeter.
    verts=[Vector(v) for v in pts]
    count=len(verts)
    xmin,xmax=min(x for x,y in pts),max(x for x,y in pts)
    ymin,ymax=min(y for x,y in pts),max(y for x,y in pts)
    step=.045
    for row in range(int((ymax-ymin)/step)+1):
        y=ymin+(row+.5)*step
        for col in range(int((xmax-xmin)/step)+1):
            x=xmin+(col+.5)*step
            if inside(x,y,pts) and boundary_distance(x,y,pts)>.008: verts.append(Vector((x,y)))
    vertices,edges,faces,*_=delaunay_2d_cdt(verts,[],[list(range(count))],1,1e-7,False)
    faces=[f for f in faces if inside(sum(vertices[i].x for i in f)/len(f),sum(vertices[i].y for i in f)/len(f),pts)]
    mesh=bpy.data.meshes.new('Continuous molded convex face')
    mesh.from_pydata([(v.x,v.y,shell_height(v.x,v.y)) for v in vertices],[],faces)
    mesh.update()
    obj=bpy.data.objects.new('Continuous molded convex face',mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent=root
    mesh.materials.append(material)
    for f in mesh.polygons: f.use_smooth=True

def button(index, text, x, y, radius, material, z=.173, name=None, parent=root):
    o=pivot(name or 'button_'+str(index),(x,y,z),parent,index)
    cyl((name or str(index))+'_socket',(x,y,z-.02),radius+.01,.012,dark,parent)
    cyl('cap '+text,(0,0,0),radius,.033,material,o)
    if text: label(text,(0,0,.018),min(radius*.94,radius*1.65/len(text)),black if material in [light,yellow,green,grey] else white,o)
    return o

def dpad(x,y,r,z=.173):
    o=pivot('dpad',(x,y,z),root)
    o['controlRole']='dpad'
    w=r*.33
    pts=[(-w,r),(w,r),(w,w),(r,w),(r,-w),(w,-w),(w,-r),(-w,-r),(-w,-w),(-r,-w),(-r,w),(-w,w)]
    socket=loft('Dpad socket',pts,[(1.09,-.022),(1.09,-.010)],dark)
    socket.location=(x,y,z)
    loft('Dpad cross',pts,[(1,-.01),(1,.017),(.96,.025)],black if a.family!='n64' else light,o)
    for idx,dx,dy,direction in [(4,0,.72,'up'),(5,0,-.72,'down'),(6,-.72,0,'left'),(7,.72,0,'right')]:
        q=pivot('button_'+str(idx),(dx*r,dy*r,.029),o,idx)
        q['dpadDirection']=direction
        # Small inset bars keep each highlightable branch on the moving rocker.
        box('Directional inset '+direction,(0,0,0),(.031,.014,.002) if dx==0 else (.014,.031,.002),dark,q,.002)

def stick(name,x,y,r,material,z=.163):
    cyl(name+' octagonal gate',(x,y,z),r*1.48,.026,dark,vertices=8)
    cyl(name+' gate rim',(x,y,z+.008),r*1.32,.015,light if a.family=='n64' else indigo,vertices=8)
    cyl(name+' cup',(x,y,z+.02),r*1.13,.018,dark)
    o=pivot(name,(x,y,z+.018),root)
    o['axisIndices']=[0,1] if name=='leftStick' else [2,3]
    cyl(name+' shaft',(0,0,.066),r*.42,.12,material,o)
    if a.family=='gamecube' and name=='rightStick':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=12,radius=1)
        cap=finish(bpy.context.object,'Smooth C-stick thumb dome',(0,0,.105),material,o)
        cap.scale=(r,r,.039)
        for f in cap.data.polygons: f.use_smooth=True
    else:
        cyl(name+' thumb cap',(0,0,.13),r,.037,material,o)
    for k in range(0 if a.family=='gamecube' and name=='rightStick' else 3):
        bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=6,major_radius=r*(.44+k*.20),minor_radius=.0025)
        finish(bpy.context.object,name+' molded grip ring',(0,0,.150),material,o)
    return o

def shoulder(name,index,x,y,material,width=.35,z=.06):
    q=pivot(name,(x,y,z),root,index)
    q['hingeAxis']='X'
    box(name+' cap',(0,0,0),(width,.12,.12),material,q,.046)
    label('L' if x<0 else 'R',(0,.012,.063),.055,black,q)
    return q

def cable(y):
    box('Cable strain relief',(0,y,.01),(.09,.22,.075),dark,bevel=.02)
    for j in range(5): box('Cable relief rib',(0,y-.06+j*.03,.013),(.105,.013,.078),black,bevel=.004)

if a.family=='n64':
    shell([(-.25,.59),(-.39,.51),(-.75,.47),(-.96,.32),(-1.02,.02),(-1.01,-.43),(-.91,-.73),(-.79,-.69),(-.63,-.29),(-.50,-.22),(-.32,-.29),(-.20,-.84),(-.08,-1.06),(.06,-1.06),(.19,-.84),(.31,-.29),(.49,-.22),(.66,-.31),(.79,-.69),(.92,-.72),(1.02,-.43),(1.02,.03),(.97,.29),(.76,.46),(.40,.51),(.26,.59)],grey)
    dpad(-.67,.12,.16)
    stick('leftStick',0,-.34,.102,light)
    button(3,'START',0,.08,.071,red)
    button(0,'A',.54,-.07,.084,blue)
    button(1,'B',.40,.105,.077,green)
    for direction,x,y,axis,sign in [('up',.72,.34,3,-1),('down',.72,.095,3,1),('left',.60,.218,2,-1),('right',.84,.218,2,1)]:
        q=button({'up':16,'down':17,'left':18,'right':19}[direction],'',x,y,.055,yellow,name='c_'+direction)
        q['axisDirection']={'axis':axis,'sign':sign}
        label({'up':'^','down':'v','left':'<','right':'>'}[direction],(0,0,.019),.05,black,q)
    label('C',(.72,.22,.17),.052)
    vector_mark('nintendo.svg',.30,(0,.435,.16))
    shoulder('leftBumper',10,-.65,.47,light,.45)
    shoulder('rightBumper',11,.65,.47,light,.45)
    q=pivot('leftTrigger',(0,-.40,-.175),root,12)
    q.rotation_euler=(math.pi,0,0)
    q['hingeAxis']='X'
    box('Z rear trigger',(0,0,.015),(.18,.27,.09),light,q,.055)
    label('Z',(0,0,.063),.07,black,q)
    box('Controller Pak slot',(0,.25,-.17),(.60,.32,.033),dark,bevel=.03)
    for x,y in [(-.70,.28),(.70,.28),(-.86,-.45),(.86,-.45),(0,-.70)]: screw(x,y,-.164)
    cable(.66)
elif a.family=='gamecube':
    shell([(0,.65),(-.30,.60),(-.55,.55),(-.73,.48),(-.94,.35),(-1,.05),(-.92,-.38),(-.79,-.72),(-.66,-.76),(-.53,-.61),(-.43,-.57),(-.29,-.61),(-.17,-.51),(-.16,-.31),(0,-.15),(.16,-.31),(.17,-.51),(.29,-.61),(.43,-.57),(.53,-.62),(.67,-.77),(.8,-.71),(.94,-.33),(1,.05),(.93,.34),(.73,.48),(.55,.55),(.30,.60)],indigo)
    stick('leftStick',-.61,.12,.113,light)
    stick('rightStick',.32,-.29,.082,yellow)
    label('C',(0,0,.146),.06,black,bpy.data.objects['rightStick'])
    dpad(-.29,-.29,.115)
    button(8,'A',.62,.12,.130,green)
    button(0,'B',.385,.01,.067,red)
    for index,text,x,y,sx,sy,ang in [(9,'X',.855,.205,.110,.059,1.23),(1,'Y',.555,.345,.119,.059,.4)]:
        q=pivot('button_'+str(index),(x,y,.178),root,index)
        points=smooth_outline([(-sx*.85,-sy*.65),(-sx*.15,-sy), (sx*.75,-sy*.6),(sx,0),(sx*.75,sy*.7),(-sx*.2,sy),(-sx*.85,sy*.6),(-sx*.65,0)])
        loft(text+' kidney cap',points,[(.92,-.015),(1,.008),(.90,.028)],light,q)
        q.rotation_euler.z=ang
        label(text,(0,0,.031),.068,black,q)
    button(3,'',0,.185,.047,light)
    label('START/PAUSE',(0,.095,.16),.027,white)
    # DOL-003 official system manual: smaller spaced Nintendo over a larger wordmark.
    brand_top=label('N I N T E N D O',(0,.475,.161),.027,white)
    brand_bottom=label('GAMECUBE',(0,.416,.161),.063,white)
    bpy.context.view_layer.update()
    brand_top.scale.x=.34/brand_top.dimensions.x
    brand_bottom.scale.x=.46/brand_bottom.dimensions.x
    shoulder('leftTrigger',12,-.64,.53,light,.36)
    shoulder('rightTrigger',13,.64,.53,light,.36)
    q=pivot('rightBumper',(.83,.45,.155),root,11)
    q.rotation_euler.z=-.45
    box('Z shoulder cap',(0,0,0),(.25,.083,.044),purple,q,.032)
    label('Z',(0,0,.024),.04,white,q)
    for x,y in [(-.65,.30),(.65,.30),(-.73,-.49),(.73,-.49),(-.27,-.37),(.27,-.37)]: screw(x,y,-.164)
    cable(.74)
else:
    # Original 2004 DS. Wide lower deck, inset control panels and chunky hinge.
    box('Bottom shell',(0,-.49,-.048),(2.06,1.01,.21),silver,bevel=.10)
    box('Base joint',(0,-.49,-.040),(2.065,1.005,.015),dark,bevel=.08)
    box('Lower face',(0,-.48,.056),(2.04,.985,.09),silver,bevel=.075)
    box('Left control surround',(-.76,-.47,.109),(.42,.72,.018),light,bevel=.065)
    box('Right control surround',(.76,-.47,.109),(.42,.72,.018),light,bevel=.065)
    box('Touch bezel',(0,-.49,.114),(1.045,.79,.035),black,bevel=.015)
    box('Touch LCD',(0,-.49,.137),(.90,.675,.013),screen,bevel=.004)
    dpad(-.76,-.42,.135,.14)
    for idx,text,x,y in [(8,'A',.872,-.43),(0,'B',.755,-.55),(9,'X',.755,-.31),(1,'Y',.638,-.43)]:
        button(idx,text,x,y,.050,black,.143)
    for idx,text,x in [(2,'SELECT',.67),(3,'START',.85)]:
        q=pivot('button_'+str(idx),(x,-.18,.14),root,idx)
        box(text+' key',(0,0,0),(.12,.045,.026),black,q,.017)
        label(text,(0,.047,.02),.023,black,q)
    q=box('Power switch',(-.76,-.18,.14),(.14,.045,.024),black,bevel=.015)
    label('POWER',(-.76,-.13,.15),.023)
    for x in [.46,.52]: box('Status indicator',(x,-.92,.109),(.017,.045,.006),green,bevel=.005)
    box('GBA cartridge slot',(0,-.998,-.04),(.93,.018,.082),dark,bevel=.008)
    cyl('Microphone',(-.48,-.89,.112),.013,.006,dark,vertices=16)
    for x in [-.7,.7]: shoulder('leftBumper' if x<0 else 'rightBumper',10 if x<0 else 11,x,-.015,light,.35,-.035)
    # Lid is an actual independent hinge assembly, slightly folded toward viewer.
    lid=pivot('display_hinge',(0,.025,.045),root)
    lid.rotation_euler.x=math.radians(12)
    lid['hingeAxis']='X'
    box('Upper shell',(0,.485,0),(2.0,.94,.105),silver,lid,.075)
    box('Lid inner face',(0,.48,.051),(1.96,.90,.022),light,lid,.07)
    box('Upper bezel',(0,.49,.071),(1.08,.79,.025),black,lid,.015)
    box('Upper LCD',(0,.49,.087),(.90,.675,.013),screen,lid,.004)
    for x in [-.76,.76]:
        for row in range(5):
            for col in range(5): cyl('Speaker perforation',(x+(col-2)*.044,.39+(row-2)*.055,.067),.009,.004,dark,lid,12)
        for y in [.10,.84]: box('Lid rubber foot',(x,y,.07),(.060,.043,.012),grey,lid,.015)
    for x,width in [(-.77,.42),(0,.88),(.77,.42)]:
        q=cyl('Hinge barrel',(x,.025,.038),.082,width,silver)
        q.rotation_euler.y=math.pi/2
    label('NINTENDO DS',(0,.006,.126),.04)
    box('Rear battery cover',(0,-.52,-.159),(.97,.60,.025),silver,bevel=.022)
    box('DS cartridge slot',(0,.014,-.069),(.48,.026,.073),dark,bevel=.007)
    box('AC adapter port',(-.40,.014,-.062),(.145,.031,.069),dark,bevel=.009)
    box('AC internal contact',(-.40,.027,-.061),(.072,.006,.025),light,bevel=.003)
    box('Stylus storage recess',(.885,-.56,-.15),(.085,.73,.055),dark,bevel=.02)
    stylus=cyl('Stored original stylus',(.885,-.53,-.16),.027,.70,silver)
    stylus.rotation_euler.x=math.pi/2
    box('Stylus pull tab',(.885,-.14,-.16),(.095,.07,.050),silver,bevel=.017)
    headphone=cyl('Headphone socket',(.71,-1.002,-.045),.041,.019,dark)
    headphone.rotation_euler.x=math.pi/2
    box('Headset microphone connector',(.79,-1.002,-.045),(.08,.02,.040),dark,bevel=.007)
    box('Volume slider track',(-.72,-1.002,-.03),(.27,.016,.048),dark,bevel=.008)
    box('Volume slider',(-.72,-1.011,-.03),(.075,.024,.043),silver,bevel=.007)
    for x,y in [(-.86,-.16),(.67,-.18),(-.87,-.84),(.86,-.84),(0,-.27)]: screw(x,y,-.174)


if a.family in ['n64','gamecube']:
    if a.family=='n64':
        for obj in root.children: obj.location.y *= 1.12
    # Controls follow the local crown, retaining the cap-to-socket spacing.
    for obj in list(root.children):
        if obj.location.z < .14: continue
        x,y=obj.location.x,obj.location.y
        obj.location.z += shell_height(x,y)-.155
        e=.0005
        dx=(shell_height(x+e,y)-shell_height(x-e,y))/(2*e)
        dy=(shell_height(x,y+e)-shell_height(x,y-e))/(2*e)
        normal=Vector((-dx,-dy,1)).normalized()
        rotation=Vector((0,0,1)).rotation_difference(normal) @ obj.rotation_euler.to_quaternion()
        obj.rotation_mode='QUATERNION'
        obj.rotation_quaternion=rotation

if a.family=='nds':
    for obj in root.children_recursive:
        obj.location.y *= 1.14
        if obj.name in ['Bottom shell','Base joint','Lower face','Left control surround','Right control surround','Upper shell','Lid inner face']:
            obj.scale.y *= 1.14

world=bpy.context.scene.world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.10,.12,.16,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,xyz,power,size in [('Key',(-3,4,5),430,4),('Fill',(3,1,4),230,4),('Rim',(0,3,-2),180,3)]:
    bpy.ops.object.light_add(type='AREA',location=xyz)
    o=bpy.context.object
    o.name=name
    o.data.energy=power
    o.data.shape='DISK'
    o.data.size=size
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-.23 if a.family=='n64' else -.05,5))
camera=bpy.context.object
camera.data.type='ORTHO'
camera.data.ortho_scale=2.65 if a.family=='n64' else 2.42
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.render.resolution_x=1400
scene.render.resolution_y=1400 if a.family=='nds' else 1200
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
bpy.ops.object.select_all(action='DESELECT')
for o in [root]+list(root.children_recursive): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(a.output,a.family+'.glb'),export_format='GLB',use_selection=True,export_yup=False,export_apply=True,export_extras=True)
if a.render:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.output,a.family+'.blend'))
    scene.render.filepath=os.path.join(a.output,a.family+'-front.png')
    bpy.ops.render.render(write_still=True)
    scene.render.resolution_x=440
    scene.render.resolution_y=440 if a.family=='nds' else 377
    scene.render.filepath=os.path.join(a.output,a.family+'-settings.png')
    bpy.ops.render.render(write_still=True)
    camera.location=(2,2.5,4)
    direction=(Vector((0,-.07,0))-camera.location).normalized()
    right=direction.cross(Vector((0,1,0))).normalized()
    up=right.cross(direction)
    camera.rotation_euler=Matrix((right,up,-direction)).transposed().to_euler()
    camera.data.ortho_scale=2.6
    scene.render.filepath=os.path.join(a.output,a.family+'-angle.png')
    bpy.ops.render.render(write_still=True)
    if a.family in ['n64','gamecube','nds']:
        camera.location=(1,1,-4)
        direction=(Vector((0,-.07,0))-camera.location).normalized()
        right=direction.cross(Vector((0,1,0))).normalized()
        up=right.cross(direction)
        camera.rotation_euler=Matrix((right,up,-direction)).transposed().to_euler()
        scene.render.filepath=os.path.join(a.output,a.family+'-rear.png')
        bpy.ops.render.render(write_still=True)
print('RETRO_COMPLETE',a.family)
