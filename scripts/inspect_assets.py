import json, struct, pathlib, io
import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
def read(path):
    raw = path.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+n])
    binary = raw[28+n:]
    def accessor(i):
        a = doc['accessors'][i]; v = doc['bufferViews'][a['bufferView']]
        dtype = {5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        width = {'VEC3':3,'VEC2':2,'SCALAR':1,'VEC4':4}[a['type']]
        return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
    p = doc['meshes'][0]['primitives'][0]
    xyz = accessor(p['attributes']['POSITION']).copy()
    xyz = xyz[:,[0,2,1]] * [1,-1,1] # exported node's +90deg X rotation
    uv = accessor(p['attributes']['TEXCOORD_0'])
    mat = doc['materials'][p['material']]
    tex = mat['pbrMetallicRoughness']['baseColorTexture']['index']
    im = doc['images'][doc['textures'][tex]['source']]; bv = doc['bufferViews'][im['bufferView']]
    texture = Image.open(io.BytesIO(binary[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB')
    pix = np.asarray(texture)
    colors = pix[np.clip((uv[:,1]*texture.height).astype(int),0,texture.height-1),np.clip((uv[:,0]*texture.width).astype(int),0,texture.width-1)]
    return doc, xyz, colors

if __name__ == '__main__':
    for path in (ROOT/'asset').glob('*.glb'):
        doc, xyz, colors = read(path)
        canvas = Image.new('RGB',(1536,800),'#dad5cd'); draw=ImageDraw.Draw(canvas)
        for j,(horizontal,depth,label) in enumerate([(0,2,'front XY'),(2,0,'side ZY')]):
            lo=xyz.min(0); hi=xyz.max(0); scale=680/max(hi[horizontal]-lo[horizontal],hi[1]-lo[1])
            x=((xyz[:,horizontal]-(lo[horizontal]+hi[horizontal])/2)*scale+384+j*768).astype(int)
            y=(740-(xyz[:,1]-lo[1])*scale).astype(int)
            order=np.argsort(xyz[:,depth])
            arr=np.asarray(canvas).copy()
            arr[y[order],x[order]]=colors[order]
            canvas=Image.fromarray(arr); draw=ImageDraw.Draw(canvas)
            draw.text((j*768+16,12),f'{path.stem} {label}',fill='black')
            draw.text((j*768+16,32),f'min {lo.round(3)} max {hi.round(3)}',fill='black')
        canvas.save(ROOT/'verification'/f'{path.stem}.png')
        print(path.name, len(xyz), xyz.min(0), xyz.max(0))
