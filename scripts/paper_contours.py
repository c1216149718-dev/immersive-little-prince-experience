"""Read atlas colors to build contour geometry JSON. Does not edit image pixels."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from collections import defaultdict
root=Path(__file__).resolve().parents[1]
im=Image.open(root/'asset/paper-theatre/derived/cards-atlas.png'); rgb=np.array(im.convert('RGB')).astype(int)
regions={'wheatTall':(0,0,625,705),'wheatBase':(625,0,1254,705),'cloud':(0,710,750,1254),'star':(750,700,1254,1254)}
def rdp(p,eps):
 if len(p)<3:return p
 a=np.array(p[0]);b=np.array(p[-1]);v=b-a
 q=np.array(p);dist=np.linalg.norm(q-a,axis=1) if np.linalg.norm(v)==0 else np.abs(v[0]*(a[1]-q[:,1])-(a[0]-q[:,0])*v[1])/np.linalg.norm(v)
 k=int(np.argmax(dist))
 return rdp(p[:k+1],eps)[:-1]+rdp(p[k:],eps) if dist[k]>eps else [p[0],p[-1]]
result={}
for name,(x0,y0,x1,y1) in regions.items():
 step=3; a=rgb[y0:y1:step,x0:x1:step];mask=(a[:,:,0]-a[:,:,2]>16)&(a[:,:,0]-a[:,:,1]>5)
 edges=defaultdict(list);h,w=mask.shape
 for y,x in zip(*np.where(mask)):
  if y==0 or not mask[y-1,x]:edges[(x,y)].append((x+1,y))
  if x==w-1 or not mask[y,x+1]:edges[(x+1,y)].append((x+1,y+1))
  if y==h-1 or not mask[y+1,x]:edges[(x+1,y+1)].append((x,y+1))
  if x==0 or not mask[y,x-1]:edges[(x,y+1)].append((x,y))
 loops=[]
 while edges:
  start=next(iter(edges));p=[start];cur=start
  while cur in edges:
   nxt=edges[cur].pop()
   if not edges[cur]:del edges[cur]
   p.append(nxt);cur=nxt
   if cur==start:break
  area=sum(p[i][0]*p[i+1][1]-p[i+1][0]*p[i][1] for i in range(len(p)-1))/2
  if abs(area)>30:loops.append((area,p))
 loops.sort(key=lambda q:abs(q[0]),reverse=True);outer=loops[0][1]
 minx=min(x for x,y in outer)*step+x0;maxx=max(x for x,y in outer)*step+x0;miny=min(y for x,y in outer)*step+y0;maxy=max(y for x,y in outer)*step+y0
 pts=[]
 for area,p in loops:
  if area>0 and p is not outer:continue
  q=rdp(p,0.7);pts.append([[round(x*step+x0,3),round(y*step+y0,3)] for x,y in q[:-1]])
 result[name]={'bounds':[minx,miny,maxx,maxy],'outer':pts[0],'holes':pts[1:],'pivot':'top' if name in ['cloud','star'] else 'bottom'}
 print(name,'bounds',result[name]['bounds'],'vertices',list(map(len,pts)))
(root/'src/three/paper/cardContours.json').write_text(json.dumps({'size':list(im.size),'cards':result},separators=(',',':'),default=float),encoding='utf-8')
