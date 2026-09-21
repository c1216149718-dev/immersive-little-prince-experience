import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=fs.readFileSync('src/three/paper/paperMotion.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {PAPER_LAYOUT, paperStagePose, paperDebrisPose, paperWindRange}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const pieces=PAPER_LAYOUT.map((_,i)=>i);
for(const piece of pieces){
 for(let t=8.8;t<=13;t+=.013){const a=paperStagePose(piece,t,3.75),b=paperStagePose(piece,t,3.75);assert.deepEqual(a,b);assert(Object.values(a).every(Number.isFinite));assert.deepEqual(paperStagePose(piece,t,0,true),paperStagePose(piece,t,50,true));}
 const end=paperStagePose(piece,11.05,0);assert(Math.abs(end.x)>10||end.y>=20);
 assert.notEqual(paperStagePose(piece,9.38,1).rotation,paperStagePose(piece,9.38,2).rotation);
 assert.deepEqual(paperStagePose(piece,11.05,1),paperStagePose(piece,11.05,99));
}
let peak=0;
for(let t=9;t<=11.1;t+=.007){let count=0;for(let i=0;i<48;i++){const a=paperDebrisPose(i,t);assert.deepEqual(a,paperDebrisPose(i,t));assert.equal(paperDebrisPose(i,t,true),null);if(a){count++;assert(Object.values(a).every(Number.isFinite));}}peak=Math.max(peak,count);for(let i=0;i<4;i++){const p=paperWindRange(i,t);assert(p.start>=0&&p.count>=0&&p.start+p.count<=128);}}
for(let i=0;i<48;i++)assert.equal(paperDebrisPose(i,11.03),null);
const report={deterministicPoses:true,readingIdleMoves:true,reducedMotionStable:true,finalPosesOffscreen:true,debrisEndsAt11_03:true,windRangesValid:true,peakActiveChips:peak};console.log(report);

// Prelude leaves must not teleport when the stronger wind begins.
for(let i=0;i<5;i++){const a=paperDebrisPose(i,9.55-1e-5),b=paperDebrisPose(i,9.55+1e-5);assert(a&&b);for(const key of Object.keys(a))assert(Math.abs(a[key]-b[key])<.01);}
