"""Spatial skin-weight regularization across UV seams on connected scanned meshes."""
import numpy as np

def smooth_weights(position, weights, spacing=.006):
    origin=position.min(0)-spacing*4
    coordinates=(position-origin)/spacing
    cell=np.floor(coordinates).astype(int)
    shape=tuple((cell.max(0)+5).tolist())
    flat=np.ravel_multi_index(cell.T,shape)
    size=int(np.prod(shape))
    # Density-normalized fields avoid bias toward densely tessellated paper detail.
    fields=np.empty((*shape,weights.shape[1]+1),dtype=np.float32)
    for i in range(weights.shape[1]):
        fields[...,i]=np.bincount(flat,weights=weights[:,i],minlength=size).reshape(shape)
    fields[...,-1]=np.bincount(flat,minlength=size).reshape(shape)
    for _ in range(4):
        for axis in range(3):
            fields=(np.roll(fields,1,axis)+2*fields+np.roll(fields,-1,axis))*.25
    frac=coordinates-cell
    result=np.zeros((len(position),weights.shape[1]+1),dtype=np.float32)
    for x in [0,1]:
        for y in [0,1]:
            for z in [0,1]:
                offset=np.array([x,y,z]);factor=np.prod(np.where(offset,frac,1-frac),axis=1)
                sample=cell+offset
                result+=fields[sample[:,0],sample[:,1],sample[:,2]]*factor[:,None]
    result=result[:,:-1]/np.maximum(result[:,-1:],1e-9)
    result/=result.sum(1,keepdims=True)
    return result
