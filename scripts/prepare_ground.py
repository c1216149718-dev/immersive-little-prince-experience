"""Bake a smooth visual-only ground offset; navigation stays an ideal sphere."""
import json
import numpy as np
from inspect_assets import ROOT, read

def build():
    audit=json.loads((ROOT/'verification/asset-audit.json').read_text())['b612']
    _,p,_=read(ROOT/'asset'/audit['source'])
    p=(p-np.array(audit['center']))*audit['scale']
    radius=np.linalg.norm(p,axis=1)
    w,h=64,32
    u=(np.arctan2(p[:,2],p[:,0])/(2*np.pi)+.5)*w
    v=np.arccos(np.clip(p[:,1]/radius,-1,1))/np.pi*h
    cell=np.minimum(v.astype(int),h-1)*w+(u.astype(int)%w)
    valid=(radius>1.95)&(radius<2.55)
    grid=np.full(w*h,np.nan)
    for i in range(w*h):
        values=radius[(cell==i)&valid]
        if len(values):grid[i]=np.quantile(values,.3)
    grid=grid.reshape(h,w)
    for _ in range(w+h):
        if np.isfinite(grid).all():break
        neighbors=np.stack([np.roll(grid,1,1),np.roll(grid,-1,1),np.concatenate([grid[:1],grid[:-1]]),np.concatenate([grid[1:],grid[-1:]])])
        count=np.isfinite(neighbors).sum(0)
        fill=np.nansum(neighbors,axis=0)/np.maximum(count,1)
        grid=np.where(~np.isfinite(grid)&(count>0),fill,grid)
    for _ in range(2):
        grid=(grid*4+np.roll(grid,1,1)+np.roll(grid,-1,1)+np.concatenate([grid[:1],grid[:-1]])+np.concatenate([grid[1:],grid[-1:]]))/8
    grid[0]=grid[0].mean();grid[-1]=grid[-1].mean()
    (ROOT/'src/three/ground-offset.json').write_text(json.dumps({'width':w,'height':h,'offsets':np.round(grid.ravel()-2.4,5).tolist()},separators=(',',':')))
    print('Visual offset range:',grid.min()-2.4,grid.max()-2.4)

if __name__=='__main__':build()
