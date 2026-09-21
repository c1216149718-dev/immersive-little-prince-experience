"""Audit untouched numbered GLBs and prepare 2048px embedded atlas copies for simplification."""
import argparse, hashlib, io, json, pathlib, struct, sys
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
def inspect(number, prepare=True):
 raw=(ROOT/'asset'/f'{number}.glb').read_bytes(); length=struct.unpack_from('<I',raw,12)[0]; doc=json.loads(raw[20:20+length]); binary=raw[28+length:]
 def array(i):
  a=doc['accessors'][i]; v=doc['bufferViews'][a['bufferView']]; width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);return np.ndarray((a['count'],width),dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize))
 meshes=[]
 for m in doc['meshes']:
  for p in m['primitives']:
   pos=array(p['attributes']['POSITION']);meshes.append({'vertices':len(pos),'triangles':doc['accessors'][p['indices']]['count']//3,'attributes':list(p['attributes']),'localBounds':[pos.min(0).tolist(),pos.max(0).tolist()]})
 out=ROOT/'verification'/'world-models'/'textures';out.mkdir(parents=True,exist_ok=True); images=[]
 for i,item in enumerate(doc.get('images',[])):
  view=doc['bufferViews'][item['bufferView']];image=Image.open(io.BytesIO(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])); before=image.size;image.thumbnail((2048,2048),Image.Resampling.LANCZOS)
  # Keep alpha/data channels intact; PNG is deliberately lossless for normal/ORM atlases.
  file=out/f'{number}-{i}.png'
  if prepare:image.save(file,optimize=True)
  images.append({'index':i,'originalSize':before,'preparedSize':image.size,'mode':image.mode,'path':str(file)})
 node=doc['nodes'][0]; q=node.get('rotation',[0,0,0,1]); x,y,z,w=q; rotation=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])
 world=pos@rotation.T; lo=world.min(0);hi=world.max(0);center=(lo+hi)/2; sphere=float(np.linalg.norm(world-center,axis=1).max()); identities={1:('king','king.png'),2:('geographer','Geographer.png'),3:('lamplighter','Lamplighter.png'),4:('businessman','Businessman.png'),5:('drunkard','Tippler.png'),6:('vain','vain_man.png')}; identity,reference=identities[number]
 return {'id':identity,'sourceGlb':f'asset/{number}.glb','referenceImages':[f'asset/{reference}'],'mappingEvidence':'Eight-angle textured source previews matched reference subject structures','triangles':sum(m['triangles'] for m in meshes),'vertices':sum(m['vertices'] for m in meshes),'meshCount':len(doc['meshes']),'primitiveCount':len(meshes),'materialCount':len(doc.get('materials',[])),'textureCount':len(images),'bounds':[lo.tolist(),hi.tolist()],'boundingSphere':{'center':center.tolist(),'radius':sphere},'fusedMesh':len(meshes)==1,'runtimeEstimate':{'sourceGeometryBytes':sum(v['byteLength'] for v in doc['bufferViews'] if v.get('target') in (34962,34963)),'sourceTextureRgbaMipBytes':sum(i['originalSize'][0]*i['originalSize'][1]*4*4//3 for i in images),'preparedTextureRgbaMipBytes':sum(i['preparedSize'][0]*i['preparedSize'][1]*4*4//3 for i in images)},'source':f'asset/{number}.glb','sourceSha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'primitives':meshes,'nodes':doc['nodes'],'materials':doc.get('materials',[]),'images':images,'skins':len(doc.get('skins',[])),'animations':len(doc.get('animations',[]))}
if __name__=='__main__':
 report=[inspect(n,prepare="--audit-only" not in sys.argv) for n in range(1,7)];(ROOT/'verification'/'world-assets.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps([{'source':x['source'],'primitives':x['primitives'],'images':x['images'],'nodes':x['nodes']} for x in report],indent=2))

