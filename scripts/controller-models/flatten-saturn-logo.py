"""Flatten the documented Saturn source mark's clipping into plain polygon paths.
Authoring only: requires Shapely. Source remains alongside output for provenance.
"""
import re
from pathlib import Path
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, Point, GeometryCollection
from shapely.ops import unary_union
from shapely.affinity import affine_transform
from svg_paths import path_contours
base = Path(__file__).parent / 'logos'
root = ET.parse(base / 'saturn.svg').getroot()
ids = {e.get('id'): e for e in root.iter() if e.get('id')}
css = ''.join(e.text or '' for e in root.iter() if e.tag.endswith('style'))
classes = {k: v for k,v in re.findall(r'\.([\w]+)\{([^}]+)\}',css)}
def properties(e):
    raw = ';'.join(classes.get(c,'') for c in e.get('class','').split())+';'+e.get('style','')
    return dict(item.split(':',1) for item in raw.split(';') if ':' in item)
def shape(e):
    tag=e.tag.rsplit('}',1)[-1]
    g=GeometryCollection()
    if tag=='use':
        g=shape(ids[e.get('{http://www.w3.org/1999/xlink}href').lstrip('#')])
    elif tag in ('clipPath','g'):
        g=unary_union([shape(c) for c in e])
    elif tag=='circle':
        g=Point(float(e.get('cx')),float(e.get('cy'))).buffer(float(e.get('r')),quad_segs=64)
    elif tag in ('path','polygon','rect'):
        if tag=='path': contours=path_contours(e.get('d'),steps=10)
        elif tag=='polygon':
            nums=[float(n) for n in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',e.get('points'))]
            contours=[list(zip(nums[::2],nums[1::2]))]
        else:
            x,y,w,h=[float(e.get(a,'0')) for a in ('x','y','width','height')]
            contours=[[(x,y),(x+w,y),(x+w,y+h),(x,y+h)]]
        for c in contours:
            if len(c)>2: g=g.symmetric_difference(Polygon(c).buffer(0))
    if e.get('transform'):
        a,b,c,d,x,y=[float(n) for n in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',e.get('transform'))]
        g=affine_transform(g,[a,c,b,d,x,y])
    return g
result=GeometryCollection()
def paint(e,clip=None,fill='black'):
    global result
    tag=e.tag.rsplit('}',1)[-1]
    if tag in ('defs','clipPath','style'): return
    p=properties(e)
    if p.get('display')=='none': return
    fill=p.get('fill',e.get('fill',fill))
    clipref=p.get('clip-path',e.get('clip-path',''))
    if clipref:
        local=shape(ids[re.search(r'#([^)]*)',clipref).group(1)])
        clip=local if clip is None else clip.intersection(local)
    if tag in ('path','polygon','rect','circle','use') and fill!='none':
        g=shape(e)
        if clip is not None: g=g.intersection(clip)
        result=result.difference(g) if fill.lower() in ('#ffffff','white','#fff') else result.union(g)
    else:
        for c in e: paint(c,clip,fill)
paint(root)
polys=list(result.geoms) if hasattr(result,'geoms') else [result]
# The controller uses the same source word outlines on one line beneath the planet.
# Rearrange the source artwork without substituting a font or approximating the mark.
polys=[affine_transform(p,[.48,0,0,.48,100-.48*377.3937,1260-.48*1274.5])
       if 1200 < p.bounds[1] < 1700 else
       affine_transform(p,[.48,0,0,.48,880,1260-.48*1743.4])
       if p.bounds[1] > 1700 else affine_transform(p,[.4,0,0,.4,672,697.56]) for p in polys]
paths=[]
for p in polys:
    if p.geom_type!='Polygon': continue
    d=[]
    for ring in [p.exterior,*p.interiors]:
        coords=list(ring.coords)
        d.append('M'+' L'.join(f'{x:.3f},{y:.3f}' for x,y in coords)+' Z')
    paths.append('<path fill-rule="evenodd" d="'+' '.join(d)+'"/>')
(base/'saturn-flat.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2237 2159">'+''.join(paths)+'</svg>')
print('Flattened',len(paths),'polygons',result.bounds)
