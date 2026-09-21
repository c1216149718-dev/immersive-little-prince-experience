/** True topology reduction with UV/normal error, spatial locks, then lossless meshopt compression.
 * node scripts/optimize_world_models.mjs --source=1 --target=110000
 * Original node transforms/materials stay intact; textures come from inspect_world_models.py.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {MeshoptSimplifier} from 'meshoptimizer/simplifier';
import {MeshoptEncoder} from 'meshoptimizer/encoder';
import {MeshoptDecoder} from 'three-stdlib';
import {Matrix4,Quaternion,Vector3} from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const number=Number(args.source||1),target=Number(args.target||110000),errorLimit=Number(args.error||.001);
assert(number>=1&&number<=6&&Number.isInteger(number));assert(target>1000);
const out=path.join(root,'verification','world-models');await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),align=n=>(n+3)&~3;
const sourcePath=path.join(root,'asset',`${number}.glb`),raw=await readFile(sourcePath),jsonSize=raw.readUInt32LE(12),src=JSON.parse(raw.subarray(20,20+jsonSize)),bin=raw.subarray(28+jsonSize);
assert.equal(src.meshes.length,1);assert.equal(src.meshes[0].primitives.length,1);assert.equal(src.skins?.length||0,0);
const primitive=src.meshes[0].primitives[0];assert.equal(primitive.mode??4,4);
const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function get(i){const a=src.accessors[i],v=src.bufferViews[a.bufferView],T=types[a.componentType],w=widths[a.type],stride=v.byteStride??w*T.BYTES_PER_ELEMENT;assert(!a.sparse);const result=new T(a.count*w),offset=(v.byteOffset||0)+(a.byteOffset||0);for(let j=0;j<a.count;j++){const b=bin.subarray(offset+j*stride,offset+j*stride+w*T.BYTES_PER_ELEMENT);new Uint8Array(result.buffer,j*w*T.BYTES_PER_ELEMENT,b.length).set(b);}return result;}
const attributes=Object.fromEntries(Object.entries(primitive.attributes).map(([k,v])=>[k,get(v)]));const positions=attributes.POSITION;const indices=Uint32Array.from(get(primitive.indices));
const vertexCount=positions.length/3,metrics=new Float32Array(vertexCount*5),locks=new Uint8Array(vertexCount);
const node=src.nodes.find(n=>n.mesh===0),matrix=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1]));
const point=new Vector3(),bounds=[new Vector3(Infinity,Infinity,Infinity),new Vector3(-Infinity,-Infinity,-Infinity)];let locked=0;
for(let i=0;i<vertexCount;i++){point.fromArray(positions,i*3).applyMatrix4(matrix);bounds[0].min(point);bounds[1].max(point);}
// Protect central upper subject. King face is more tightly measured than the other figures.
const minY=Number(args.lockMin??(number===1?.82:bounds[0].y+(bounds[1].y-bounds[0].y)*.70));
const maxY=Number(args.lockMax??(number===1?1.0:Infinity));const lockX=Number(args.lockX??.13);
for(let i=0;i<vertexCount;i++){for(let k=0;k<3;k++)metrics[i*5+k]=attributes.NORMAL[i*3+k];for(let k=0;k<2;k++)metrics[i*5+3+k]=attributes.TEXCOORD_0[i*2+k];point.fromArray(positions,i*3).applyMatrix4(matrix);if(point.y>=minY&&point.y<=maxY&&Math.abs(point.x)<lockX){locks[i]=1;locked++;}}
const decoder=typeof MeshoptDecoder==='function'?MeshoptDecoder():MeshoptDecoder;
await Promise.all([MeshoptSimplifier.ready,MeshoptEncoder.ready,decoder.ready]);
const hero=[],body=[];for(let i=0;i<indices.length;i+=3){const bucket=locks[indices[i]]||locks[indices[i+1]]||locks[indices[i+2]]?hero:body;bucket.push(indices[i],indices[i+1],indices[i+2]);}for(const i of hero)locks[i]=1;locked=locks.reduce((a,b)=>a+b,0);const [bodyReduced,error]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(body),positions,3,metrics,5,[.25,.25,.25,1,1],locks,Math.max(3000,target*3-hero.length),errorLimit,[]);const reduced=new Uint32Array(hero.length+bodyReduced.length);reduced.set(hero);reduced.set(bodyReduced,hero.length);
const originalReduced=reduced.slice();const [remap,count]=MeshoptSimplifier.compactMesh(reduced);
const doc=structuredClone(src);doc.accessors=[];doc.bufferViews=[];doc.buffers=[];const chunks=[];let length=0,fallback=0,compressed=0;
function append(data){const offset=align(length);if(offset>length)chunks.push(Buffer.alloc(offset-length));chunks.push(Buffer.from(data));length=offset+data.length;return offset;}
function view(data,count=0,stride=0,mode='ATTRIBUTES'){
 const entry={buffer:0,byteLength:data.length};const encoded=count?MeshoptEncoder.encodeGltfBuffer(data,count,stride,mode,0):null;
 if(encoded&&encoded.length<data.length){entry.buffer=1;entry.byteOffset=align(fallback);fallback=entry.byteOffset+data.length;entry.extensions={EXT_meshopt_compression:{buffer:0,byteOffset:append(encoded),byteLength:encoded.length,count,byteStride:stride,mode}};const decoded=Buffer.alloc(data.length);decoder.decodeGltfBuffer(decoded,count,stride,encoded,mode,'NONE');assert.deepEqual(decoded,data);compressed++;}else entry.byteOffset=append(data);
 doc.bufferViews.push(entry);return doc.bufferViews.length-1;
}
function accessor(array,sourceAccessor,index=false){const a={...sourceAccessor};delete a.byteOffset;const width=widths[a.type];a.count=array.length/width;a.bufferView=view(Buffer.from(array.buffer,array.byteOffset,array.byteLength),a.count,width*array.BYTES_PER_ELEMENT,index?'INDICES':'ATTRIBUTES');if(a.min||a.max){a.min=Array(width).fill(Infinity);a.max=Array(width).fill(-Infinity);for(let i=0;i<array.length;i++){a.min[i%width]=Math.min(a.min[i%width],array[i]);a.max[i%width]=Math.max(a.max[i%width],array[i]);}}doc.accessors.push(a);return doc.accessors.length-1;}
const p=doc.meshes[0].primitives[0];for(const [name,array]of Object.entries(attributes)){const sourceAccessor=src.accessors[primitive.attributes[name]],width=widths[sourceAccessor.type],dest=new array.constructor(count*width);for(let i=0;i<vertexCount;i++)if(remap[i]!==0xffffffff)for(let k=0;k<width;k++)dest[remap[i]*width+k]=array[i*width+k];p.attributes[name]=accessor(dest,sourceAccessor);}
p.indices=accessor(reduced,{...src.accessors[primitive.indices],componentType:5125},true);
for(let i=0;i<(doc.images?.length||0);i++){const data=await readFile(path.join(out,'textures',`${number}-${i}.png`));doc.images[i].bufferView=view(data);doc.images[i].mimeType='image/png';}
doc.buffers=[{byteLength:align(length)},{byteLength:align(fallback),extensions:{EXT_meshopt_compression:{fallback:true}}}];for(const key of ['extensionsUsed','extensionsRequired'])doc[key]=[...(src[key]??[]).filter(x=>x!=='EXT_meshopt_compression'),'EXT_meshopt_compression'];
const json=Buffer.from(JSON.stringify(doc)),jl=align(json.length),bl=align(length),result=Buffer.alloc(28+jl+bl);result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jl,12);result.writeUInt32LE(0x4e4f534a,16);result.fill(32,20,20+jl);json.copy(result,20);result.writeUInt32LE(bl,20+jl);result.writeUInt32LE(0x004e4942,24+jl);Buffer.concat(chunks).copy(result,28+jl);
assert.deepEqual(doc.nodes,src.nodes);assert.deepEqual(doc.materials,src.materials);assert(reduced.length<indices.length);assert.equal(hash(await readFile(sourcePath)),hash(raw));
let lockedRetained=0;const used=new Set(originalReduced);for(let i=0;i<locks.length;i++)if(locks[i]&&used.has(i))lockedRetained++;const originalUsed=new Set(indices);let lockedReferenced=0;for(let i=0;i<locks.length;i++)if(locks[i]&&originalUsed.has(i))lockedReferenced++; const vertexKey=i=>[positions[i*3],positions[i*3+1],positions[i*3+2],...metrics.subarray(i*5,i*5+5)].join(',');const retainedKeys=new Set([...used].filter(i=>locks[i]).map(vertexKey));let equivalentLocked=0;for(let i=0;i<locks.length;i++)if(locks[i]&&originalUsed.has(i)&&!used.has(i)){assert(retainedKeys.has(vertexKey(i)),'Protected hero vertex geometry/attributes changed');equivalentLocked++;}
const stem=`${number}-${target}`,outputPath=path.join(out,`${stem}.glb`);await writeFile(outputPath,result);assert.equal(hash(await readFile(outputPath)),hash(result),'Persisted GLB differs from validated bytes');const report={number,sourceSha256:hash(raw),outputSha256:hash(result),sourceBytes:raw.length,outputBytes:result.length,sourceTriangles:indices.length/3,triangles:reduced.length/3,sourceVertices:vertexCount,vertices:count,targetTriangles:target,relativeAttributeError:error,errorLimit,lockedVertices:locked,lockedVerticesRetained:lockedRetained,lockedReferencedVertices:lockedReferenced,equivalentDuplicateLocks:equivalentLocked,lock:{minY,maxY:Number.isFinite(maxY)?maxY:null,halfWidth:lockX},worldBounds:bounds.map(x=>x.toArray()),decodedGeometryBytes:fallback,compressedViews:compressed,byteExactCompressionRoundTrip:true,nodeTransformsPreserved:true,materialsPreserved:true,method:'UV/normal-aware meshopt edge collapse, central upper hero vertex locks, vertex compaction, 4096-to-2048 texture resampling encoded as PNG, lossless EXT_meshopt_compression'};await writeFile(path.join(out,`${stem}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));





