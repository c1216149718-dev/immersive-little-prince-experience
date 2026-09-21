"""Bake source transforms, embed portable rigs, and resize textures. Originals are never edited."""
import copy, io, json, math, pathlib, struct
import numpy as np
from PIL import Image
from inspect_assets import ROOT, read
from smooth_weights import smooth_weights
from fit_chair import fit_chair
from fit_rose import fit_rose
from author_prince_walk import author_walk, settle_contact

OUT = ROOT/'public'/'models'
OUT.mkdir(parents=True, exist_ok=True)
FILES = {'b612':'0d3379beee9498f73409876d9d0d20a3', 'fox':'8a616feea09bf049d95a710b077d686c', 'prince':'b4c22085622af932fb40a7f04e7f6efd', 'rose':'b81e1afca37e217e5740f75dcb406106'}

class Writer:
    def __init__(self):
        self.data=bytearray()
        self.doc={'asset':{'version':'2.0','generator':'B612 model adapter'},'buffers':[{}],'bufferViews':[],'accessors':[],'nodes':[],'meshes':[],'scenes':[{'nodes':[0]}],'scene':0}
    def blob(self, data):
        while len(self.data)%4: self.data.append(0)
        i=len(self.doc['bufferViews']);self.doc['bufferViews'].append({'buffer':0,'byteOffset':len(self.data),'byteLength':len(data)});self.data.extend(data);return i
    def acc(self,a,kind='VEC3',component=5126):
        a=np.asarray(a,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);i=len(self.doc['accessors'])
        entry={'bufferView':self.blob(a.tobytes()),'componentType':component,'count':len(a),'type':kind}
        if kind in ['VEC3','SCALAR']: entry.update(min=np.atleast_1d(a.min(0)).tolist(),max=np.atleast_1d(a.max(0)).tolist())
        self.doc['accessors'].append(entry);return i
    def save(self,name):
        while len(self.data)%4:self.data.append(0)
        self.doc['buffers'][0]['byteLength']=len(self.data)
        j=json.dumps(self.doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
        (OUT/f'{name}.glb').write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(self.data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(self.data),0x004e4942)+self.data)

def build(name,stem):
    path=ROOT/'asset'/f'{stem}.glb';raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];src=json.loads(raw[20:20+n]);binary=raw[n+28:]
    def get(i):
        a=src['accessors'][i];v=src['bufferViews'][a['bufferView']];width={'VEC3':3,'VEC2':2,'VEC4':4,'SCALAR':1}[a['type']]
        return np.frombuffer(binary,dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']],count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width).copy()
    primitive=src['meshes'][0]['primitives'][0];attrs=primitive['attributes'];p=get(attrs['POSITION'])[:,[0,2,1]]*[1,-1,1];normal=get(attrs['NORMAL'])[:,[0,2,1]]*[1,-1,1]
    _,_,colors=read(path)
    source_bounds=[p.min(0).tolist(),p.max(0).tolist()]
    factor=1.;center=np.zeros(3)
    if name=='b612':
        # Robust sphere fit excludes the upper fixtures and trims rocks/crater walls.
        sample=p[p[:,1]<.78][::3]
        for _ in range(6):
            q=np.linalg.lstsq(np.c_[2*sample,np.ones(len(sample))],(sample*sample).sum(1),rcond=None)[0]
            center=q[:3];radius=np.sqrt(q[3]+sum(center**2));res=np.abs(np.linalg.norm(sample-center,axis=1)-radius)
            sample=sample[res<np.quantile(res,.85)]
        factor=2.4/radius
        chair_info=fit_chair(p,factor)
        fit_rose(p)
        p=(p-center)*factor
    elif name=='prince':
        factor=.72/p[:,1].max();p*=factor;p[:,[0,2]]*=-1;normal[:,[0,2]]*=-1
    elif name=='fox':factor=.88/p[:,1].max();p*=factor
    elif name=='rose':factor=1/p[:,1].max();p*=factor
    w=Writer();w.doc['nodes']=[{'name':f'{name}_visual','mesh':0}]
    newattrs={'POSITION':w.acc(p),'NORMAL':w.acc(normal),'TEXCOORD_0':w.acc(get(attrs['TEXCOORD_0']),'VEC2')}
    idx=get(primitive['indices']).ravel();w.doc['meshes']=[{'name':name,'primitives':[{'attributes':newattrs,'indices':w.acc(idx,'SCALAR',5125),'material':0}]}]
    # Preserve all authored texture channels, with a common matte material response.
    material=copy.deepcopy(src['materials'][primitive['material']]);material.pop('extensions',None)
    material['pbrMetallicRoughness']['metallicFactor']=0;material['pbrMetallicRoughness']['roughnessFactor']=.94
    material['pbrMetallicRoughness'].pop('metallicRoughnessTexture',None)
    material['emissiveTexture']=copy.deepcopy(material['pbrMetallicRoughness']['baseColorTexture'])
    material['emissiveFactor']=[.12,.12,.12]
    material['normalTexture']['scale']=.65
    material['doubleSided']=True;w.doc['materials']=[material]
    w.doc['textures']=copy.deepcopy(src.get('textures',[]));w.doc['samplers']=copy.deepcopy(src.get('samplers',[]));w.doc['images']=[]
    for im in src['images']:
        bv=src['bufferViews'][im['bufferView']];data=binary[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]
        img=Image.open(io.BytesIO(data)).convert('RGB');img.thumbnail((2048,2048),Image.Resampling.LANCZOS);out=io.BytesIO();img.save(out,format='JPEG',quality=92)
        w.doc['images'].append({'bufferView':w.blob(out.getvalue()),'mimeType':'image/jpeg'})
    bones=[];positions=[];parents=[]
    def bone(b,xyz,parent=None):
        bones.append(b);positions.append(np.array(xyz,dtype=float)*factor);parents.append(parent)
        return len(bones)-1
    if name=='prince':
        # Coordinates are authored in the inspected source frame, then face local -Z.
        bone('Hips',(0,.53,0));bone('Spine',(0,.66,0),'Hips');bone('Neck',(0,.825,0),'Spine');bone('Head',(0,.85,0),'Neck')
        for side,x in [('L',-.077),('R',.077)]:
            bone('Thigh'+side,(x,.53,0),'Hips');bone('Shin'+side,(x,.275,0),'Thigh'+side);bone('Foot'+side,(x,.06,.035),'Shin'+side)
            bone('Shoulder'+side,(np.sign(x)*.11,.77,0),'Spine');bone('Elbow'+side,(np.sign(x)*.17,.60,0),'Shoulder'+side);bone('Hand'+side,(np.sign(x)*.205,.445,0),'Elbow'+side)
            bone('Coat'+side,(x,.54,-.035),'Hips')
        for i,y in enumerate([.79,.69,.59,.49]):bone('Scarf'+str(i),(.075,y,.10),'Spine' if i==0 else 'Scarf'+str(i-1))
        positions=np.array(positions);positions[:,[0,2]]*=-1
    elif name=='fox':
        bone('Hips',(0,.275,-.16));bone('Spine',(0,.32,.06),'Hips');bone('Neck',(0,.43,.20),'Spine');bone('Head',(0,.53,.235),'Neck')
        for side,x in [('L',-.065),('R',.065)]:
            for part,z in [('Front',.20),('Back',-.18)]:
                bone(part+side,(x,.265,z),'Spine' if part=='Front' else 'Hips');bone(part+'Knee'+side,(x,.12,z),'%s%s'%(part,side));bone(part+'Foot'+side,(x,.028,z+.025),part+'Knee'+side)
            bone('Ear'+side,(np.sign(x)*.10,.65,.18),'Head')
        for i in range(5):bone('Tail'+str(i),(0,.32-i*.005,-.23-i*.10),'Hips' if i==0 else 'Tail'+str(i-1))
        positions=np.array(positions)
    if bones:
        weights=np.zeros((len(p),len(bones)),dtype=np.float32)
        def assign(mask, entries):
            for b,amount in entries: weights[mask,bones.index(b)]=amount if np.isscalar(amount) else amount[mask]
        x,y,z=p.T
        if name=='prince':
            sx,sy,sz=-x/factor,y/factor,-z/factor
            assign(np.ones(len(p),bool),[('Hips',1)])
            weights[sy>.59]=0;assign((sy>.59)&(sy<.82),[('Spine',1)]);assign(sy>=.82,[('Head',1)])
            for side,sign in [('L',-1),('R',1)]:
                m=(sx*sign>=0)&(sy<.55);weights[m]=0
                k=np.clip((sy-.22)/.10,0,1);assign(m,[('Thigh'+side,k),('Shin'+side,1-k)])
                foot=m&(sy<.09);weights[foot]=0;assign(foot,[('Foot'+side,1)])
                arm=(sx*sign>.115+( .76-sy)*.11)&(sy>.39)&(sy<.78);weights[arm]=0
                a=np.clip((sy-.54)/.12,0,1);assign(arm,[('Shoulder'+side,a),('Elbow'+side,1-a)])
                hand=arm&(sy<.47);weights[hand]=0;assign(hand,[('Hand'+side,1)])
                green=(colors[:,1]>colors[:,0]*.85)&(colors[:,1]>colors[:,2]*1.15)
                coat=m&green&(sy>.22);weights[coat]=0
                # The scan has a connected back panel, so blend across its center seam.
                left=np.clip(.5-sx/.09,0,1);hem=np.clip((.55-sy)/.08,0,1)
                assign(coat,[('CoatL',left*hem),('CoatR',(1-left)*hem),('Hips',1-hem)])
            gold=(colors[:,0]>colors[:,1]*1.12)&(colors[:,1]>colors[:,2]*1.3)
            scarf=gold&(sy>.43)&(sy<.80)&(sx>.025)&(sx<.15)&(sz>.065)
            weights[scarf]=0
            u=np.clip((.79-sy)/.10,0,2.999);a=np.floor(u).astype(int);blend=u-a
            for i in range(3):assign(scarf&(a==i),[('Scarf'+str(i),1-blend),('Scarf'+str(i+1),blend)])
            centerBlend=np.clip(np.abs(sx)/.04,0,1)
            # Stabilize the leg seam without pinning the connected green coat hem
            # to the pelvis. The coat already blends continuously between its bones.
            coatCenter=green&(sy>.22)&(sy<.55)
            centerBlend=np.where((sy<.55)&~coatCenter,centerBlend,1)
            weights*=centerBlend[:,None]
            weights[:,bones.index('Hips')]+=1-centerBlend
            # Texture shadows inside the coat hem are not a separate rigid part.
            # Transfer the pelvis seam lock over a broad geometric envelope; leave
            # the separated lower legs and coat waist outside this correction.
            def ease(v):
                v=np.clip(v,0,1)
                return v*v*(3-2*v)
            coatHem=ease((.05-np.abs(x))/.025)*ease((y-.11)/.04)*ease((.32-y)/.045)*ease((np.abs(z)+.008)/.024)
            transfer=weights[:,bones.index('Hips')]*coatHem
            weights[:,bones.index('Hips')]-=transfer
            left=np.clip(.5-sx/.09,0,1)
            weights[:,bones.index('CoatL')]+=transfer*left
            weights[:,bones.index('CoatR')]+=transfer*(1-left)
        else:
            sx,sy,sz=x/factor,y/factor,z/factor
            assign(np.ones(len(p),bool),[('Spine',1)])
            hind=sz<-.075;weights[hind]=0;assign(hind,[('Hips',1)])
            head=(sy>.48)&(sz>.07);weights[head]=0;assign(head,[('Head',1)])
            neck=(sy>.36)&(sy<=.48)&(sz>.11);weights[neck]=0;assign(neck,[('Neck',1)])
            for side,sign in [('L',-1),('R',1)]:
                ear=(sx*sign>0)&(sy>.65);weights[ear]=0;assign(ear,[('Ear'+side,1)])
                for part,front in [('Front',True),('Back',False)]:
                    m=(sx*sign>=0)&(sy<.27)&((sz>.06) if front else ((sz<-.07)&(sz>-.31)))
                    weights[m]=0;k=np.clip((sy-.095)/.08,0,1)
                    leg=np.clip((np.abs(sx)-.025)/.03,0,1)
                    assign(m,[(part+side,k*leg),(part+'Knee'+side,(1-k)*leg),('Hips' if part=='Back' else 'Spine',1-leg)])
                    foot=m&(sy<.05);weights[foot]=0;assign(foot,[(part+'Foot'+side,1)])
            tail=(sz<-.275)&((sy>.18)|(np.abs(sx)<.05)|(sz<-.36));weights[tail]=0;u=np.clip((-sz-.23)/.10,0,3.999);a=np.floor(u).astype(int);blend=u-a
            rootBlend=np.clip((-sz-.275)/.075,0,1)
            for i in range(4):assign(tail&(a==i),[('Tail'+str(i),(1-blend)*rootBlend),('Tail'+str(i+1),blend*rootBlend),('Hips',1-rootBlend)])
        weights=smooth_weights(p,weights)
        ordered=np.argsort(weights,axis=1)
        joints=ordered[:,-4:]
        # Fade the weakest influence to zero before dropping it. Hard top-four
        # truncation would introduce a new seam where the fourth/fifth swap.
        cutoff=np.take_along_axis(weights,ordered[:,-5:-4],axis=1)
        values=np.maximum(0,np.take_along_axis(weights,joints,axis=1)-cutoff)
        values/=np.maximum(values.sum(1,keepdims=True),1e-9)
        assert np.isfinite(values).all()
        newattrs['JOINTS_0']=w.acc(joints,'VEC4',5123);newattrs['WEIGHTS_0']=w.acc(values,'VEC4')
        w.doc['nodes'][0]['skin']=0
        inverses=[]
        for i,b in enumerate(bones):
            parent=parents[i];local=positions[i]-(positions[bones.index(parent)] if parent else 0)
            node={'name':b,'translation':local.tolist()};children=[j+1 for j,pb in enumerate(parents) if pb==b]
            if children:node['children']=children
            w.doc['nodes'].append(node);mat=np.eye(4);mat[:3,3]=-positions[i];inverses.append(mat.T.ravel())
        w.doc['scenes'][0]['nodes'].append(1)
        w.doc['skins']=[{'name':name+'Rig','joints':list(range(1,len(bones)+1)),'skeleton':1,'inverseBindMatrices':w.acc(inverses,'MAT4')}]
        w.doc['animations']=[]
        for clip in ['Idle','Walk']:
            times=np.linspace(0,3 if clip=='Idle' else 1,49);ti=w.acc(times,'SCALAR');channels=[];samplers=[]
            gait={}
            if name=='prince' and clip=='Walk':
                hips, authored_rotations = author_walk(times, bones, positions)
                settle_contact(hips, authored_rotations, bones, positions, parents, p, joints, values)
                samplers.append({'input':ti,'output':w.acc(hips),'interpolation':'LINEAR'})
                channels.append({'sampler':0,'target':{'node':bones.index('Hips')+1,'path':'translation'}})
                for b, quat in authored_rotations.items():
                    samplers.append({'input':ti,'output':w.acc(quat,'VEC4'),'interpolation':'LINEAR'})
                    channels.append({'sampler':len(samplers)-1,'target':{'node':bones.index(b)+1,'path':'rotation'}})
            for i,b in enumerate(bones):
                angles=np.zeros(len(times));phase=np.linspace(0,math.tau,len(times));axis=0
                if clip=='Idle':
                    if b=='Head':angles=np.sin(phase)*.025;axis=1
                    if b=='Spine':angles=np.sin(phase)*.008
                elif name=='prince':
                    continue # Full authored walk tracks were baked above.
                else:
                    sign=1 if b.endswith('L') else -1
                    if b.startswith('Back'):sign=-sign
                    if b.startswith(('Front','Back')) and 'Foot' not in b:angles=np.sin(phase)*(.48 if 'Knee' not in b else -.30)*sign
                if not np.any(angles):continue
                quat=np.zeros((len(times),4));quat[:,axis]=np.sin(angles/2);quat[:,3]=np.cos(angles/2)
                samplers.append({'input':ti,'output':w.acc(quat,'VEC4'),'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':i+1,'path':'rotation'}})
            w.doc['animations'].append({'name':clip,'samplers':samplers,'channels':channels})
        w.doc['extras']={'forward':'-Z' if name=='prince' else '+Z','pivot':'feet','walkInPlace':True,'cycleDistance':.36 if name=='prince' else .48,'bones':bones}
    w.save(name)
    report={'source':path.name,'sourceBounds':source_bounds,'center':center.tolist(),'scale':factor,'bounds':[p.min(0).tolist(),p.max(0).tolist()],'sphereRadius':float(np.linalg.norm(p-(p.min(0)+p.max(0))/2,axis=1).max()),'vertices':len(p),'bones':bones,'bytes':(OUT/f'{name}.glb').stat().st_size}
    if name=='b612':report['chair']=chair_info
    print(name,report['bytes'], 'bones',len(bones));return report

if __name__ == '__main__':
    import sys
    report_path=ROOT/'verification'/'asset-audit.json'
    reports=json.loads(report_path.read_text()) if report_path.exists() else {}
    names=sys.argv[1:] or FILES.keys()
    reports.update({name:build(name,FILES[name]) for name in names})
    report_path.write_text(json.dumps(reports,indent=2))
