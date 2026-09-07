"""Original articulated Genesis six-button, Saturn Model 2, and generic arcade controllers.

Generated geometry is covered by the repository MIT license. Reference and
vector-mark source rights are documented in retro-sega-provenance.md."""
import argparse
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

parser = argparse.ArgumentParser()
parser.add_argument('--family', choices=['genesis', 'saturn', 'arcade'], required=True)
parser.add_argument('--output', default=os.path.dirname(os.path.abspath(__file__)))
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
OUT = os.path.abspath(args.output)
os.makedirs(OUT, exist_ok=True)
FAMILY = args.family
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from svg_paths import path_contours
import xml.etree.ElementTree as ET
import re
LOGOS=os.path.join(os.path.dirname(os.path.abspath(__file__)),'logos')
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


shell = material('Charcoal molded polymer', (.012, .014, .018), .62)
back = material('Black rear and inner grip', (.008, .01, .013), .72)
seam = material('Recessed joint', (.003, .004, .005), .88)
rubber = material('Fine textured black rubber', (.006, .008, .01), .92)
white = material('Cool ivory white shell', (.69, .72, .79), .58)
clear_white = material('Pearlescent white controls', (.71, .74, .80), .27)
glyph = material('Soft grey printed symbols', (.30, .33, .39), .48)
black_cap = material('Gloss black face caps', (.002, .003, .004), .12)
dpad_material = material('Satin black directional dish', (.008, .01, .013), .60)
legend_white = material('Light printed legends', (.6, .65, .7), .5)
face_colors = [material('A green', (.20, .76, .035), .38), material('B red', (.78, .025, .024), .38), material('X blue', (.025, .42, .82), .38), material('Y yellow', (.87, .82, .012), .38)]


def pivot(name, parent=None, location=(0, 0, 0), button=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    if button is not None:
        obj['gamepadButtonIndex'] = button
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


def shell_height(x,y):
    distance=boundary_distance(x,y,outline)
    roll=.095
    arc=math.sqrt(max(0,roll*roll-max(0,roll-distance)**2))
    t=min(distance/.23,1)
    crown=.022*max(0,1-(x/1.2)**2-(y/.95)**2)*t*t*(3-2*t)
    return .012+arc+crown


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


def printed_vector(name, filename, width, x, y, mat):
    """Use licensed source outlines with holes retained, projected to the shell."""
    source = ET.parse(os.path.join(LOGOS, filename)).getroot()
    contours = []
    for element in source.iter():
        if element.tag.endswith('path'):
            contours.extend(path_contours(element.attrib['d'], steps=6))
        elif element.tag.endswith('polygon'):
            values = [float(n) for n in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',element.attrib['points'])]
            contours.append(list(zip(values[::2],values[1::2])))
        elif element.tag.endswith('rect'):
            rx, ry = float(element.get('x','0')),float(element.get('y','0'))
            rw,rh = float(element.get('width','0')),float(element.get('height','0'))
            points = [(rx,ry),(rx+rw,ry),(rx+rw,ry+rh),(rx,ry+rh)]
            if element.get('transform'):
                values=[float(n) for n in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',element.attrib['transform'])]
                a,b,c,d,e,f=values
                points=[(a*px+c*py+e,b*px+d*py+f) for px,py in points]
            contours.append(points)
    all_points=[p for contour in contours for p in contour]
    xmin,xmax=min(p[0] for p in all_points),max(p[0] for p in all_points)
    ymin,ymax=min(p[1] for p in all_points),max(p[1] for p in all_points)
    scale=width/(xmax-xmin)
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='2D'
    curve.fill_mode='BOTH'
    for points in contours:
        spline=curve.splines.new('POLY')
        spline.points.add(len(points)-1)
        for point,(px,py) in zip(spline.points,points):
            point.co=((px-(xmin+xmax)/2)*scale+x,((ymin+ymax)/2-py)*scale+y,0,1)
        spline.use_cyclic_u=True
    obj=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(obj)
    obj.parent=root
    curve.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    for iteration in range(3):
        edges=[edge for edge in bm.edges if edge.calc_length()>.012]
        if not edges:
            break
        bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0000001)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=0.0000001)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate()
    obj.data.update()
    for vertex in obj.data.vertices:
        vertex.co.z=shell_height(vertex.co.x,vertex.co.y)+.0015
    for polygon in obj.data.polygons:
        polygon.use_smooth=True
    return obj


def seat(obj):
    """Align a control pivot with the shell's local tangent while retaining its origin."""
    if FAMILY=='arcade':
        obj.location.z += .025
        return
    x,y=obj.location.x,obj.location.y
    obj.location.z += shell_height(x,y)-.13
    epsilon=.0005
    dx=(shell_height(x+epsilon,y)-shell_height(x-epsilon,y))/(2*epsilon)
    dy=(shell_height(x,y+epsilon)-shell_height(x,y-epsilon))/(2*epsilon)
    normal=Vector((-dx,-dy,1)).normalized()
    rotation=Vector((0,0,1)).rotation_difference(normal) @ obj.rotation_euler.to_quaternion()
    obj.rotation_mode='QUATERNION'
    obj.rotation_quaternion=rotation


def action_button(index,label,x,y,radius,mat,legend_mat=legend_white):
    socket=pivot('button_%d_socket_pivot'%index,root,(x,y,.13))
    cylinder('button_%d_socket'%index,(0,0,0),radius+.009,.016,seam,socket)
    seat(socket)
    button=pivot('button_%d'%index,root,(x,y,.141),index)
    lathe('button_%d_cap'%index,[(.001,.025),(radius*.6,.024),(radius*.90,.021),(radius,.012),(radius,-.008)],mat,button,48)
    if label:
        glyph_obj=text_mesh('button_%d_legend'%index,label,(0,0,.027),radius*1.1,legend_mat,button)
        # Small legends remain within the shallow central crown of the cap.
        for vertex in glyph_obj.data.vertices:
            vertex.co.z-=.006*(math.hypot(vertex.co.x,vertex.co.y)/radius)**2
    seat(button)
    return button


def dpad(x,y):
    socket=pivot('dpad_socket_pivot',root,(x,y,.13))
    cylinder('dpad_socket',(0,0,0),.236,.018,seam,socket)
    lathe('dpad_socket_rim',[(.225,0),(.243,0),(.247,.010),(.237,.022),(.225,.022)],back,socket)
    seat(socket)
    rocker=pivot('dpad',root,(x,y,.151))
    rocker['controlRole']='dpad'
    # A single molded eight-way disc, not a square cross layered over a disk.
    # The cardinal ridges meet the circular perimeter. Diagonal finger sectors
    # are concave, and the center dimple is part of the surface itself.
    radius=.219
    def disc_height(px,py):
        r=math.hypot(px,py)
        minor=min(abs(px),abs(py))
        arm_width=.053 if FAMILY=='genesis' else .059
        cardinal=1/(1+math.exp(max(-60,min(60,(minor-arm_width)/.005))))
        rim=math.exp(-((r-radius)/.012)**2)
        center=math.exp(-(r/.029)**4)
        diagonal_bowl=.005*math.exp(-((r-.145)/.055)**2)*(1-cardinal)
        return .024+.015*cardinal-.013*rim-.011*center-diagonal_bowl
    segments=96
    ring_radii=[radius*i/34 for i in range(1,35)]
    vertices=[(0,0,disc_height(0,0))]
    for r in ring_radii:
        for i in range(segments):
            theta=i*math.tau/segments
            px,py=r*math.cos(theta),r*math.sin(theta)
            vertices.append((px,py,disc_height(px,py)))
    faces=[(0,1+i,1+(i+1)%segments) for i in range(segments)]
    for ring in range(len(ring_radii)-1):
        for i in range(segments):
            a=1+ring*segments+i
            b=1+ring*segments+(i+1)%segments
            c=1+(ring+1)*segments+(i+1)%segments
            d=1+(ring+1)*segments+i
            faces.append((a,d,c,b))
    lower_start=len(vertices)
    for i in range(segments):
        theta=i*math.tau/segments
        vertices.append((radius*math.cos(theta),radius*math.sin(theta),-.01))
    upper_start=1+(len(ring_radii)-1)*segments
    for i in range(segments):
        j=(i+1)%segments
        faces.append((upper_start+i,lower_start+i,lower_start+j,upper_start+j))
    faces.append(tuple(reversed(range(lower_start,lower_start+segments))))
    disc=mesh_object('dpad_molded_eight_way_disc',vertices,faces,dpad_material,rocker)
    # Correct face winding explicitly for the smoothly joined circular cap.
    bm=bmesh.new()
    bm.from_mesh(disc.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(disc.data)
    bm.free()
    for index,dx,dy,rotation,direction in [(4,0,.151,0,'up'),(5,0,-.151,math.pi,'down'),(6,-.151,0,math.pi/2,'left'),(7,.151,0,-math.pi/2,'right')]:
        child=pivot('button_%d'%index,rocker,(dx,dy,0),index)
        child['dpadDirection']=direction
        child.rotation_euler.z=rotation
        local=[]
        for px,py in [(-.10,-.014),(-.086,-.036),(-.114,-.036)]:
            rx=dx+px*math.cos(rotation)-py*math.sin(rotation)
            ry=dy+px*math.sin(rotation)+py*math.cos(rotation)
            local.append((px,py,disc_height(rx,ry)+.0006))
        mesh_object('direction_'+direction,local,[(0,1,2)],embossed,child,smooth=False)
    seat(rocker)


if FAMILY=='genesis':
    points=[(0,.49),(-.3,.485),(-.55,.43),(-.78,.30),(-.96,.08),(-1,-.15),(-.93,-.35),(-.78,-.41),(-.61,-.38),(-.33,-.24),(0,-.22),(.33,-.24),(.61,-.38),(.78,-.41),(.93,-.35),(1,-.15),(.96,.08),(.78,.30),(.55,.43),(.3,.485)]
elif FAMILY=='saturn':
    points=[(0,.44),(-.28,.46),(-.52,.55),(-.70,.50),(-.87,.32),(-.98,.09),(-1,-.19),(-.90,-.39),(-.73,-.43),(-.55,-.36),(-.30,-.23),(0,-.19),(.30,-.23),(.55,-.36),(.73,-.43),(.90,-.39),(1,-.19),(.98,.09),(.87,.32),(.70,.50),(.52,.55),(.28,.46)]
else:
    points=[(-.94,.55),(.94,.55),(1,.49),(1,-.49),(.94,-.55),(-.94,-.55),(-1,-.49),(-1,.49)]
if FAMILY!='arcade':
    points=[(x,y*(1.20 if FAMILY=='genesis' else 1.15)) for x,y in points]
outline=curve_outline(points,6)
if FAMILY=='arcade':
    outline=[]
    for cx,cy,start in [(.94,.49,0),(-.94,.49,90),(-.94,-.49,180),(.94,-.49,270)]:
        for step in range(12):
            angle=math.radians(start+step*90/11)
            outline.append((cx+.06*math.cos(angle),cy+.06*math.sin(angle)))
shell=material('Black textured ABS shell',(.010,.012,.014),.66)
gloss=material('Polished black face inset',(.005,.006,.007),.28)
button_black=material('Molded black caps',(.012,.014,.017),.46)
button_grey=material('Upper row graphite caps',(.067,.071,.080),.45)
embossed=material('Embossed dark cap legends',(.006,.008,.010),.62)
loft('shell_lower',outline,[(.93,-.15),(.985,-.115),(1,-.055),(1,-.025)],back)
loft('shell_seam',outline,[(1,-.024),(1,-.013)],seam)
loft('shell_edge',outline,[(1,-.012),(1,.012)],shell)
if FAMILY=='genesis':
    zones=[([(x+.34*math.cos(i*math.tau/72),y+.30*math.sin(i*math.tau/72)) for i in range(72)],gloss) for x,y in [(-.53,.105),(.48,.035)]]
elif FAMILY=='saturn':
    face_points=[(-.60,.41),(-.28,.39),(0,.36),(.38,.34),(.74,.29),(.87,.05),(.87,-.22),(.71,-.33),(.43,-.23),(0,-.10),(-.36,-.17),(-.61,-.30),(-.82,-.22),(-.84,.01),(-.75,.25)]
    zones=[(curve_outline(face_points),gloss)]
else:
    zones=[]
curved_surface('shell_surface',outline,shell_height,shell,zones=zones)
if FAMILY in ['genesis','saturn']:
    dpad(-.53,.13 if FAMILY=='genesis' else .09)
    mapping={'A':1,'B':0,'C':8,'X':10,'Y':9,'Z':11} if FAMILY=='genesis' else {'A':0,'B':8,'C':11,'X':1,'Y':9,'Z':10}
    positions=[('A',.27,-.11,.080),('B',.51,-.065,.080),('C',.73,-.005,.080),('X',.245,.125,.062),('Y',.47,.185,.062),('Z',.68,.235,.062)]
    for label,x,y,radius in positions:
        action_button(mapping[label],label,x,y+.025 if FAMILY=='saturn' and label=='A' else y,radius,button_grey if label in 'XYZ' and FAMILY=='genesis' else button_black,embossed if label in 'ABC' or FAMILY=='saturn' else back)
    start=pivot('button_3',root,(-.055,.055 if FAMILY=='genesis' else -.075,.15),3)
    if FAMILY=='genesis':
        rectangle('start_cap',(0,0,0),.155,.049,.027,.024,button_grey,start)
    else:
        oval=[(.0775*math.cos(i*math.tau/48),.0345*math.sin(i*math.tau/48)) for i in range(48)]
        loft('start_cap',oval,[(1,-.0135),(1,.004),(.9,.0135)],button_black,start)
    if FAMILY=='saturn':
        cylinder('start_center_dot',(0,0,.015),.006,.001,embossed,start,16)
    text_mesh('start_legend','START',(0,-.067 if FAMILY=='genesis' else .065,0),.044,legend_white if FAMILY=='genesis' else embossed,start)
    seat(start)
    if FAMILY=='genesis':
        mode=pivot('button_2',root,(.43,.54,-.023),2)
        rectangle('mode_cap',(0,0,0),.11,.065,.035,.020,back,mode)
        printed_vector('sega_brand','sega.svg',.27,0,.285,legend_white)
    else:
        for side,index in [(-1,12),(1,13)]:
            shoulder=pivot('button_%d'%index,root,(side*.61,.558,-.010),index)
            rectangle('shoulder_%d_cap'%index,(0,0,.014),.34,.095,.08,.035,back,shoulder)
            text_mesh('shoulder_%d_legend'%index,'L' if side==-1 else 'R',(0,0,.055),.044,embossed,shoulder)
        printed_vector('saturn_brand','saturn-flat.svg',.37,0,.25,legend_white)
    # Molded cable strain relief and a short original cable section identify the wired pad.
    cable=pivot('cable',root,(0,.588 if FAMILY=='genesis' else .515,-.04))
    cable.rotation_euler.x=math.pi/2
    cylinder('cable_sleeve',(0,0,-.035),.033,.11,rubber,cable,32)
    for row in range(5):
        cylinder('strain_relief_%d'%row,(0,0,-row*.017),.04-row*.001,.007,back,cable,32)
    cylinder('cable_segment',(0,0,-.145),.018,.15,rubber,cable,24)
else:
    # Generic arcade hardware, not a replica of one manufacturer's cabinet or stick.
    panel=rectangle('arcade_top_panel',(0,0,.138),1.87,.95,.017,.035,gloss)
    for x in [-.89,.89]:
        for y in [-.435,.435]:
            cylinder('panel_screw',(x,y,.15),.022,.008,steel:=material('Brushed screw steel',(.30,.32,.34),.35,.7),vertices=20)
            rectangle('screw_slot',(x,y,.155),.023,.003,.001,.001,back)
    red=material('Arcade vermilion caps',(.55,.018,.012),.26)
    ivory=material('Arcade ivory caps',(.75,.74,.65),.29)
    for index,x,y,color in [(1,.18,.15,red),(9,.43,.20,red),(10,.68,.20,red),(0,.15,-.10,ivory),(8,.40,-.05,ivory),(11,.65,-.05,ivory)]:
        action_button(index,'',x,y,.099,color)
    for index,x,label in [(2,.38,'COIN'),(3,.66,'START')]:
        action_button(index,'',x,.41,.04,button_black)
        text_mesh('service_legend_'+label,label,(x,.335,.151),.029,legend_white)
    joystick=pivot('dpad',root,(-.53,-.01,.153))
    joystick['controlRole']='dpad'
    cylinder('joystick_dust_washer',(0,0,0),.155,.019,rubber,joystick)
    cylinder('joystick_shaft',(0,0,.13),.025,.25,material('Chrome joystick shaft',(.5,.52,.54),.23,.92),joystick)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=.13,location=(0,0,.28))
    ball=bpy.context.object
    ball.name='joystick_ball'
    ball.parent=joystick
    ball.data.materials.append(red)
    for polygon in ball.data.polygons:
        polygon.use_smooth=True
    for index,dx,dy,rotation,direction in [(4,0,.20,0,'up'),(5,0,-.20,math.pi,'down'),(6,-.20,0,math.pi/2,'left'),(7,.20,0,-math.pi/2,'right')]:
        marker=pivot('button_%d'%index,joystick,(dx,dy,0),index)
        marker['dpadDirection']=direction
        marker.rotation_euler.z=rotation
        text_mesh('direction_'+direction,'▴',(0,0,0),.045,legend_white,marker)

# Front inspection and shallow perspective inspection are separate from model export.
world=bpy.context.scene.world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.14,.17,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.4
for name,location,power,size in [('Key',(-3,4,5),430,4),('Fill',(3,1,5),180,4),('Top',(0,4,1),160,2.5)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object
    light.name=name
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,0,5))
camera=bpy.context.object
camera.rotation_euler=(0,0,0)
camera.data.type='ORTHO'
camera.data.ortho_scale=2.40
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.render.resolution_x=1400
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
bpy.ops.object.select_all(action='DESELECT')
for obj in root.children_recursive+[root]:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,FAMILY+'.glb'),export_format='GLB',use_selection=True,export_yup=False,export_apply=True,export_extras=True)
if args.render:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,FAMILY+'.blend'))
    scene.render.filepath=os.path.join(OUT,FAMILY+'-front.png')
    bpy.ops.render.render(write_still=True)
    scene.render.resolution_x=440
    scene.render.resolution_y=314
    scene.render.filepath=os.path.join(OUT,FAMILY+'-settings.png')
    bpy.ops.render.render(write_still=True)
    camera.location=(0,1.65,5)
    camera.rotation_euler=(-math.atan2(1.61,5),0,0)
    scene.render.resolution_x=1100
    scene.render.resolution_y=785
    scene.render.filepath=os.path.join(OUT,FAMILY+'-angle.png')
    bpy.ops.render.render(write_still=True)
print('RETRO_ARTIFACTS_COMPLETE',FAMILY)
