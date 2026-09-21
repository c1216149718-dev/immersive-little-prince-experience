import numpy as np,struct,json
from inspect_assets import ROOT,read
path=next((ROOT/'asset').glob('0d*.glb'));raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);b=raw[n+28:];a=d['accessors'][d['meshes'][0]['primitives'][0]['indices']];v=d['bufferViews'][a['bufferView']];idx=np.frombuffer(b,dtype='<u4' if a['componentType']==5125 else '<u2',count=a['count'],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3)
_,p,c=read(path)
_,inv=np.unique(np.round(p,5),axis=0,return_inverse=True)
parent=list(range(inv.max()+1))
def find(x):
    while parent[x]!=x:
        parent[x]=parent[parent[x]];x=parent[x]
    return x
for row in inv[idx]:
    a,b,c=map(lambda x:find(int(x)),row)
    parent[b]=a;parent[c]=a
labels=np.array([find(int(x)) for x in inv]);np.save(ROOT/'verification'/'planet-components.npy',labels)
ids,counts=np.unique(labels,return_counts=True)
for i in np.argsort(counts)[-25:]:
    points=p[labels==ids[i]];print(int(ids[i]),int(counts[i]),points.min(0).round(4),points.max(0).round(4))
