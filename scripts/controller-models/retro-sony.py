"""Original PS1 DualShock and PSP-1000 geometry, covered by the repository MIT license.
Visual reference: official Sony manuals. No third-party controller meshes. PD-textlogo outlines and original grain normals.
Blender +Z front, +Y top. Libretro gamepadButtonIndex extras, movable cap descendants.
"""
import argparse
import bpy
import json
import math
import os
import sys
import random
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from svg_paths import normalized_svg_contours
parser=argparse.ArgumentParser()
parser.add_argument('--family',choices=['psx','psp'],required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
OUT=os.path.abspath(args.output)
os.makedirs(OUT,exist_ok=True)
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

root=pivot('controller_root')

def mesh_object(name, vertices, faces, mat, parent=root, location=(0, 0, 0), smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    mesh.materials.append(mat)
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

def boundary_distance(x, y, coords):
    result = float('inf')
    for a,b in zip(coords,coords[1:]+coords[:1]):
        dx,dy=b[0]-a[0],b[1]-a[1]
        t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
        result=min(result,math.hypot(x-a[0]-t*dx,y-a[1]-t*dy))
    return result

def inside(x, y, coords):
    odd=False
    for a,b in zip(coords,coords[1:]+coords[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            odd=not odd
    return odd

def curved_surface(name, coords, height_function, mat, step=.035, zones=()):
    # Constrained triangulation creates a regular interior surface, instead of a flat ngon.
    area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(coords,coords[1:]+coords[:1]))
    if area<0:coords=list(reversed(coords))
    points=[Vector(point) for point in coords]
    count=len(points)
    constraint_edges=[]
    for zone_coords,zone_material in zones:
        start=len(points)
        points.extend(Vector(point) for point in zone_coords)
        constraint_edges.extend((start+i,start+(i+1)%len(zone_coords)) for i in range(len(zone_coords)))
    xmin,xmax=min(p[0] for p in coords),max(p[0] for p in coords)
    ymin,ymax=min(p[1] for p in coords),max(p[1] for p in coords)
    for row in range(int((ymax-ymin)/step)+1):
        y=ymin+(row+.5)*step
        for col in range(int((xmax-xmin)/step)+1):
            x=xmin+(col+.5)*step
            if inside(x,y,coords) and boundary_distance(x,y,coords)>.008:
                points.append(Vector((x,y)))
    vertices,edges,faces,*_=delaunay_2d_cdt(points,constraint_edges,[list(range(count))],1,1e-7,False)
    faces=[face for face in faces if inside(sum(vertices[i].x for i in face)/len(face),sum(vertices[i].y for i in face)/len(face),coords)]
    obj=mesh_object(name,[(v.x,v.y,height_function(v.x,v.y)) for v in vertices],faces,mat)
    for zone_coords,zone_material in zones:
        if zone_material.name not in [m.name for m in obj.data.materials]:
            obj.data.materials.append(zone_material)
        material_index=[m.name for m in obj.data.materials].index(zone_material.name)
        for polygon in obj.data.polygons:
            x=sum(obj.data.vertices[i].co.x for i in polygon.vertices)/len(polygon.vertices)
            y=sum(obj.data.vertices[i].co.y for i in polygon.vertices)/len(polygon.vertices)
            if inside(x,y,zone_coords):polygon.material_index=material_index
    return obj

PSX=args.family=='psx'
shell=material('Warm grey ABS' if PSX else 'Piano black polycarbonate',(.43,.445,.43) if PSX else (.009,.011,.013),.51 if PSX else .23)
rear=material('Rear molded polymer',(.34,.36,.35) if PSX else (.016,.019,.022),.7)
black=material('Charcoal buttons',(.025,.03,.036),.42 if PSX else .22)
rubber=material('Textured analog rubber',(.018,.021,.022),.91)
seam=material('Recessed shell joint',(.005,.007,.008),.75)
ink=material('Printed white legends',(.72,.73,.71),.55)
darkink=material('Printed dark legends',(.035,.055,.075),.65)
silver=material('Satin silver edge rail',(.36,.4,.42),.33,.7)

def control(name,index,loc):
    p=pivot(name,root,loc)
    p['gamepadButtonIndex']=index
    p['buttonIndex']=index
    return p

def brand(name,filename,width,loc,mat,parent=root,keep=None):
    contours=normalized_svg_contours(os.path.join(os.path.dirname(__file__),'logos',filename+'-flat.svg'),keep_subpaths=keep)
    c=bpy.data.curves.new(name,'CURVE')
    c.dimensions='2D'
    c.fill_mode='BOTH'
    c.resolution_u=2
    for points in contours:
        spline=c.splines.new('POLY')
        spline.points.add(len(points)-1)
        for p,(x,y) in zip(spline.points,points):p.co=(x*width,y*width,0,1)
        spline.use_cyclic_u=True
    o=bpy.data.objects.new(name,c)
    bpy.context.collection.objects.link(o)
    o.parent=parent
    o.location=loc
    c.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH')
    return o

def line(name,points,mat,parent=root,width=.003):
    c=bpy.data.curves.new(name,'CURVE')
    c.dimensions='3D'
    c.bevel_depth=width
    c.bevel_resolution=2
    s=c.splines.new('POLY')
    s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,c)
    bpy.context.collection.objects.link(o)
    o.parent=parent
    c.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH')
    return o

def dots(name,points,radius,mat,parent=root):
    vertices=[]
    faces=[]
    for x,y,z in points:
        n=len(vertices)
        vertices.extend((x+radius*math.cos(i*math.tau/8),y+radius*math.sin(i*math.tau/8),z) for i in range(8))
        faces.append(tuple(range(n,n+8)))
    return mesh_object(name,vertices,faces,mat,parent,smooth=False)

def ring(name,location,radius,minor,mat,parent=root):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,location=location,major_radius=radius,minor_radius=minor)
    o=bpy.context.object
    o.name=name
    o.parent=parent
    o.data.materials.append(mat)
    for face in o.data.polygons:face.use_smooth=True
    return o

def symbol(parent,kind,radius,z,colored):
    colors={'triangle':(.1,.52,.40),'circle':(.76,.12,.15),'cross':(.25,.42,.72),'square':(.70,.30,.51)}
    m=material(kind+' symbol',colors[kind],.5) if colored else ink
    r=radius*.48
    if kind=='triangle':points=[(-r,-r*.72,z),(r,-r*.72,z),(0,r,z),(-r,-r*.72,z)]
    elif kind=='square':points=[(-r,-r,z),(r,-r,z),(r,r,z),(-r,r,z),(-r,-r,z)]
    elif kind=='circle':points=[(r*math.cos(i*math.tau/36),r*math.sin(i*math.tau/36),z) for i in range(37)]
    else:
        line('Cross stroke 1',[(-r,-r,z),(r,r,z)],m,parent,.003)
        points=[(-r,r,z),(r,-r,z)]
    line(kind+' inlay',points,m,parent,.003)

def face_buttons(cx,cy,spacing,radius,z):
    for name,index,dx,dy in [('cross',0,0,-spacing),('square',1,-spacing,0),('circle',8,spacing,0),('triangle',9,0,spacing)]:
        cylinder(name+' stationary socket',(cx+dx,cy+dy,z-.009),radius*1.09,.018,seam)
        p=control('button_'+str(index),index,(cx+dx,cy+dy,z))
        lathe(name+' molded cap',[(radius*.98,-.005),(radius,.011),(radius*.98,.032),(radius*.86,.037),(0,.040)],black,p,48)
        symbol(p,name,radius,.040,PSX)

def cross_field(name,cx,cy,z,reach,arm,mat):
    points=[(-arm,reach),(arm,reach),(arm,arm),(reach,arm),(reach,-arm),(arm,-arm),(arm,-reach),(-arm,-reach),(-arm,-arm),(-reach,-arm),(-reach,arm),(-arm,arm)]
    rounded(loft(name,points,[(1,0),(1,.003)],mat,location=(cx,cy,z)),.008)

def directions(cx,cy,z,scale=1):
    rocker=pivot('dpad',root,(cx,cy,z))
    rocker['controlRole']='dpad'
    for index,direction,x,y,angle in [(4,'up',0,.106,0),(5,'down',0,-.106,math.pi),(6,'left',-.106,0,math.pi/2),(7,'right',.106,0,-math.pi/2)]:
        p=pivot('button_'+str(index),rocker,(x*scale,y*scale,0))
        p['gamepadButtonIndex']=index
        p['buttonIndex']=index
        p['dpadDirection']=direction
        p.rotation_euler.z=angle
        coords=[(-.05,.057),(.05,.057),(.05,-.018),(0,-.063),(-.05,-.018)]
        coords=[(x*scale,y*scale) for x,y in coords]
        rounded(loft(direction+' cap',coords,[(1,0),(1,.026),(.91,.034)],black,p),.006,3)
        line(direction+' arrow',[(-.021*scale,0,.036),(0,.023*scale,.036),(.021*scale,0,.036)],ink if not PSX else darkink,p,.002)

if PSX:
    # Original DualShock: compact circular shoulders, outward drooping handles,
    # lower twin stick pods, center analog switch and short cable strain relief.
    pts=[(0,.43),(-.42,.43),(-.47,.49),(-.7,.50),(-.84,.40),(-.93,.20),(-.975,-.12),(-1.0,-.43),(-.94,-.59),(-.80,-.65),(-.65,-.57),(-.47,-.40),(-.33,-.40),(-.17,-.32),(0,-.32)]
    pts+= [(-x,y) for x,y in reversed(pts[1:-1])]
    outline=curve_outline(pts,5)
    loft('Rear grip shell',outline,[(.92,-.22),(.98,-.16),(1,-.055)],rear)
    loft('Perimeter parting line',outline,[(1,-.053),(1,-.041)],seam)
    loft('Upper shell wall',outline,[(1,-.04),(1,.006)],shell)
    def height(x,y):
        d=boundary_distance(x,y,outline)
        return .006+math.sqrt(max(0,.12**2-max(0,.12-d)**2))
    curved_surface('Continuous sculpted face',outline,height,shell,step=.034)
    for side,x in [('left',-.62),('right',.62)]:
        cylinder(side+' circular control mounting',(x,.095,.117),.318,.027,shell)
        ring(side+' perimeter molding',(x,.095,.132),.307,.0035,rear)
    recess=material('Recessed control fields',(.365,.386,.377),.57)
    cross_field('Directional recessed cross',-.62,.095,.132,.226,.084,recess)
    cross_field('Face recessed cross',.62,.095,.132,.252,.094,recess)
    directions(-.62,.095,.143)
    face_buttons(.62,.095,.153,.079,.147)
    for side,x,index,axes in [('left',-.31,14,[0,1]),('right',.31,15,[2,3])]:
        cylinder(side+' analog pod',(x,-.215,.12),.205,.13,shell)
        ring(side+' analog well edge',(x,-.215,.191),.152,.010,rear)
        cylinder(side+' dark socket',(x,-.215,.191),.151,.011,seam)
        stick=pivot(side+'Stick',root,(x,-.215,.185))
        stick['axisIndices']=axes
        press=pivot(side+'Stick_press',stick)
        press['gamepadButtonIndex']=index
        press['buttonIndex']=index
        lathe(side+' rubber stick dome',[(.058,0),(.060,.061),(.125,.069),(.140,.085),(.139,.123),(.114,.142),(.061,.150),(0,.152)],rubber,press,48)
        ring(side+' rubber rim',(0,0,.109),.136,.004,rubber,press)
    select=control('button_2',2,(-.18,.04,.15))
    rectangle('Select rubber cap',(0,0,0),.095,.043,.026,.012,black,select)
    start=control('button_3',3,(.18,.04,.15))
    rounded(loft('Start triangular rubber cap',[(-.04,-.027),(.043,0),(-.04,.027)],[(1,-.012),(1,.014)],black,start),.005)
    text_mesh('Select label','SELECT',(-.18,-.016,.15),.028,darkink)
    text_mesh('Start label','START',(.18,-.016,.15),.028,darkink)
    rectangle('Analog selector inset',(0,-.091,.148),.15,.065,.008,.014,rear)
    rectangle('Analog selector rubber',(0,-.091,.163),.115,.042,.02,.012,black)
    text_mesh('Analog legend','ANALOG',(0,-.041,.154),.026,darkink)
    rectangle('Analog red indicator',(0,-.150,.161),.045,.024,.005,.004,material('Analog status red',(.64,.012,.009),.24))
    brand('Sony word mark','sony',.27,(0,.335,.137),darkink)
    brand('PlayStation emblem','playstation-retro',.076,(0,.243,.140),darkink,keep=3)
    brand('PlayStation wordmark','playstation-wordmark',.164,(0,.181,.141),darkink)
    for side,x in [('left',-.62),('right',.62)]:
        for suffix,index,y,z in [('1',10 if side=='left' else 11,.462,.13),('2',12 if side=='left' else 13,.524,.055)]:
            p=control('button_'+str(index),index,(x,y,z))
            rectangle(side+' shoulder '+suffix,(0,0,0),.268,.075,.065,.03,black,p)
            text_mesh(side+' shoulder legend '+suffix,('L' if side=='left' else 'R')+suffix,(0,0,.034),.027,ink,p)
    cable=rectangle('Cable strain relief',(0,.477,-.05),.055,.115,.072,.02,black)
    for y in [.44,.462,.484,.506]:rectangle('Cable collar',(0,y,-.046),.068,.007,.081,.003,black)
else:
    # PSP-1000 front layout from Sony manual p20. Wide 16:9 display, one sliding
    # nub below D-pad, lower utility strip, clear shoulders, thick silver rail.
    outline=curve_outline([(-.78,.433),(-.91,.37),(-1.0,.18),(-1.017,0),(-.987,-.23),(-.9,-.403),(-.78,-.433),(-.4,-.433),(0,-.433),(.4,-.433),(.78,-.433),(.9,-.403),(.987,-.23),(1.017,0),(1,.18),(.91,.37),(.78,.433),(.4,.433),(0,.433),(-.4,.433)],6)
    loft('Thick rear PSP1000 shell',outline,[(.97,-.155),(1,-.105),(1,-.01)],rear)
    loft('Silver center rail',outline,[(1.003,-.063),(1.003,-.030)],silver)
    loft('Front gloss perimeter',outline,[(1,-.025),(1,.033),(.98,.075)],shell)
    rectangle('Screen recessed gasket',(0,.04,.080),1.163,.678,.017,.016,seam)
    rectangle('Screen glass bezel',(0,.04,.092),1.136,.65,.012,.010,black)
    screen=material('Unlit dark LCD glass',(.011,.02,.025),.18,.15)
    rectangle('16 by 9 LCD',(0,.04,.102),1.113,.626,.010,.002,screen)
    # No fake second analog stick, touchscreen, or PSP-3000 face speaker pattern.
    control_field=shell
    cylinder('Directional round field',(-.788,.07,.074),.176,.003,control_field)
    cylinder('Face round field',(.788,.07,.074),.185,.003,control_field)
    directions(-.788,.07,.09,.95)
    face_buttons(.788,.07,.127,.061,.09)
    cylinder('Analog nub recess',(-.776,-.245,.088),.072,.01,seam)
    nub=pivot('leftStick',root,(-.776,-.245,.104))
    nub['axisIndices']=[0,1]
    nub['axisMode']='translate'
    nub['axisTravel']=.022
    lathe('Low profile analog nub',[(.060,-.009),(.062,.014),(.055,.024),(0,.025)],rubber,nub,48)
    knurls=[]
    for i in range(-5,6):
        for j in range(-5,6):
            x,y=i*.009,j*.009
            if x*x+y*y<.048**2:
                knurls.append((x,y,.026))
    dots('Nub grip texture',knurls,.0026,black,nub)
    brand('Sony word mark','sony',.175,(.803,.321,.089),ink)
    brand('PlayStation emblem','playstation-retro',.060,(-.879,.303,.089),ink,keep=3)
    brand('PSP wordmark','psp',.28,(0,-.355,.085),ink)
    for index,x,label in [(2,.455,'SELECT'),(3,.59,'START')]:
        p=control('button_'+str(index),index,(x,-.367,.093))
        rectangle(label+' cap',(0,0,0),.105,.037,.015,.017,black,p)
        text_mesh(label+' legend',label,(0,0,.010),.015,ink,p)
    for x,label in [(-.56,'HOME'),(-.40,'−'),(-.27,'+'),(.235,'□'),(.325,'♪')]:
        rectangle(label+' utility cap',(x,-.367,.093),.095 if label=='HOME' else .055,.038,.014,.017,black)
        text_mesh(label+' utility label',label,(x,-.367,.102),.015 if label=='HOME' else .023,ink)
    text_mesh('Volume legend','VOL',(-.335,-.367,.092),.013,ink)
    for side,x,index in [('left',-.80,10),('right',.80,11)]:
        p=control('button_'+str(index),index,(x,.41,.009))
        rectangle(side+' clear shoulder',(0,0,0),.246,.068,.085,.028,silver,p)
        text_mesh(side+' shoulder label','L' if side=='left' else 'R',(0,0,.044),.026,ink,p)
    for x in [-.66,.66]:
        cylinder('Bottom speaker opening',(x,-.308,.085),.012,.002,seam)
    for x,y,color in [(-.947,-.166,(.85,.48,.03)),(-.922,-.247,(.03,.43,.32)),(.95,-.155,(.03,.43,.32)),(.95,-.246,(.75,.65,.05))]:
        cylinder('Status light',(x,y,.075),.006,.004,material('Status '+str(x)+' '+str(y),color,.4))
    text_mesh('Power label','POWER',(.889,-.153,.081),.015,material('Power teal print',(.04,.40,.33),.5))
    text_mesh('Hold label','HOLD',(.893,-.246,.081),.014,ink)
    # Top and bottom ports are oriented into the edge, from manual p21/22.
    top=pivot('Top edge ports',root,(0,.435,-.048))
    top.rotation_euler.x=-math.pi/2
    rectangle('Mini USB metal surround',(0,0,0),.125,.060,.006,.010,silver,top)
    rectangle('Mini USB dark opening',(0,0,.004),.095,.037,.006,.008,seam,top)
    rectangle('Mini USB contact tongue',(0,-.004,.008),.060,.009,.003,.002,black,top)
    rectangle('Infrared window',(-.43,0,.005),.12,.04,.006,.015,seam,top)
    rectangle('UMD open slide',(.41,0,.005),.11,.037,.008,.010,black,top)
    text_mesh('UMD slide legend','OPEN',(.41,0,.010),.018,ink,top)
    for x in [-.21,.21]:cylinder('USB mount screw',(x,0,.005),.014,.003,seam,top)
    bottom=pivot('Bottom edge ports',root,(0,-.434,-.06))
    bottom.rotation_euler.x=math.pi/2
    cylinder('Headphone metal rim',(-.79,0,.002),.023,.006,silver,bottom)
    cylinder('Headphone socket',(-.79,0,.007),.017,.007,seam,bottom)
    rectangle('Headphone remote socket',(-.715,0,.004),.063,.027,.008,.004,seam,bottom)
    cylinder('Yellow DC input rim',(.79,0,.003),.025,.006,material('DC yellow ring',(.7,.49,.04),.45),bottom)
    cylinder('DC power socket',(.79,0,.007),.017,.007,seam,bottom)
    for x in [.745,.8]:rectangle('Charging contacts',(x,-.044,.002),.015,.02,.004,.002,silver,bottom)
    for x in [-.445,.445]:line('Rear panel seam',[(x,-.40,-.16),(x,.40,-.16)],seam,width=.0015)
    ring('Rear UMD drive ring',(0,0,-.157),.275,.011,silver)
    cylinder('Rear UMD door',(0,0,-.155),.264,.012,rear)
    back_label=brand('Rear PSP mark','psp',.30,(0,0,-.165),ink)
    back_label.rotation_euler.y=math.pi
    for side,x in [('WLAN',-1.007),('POWER HOLD',1.007)]:
        panel=pivot(side+' side control',root,(x,-.20,-.045))
        panel.rotation_euler.y=(-math.pi/2 if x<0 else math.pi/2)
        rectangle(side+' slide recess',(0,0,0),.075,.155,.008,.022,seam,panel)
        rectangle(side+' slide cap',(0,.025,.007),.055,.075,.018,.015,black,panel)
        for y in [.009,.024,.039]:rectangle(side+' slide grip',(0,y,.018),.041,.004,.002,.001,rear,panel)
    # Fine top ventilation and bottom panel seam are geometry, no baked textures.
    dots('Top perforations',[(-.66+i*.019,.371+row*.012,.078) for row in range(3) for i in range(69)],.0025,seam)
    line('Lower face seam',[(-.88,-.402,.070),(-.70,-.402,.070),(-.66,-.427,.069),(.65,-.427,.069),(.70,-.37,.078),(.91,-.37,.070)],silver,width=.002)

# A tiny original packed tangent normal tile supplies micrograin only to the
# matte PS1 grip rubber/ABS. The PSP piano-black front remains untextured gloss.
if PSX:
    size=128
    rng=random.Random(1997)
    heights=[rng.random() for _ in range(size*size)]
    pixels=[]
    for y in range(size):
        for x in range(size):
            dx=heights[y*size+(x+1)%size]-heights[y*size+(x-1)%size]
            dy=heights[((y+1)%size)*size+x]-heights[((y-1)%size)*size+x]
            v=Vector((-dx*.9,-dy*.9,1)).normalized()
            pixels.extend((v.x*.5+.5,v.y*.5+.5,v.z*.5+.5,1))
    tile=bpy.data.images.new('Original molded micrograin',width=size,height=size,alpha=False)
    tile.colorspace_settings.name='Non-Color'
    tile.pixels=pixels
    tile.pack()
    for mat,strength in [(rubber,.26),(shell,.085),(rear,.085)]:
        nodes=mat.node_tree.nodes
        tex=nodes.new('ShaderNodeTexImage')
        tex.image=tile
        tex.interpolation='Linear'
        normal=nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value=strength
        mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color'])
        mat.node_tree.links.new(normal.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
    for o in root.children_recursive:
        if o.type=='MESH' and any(m in [rubber,shell,rear] for m in o.data.materials):
            uv=o.data.uv_layers.active or o.data.uv_layers.new(name='MicrograinUV')
            for loop in o.data.loops:
                co=o.data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv=(co.x*7,co.y*7)

root['assetFamily']=args.family
root['inputSpace']='libretro'
root['provenance']='Original controller geometry and grain under MIT; Sony/PS/PSP vector marks are verified Commons PD-textlogo, trademark rights retained'
world=bpy.context.scene.world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.17,.2,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,power,size in [('Key',(-3,4,5),420,4),('Fill',(3,1,4),180,4),('Rim',(0,3,2),130,2)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object
    o.name=name
    o.data.energy=power
    o.data.shape='DISK'
    o.data.size=size
    o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,0,5))
camera=bpy.context.object
camera.data.type='ORTHO'
camera.data.ortho_scale=2.32
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
bpy.ops.object.select_all(action='DESELECT')
for o in root.children_recursive+[root]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,args.family+'.glb'),export_format='GLB',use_selection=True,export_yup=False,export_apply=True,export_extras=True)
manifest={'family':args.family,'front':'+Z','top':'+Y','controls':[{'name':o.name,'extras':dict(o.items())} for o in root.children_recursive if o.type=='EMPTY']}
with open(os.path.join(OUT,args.family+'-manifest.json'),'w') as f:json.dump(manifest,f,indent=2,default=list)
if args.render:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,args.family+'.blend'))
    for suffix,w,h,loc in [('front',1400,1000,(0,0,5)),('settings',440,314,(0,0,5)),('oblique',1400,1000,(0,2,5))]:
        camera.location=loc
        camera.rotation_euler=(-math.atan2(loc[1],loc[2]),0,0)
        scene.render.resolution_x=w
        scene.render.resolution_y=h
        scene.render.filepath=os.path.join(OUT,args.family+'-'+suffix+'.png')
        bpy.ops.render.render(write_still=True)
print('SONY_RETRO_COMPLETE',args.family)
