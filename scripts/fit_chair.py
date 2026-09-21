"""Resize the fused chair in place, retaining UVs and connected ground."""
import numpy as np

def fit_chair(position, planet_scale):
    base=np.array([-.052,.802,.13])
    up=np.array([0.,1.,.25]);up/=np.linalg.norm(up)
    basis=np.column_stack([[1,0,0],up,np.cross([1,0,0],up)])
    local=(position-base)@basis
    area=(position[:,0]>-.132)&(position[:,0]<.03)&(position[:,2]>.035)&(position[:,2]<.222)
    scale=.46/(local[area,1].max()*planet_scale)
    weight=np.clip(local[:,1]/.025,0,1)
    weight=weight*weight*(3-2*weight)*area
    position+=((local*scale)@basis.T+base-position)*weight[:,None]
    return {'scale':float(scale),'base':base.tolist(),'height':.46}
