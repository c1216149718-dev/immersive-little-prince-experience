"""Publish reviewed candidates and regenerate aggregate report. Does not modify sources.
Rebuild: python scripts/inspect_world_models.py, run six optimize_world_models.mjs commands,
then python scripts/publish_world_models.py. Candidate selection records King visual POC.
"""
import hashlib,json,pathlib,shutil,struct
ROOT=pathlib.Path(__file__).resolve().parents[1]
SELECTION=[(1,220000,'king'),(2,140000,'geographer'),(3,80000,'lamplighter'),(4,140000,'businessman'),(5,100000,'drunkard'),(6,100000,'vain')]
def publish():
 out=ROOT/'public/models/worlds';out.mkdir(parents=True,exist_ok=True); reports=[]
 for n,t,name in SELECTION:
  folder=ROOT/'verification/world-models';report=json.loads((folder/f'{n}-{t}.json').read_text(encoding='utf8'));source=folder/f'{n}-{t}.glb';dest=out/f'{name}.glb'
  assert hashlib.sha256((ROOT/'asset'/f'{n}.glb').read_bytes()).hexdigest()==report['sourceSha256'],'Original source differs from reviewed candidate'
  assert hashlib.sha256(source.read_bytes()).hexdigest()==report['outputSha256'],'Candidate differs from validated bytes'
  shutil.copyfile(source,dest);assert hashlib.sha256(dest.read_bytes()).hexdigest()==report['outputSha256']
  raw=dest.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:];resolutions=[]
  for image in doc['images']:
   view=doc['bufferViews'][image['bufferView']];offset=view.get('byteOffset',0);assert binary[offset:offset+8]==bytes.fromhex('89504e470d0a1a0a');resolutions.append(list(struct.unpack_from('>II',binary,offset+16)))
  report['method']='UV/normal-aware geometric simplification, protected hero triangles, 4096-to-2048 texture resampling encoded as PNG, lossless geometry compression'
  report.update(materials=len(doc['materials']),textures=len(doc['images']),textureResolution=resolutions,id=name,output=f'public/models/worlds/{name}.glb',triangleReductionPercent=round(100*(1-report['triangles']/report['sourceTriangles']),2),budgetException='Protected hero triangles and 0.001 attribute error cap override requested target; King 220k chosen after rendered POC rejected visible canopy/flag/carpet distortion at162k.' if report['triangles']>t or n==1 else None);reports.append(report)
 report={'method':'True geometric edge-collapse reduction followed by lossless compression, independent texture resize','sourceAssetsUntouched':True,'kingPOC':{'selected':'1-220000.glb','visuallyRejected':['1-110000.glb','1-160000.glb'],'unselectedNotVisuallyReviewed':['1-120000.glb'],'reason':'Lower detail variants visibly distort thin canopy/flag/carpet geometry and UVs in rendered comparison'},'models':reports,'totals':{key:sum(r[key] for r in reports) for key in ['sourceTriangles','triangles','sourceBytes','outputBytes','decodedGeometryBytes']},'sourceImageTextureEstimatePerModelMiB':64,'runtimeGpuTextureEstimatePerModelMiB':85.33,'textureMemoryBasis':'Three2048px source images estimate64MiB RGBA+mipmaps; viewer allocates fourGPU texture objects due to AO channel variant, giving85.33MiB upper estimate; actual allocation is renderer-dependent','limitations':['Quality-preserving triangle count exceptions exceed suggested targets','Source fused mesh defects remain; no semantic reconstruction or invented features','Source4096px atlases resampled to2048px (loss of texture detail), then PNG encoded; not rebaked from new geometry']}
 for p in [ROOT/'verification/world-models/report.json',ROOT/'verification/world-optimization-report.json']:p.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
 print(json.dumps(report['totals']))
if __name__=='__main__':publish()
