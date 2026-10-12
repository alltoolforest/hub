// Reuse previous R2 pixel outputs; never rerun the completed detail pipeline.
// node render-finish-r3.mjs corpus.json r2-directory output-directory
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {FINISH_R3,finishStrip} from './finish-r3.js';
import {assertDimensions,createIntegrity,inspectStrip,finishIntegrity} from '../assets/js/photo-integrity.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const corpus=JSON.parse(readFileSync(process.argv[2])),previous=resolve(process.argv[3]),dest=resolve(process.argv[4]);
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
assert.ok(relative(repo,dest).startsWith('../'),'Private outputs must be outside repository');
const retained=JSON.parse(readFileSync(resolve(previous,'report.json')));
mkdirSync(dest,{recursive:true});
const records=[];
for(const c of corpus.cases){
  assert.match(c.id,/^[a-z0-9-]+$/);assert.ok(['calibration','diagnostic'].includes(c.split));assertDimensions(c.width,c.height);
  const prior=retained.records.find(r=>r.id===c.id);assert.ok(prior);assert.equal(prior.input_sha256,c.input_sha256);
  const input=new Uint8ClampedArray(readFileSync(c.raw));assert.equal(hash(input),c.input_sha256);
  const r2=new Uint8ClampedArray(readFileSync(resolve(previous,c.id+'-tone-r2.rgba')));assert.equal(hash(r2),prior.trial_sha256);
  assert.equal(r2.length,c.width*c.height*4);assert.equal(input.length,r2.length);
  for(const [name,settings] of Object.entries(FINISH_R3)){
    const out=new Uint8ClampedArray(r2.length),integrity=createIntegrity(c.width,c.height),start=performance.now();
    for(let y=0;y<c.height;y+=96){const n=Math.min(96,c.height-y),begin=y*c.width*4,end=(y+n)*c.width*4;
      const strip=finishStrip(r2.subarray(begin,end),settings);out.set(strip,begin);inspectStrip(integrity,input.subarray(begin,end),strip,0,n,y);
    }
    assert.equal(hash(r2),prior.trial_sha256);writeFileSync(resolve(dest,c.id+'-'+name+'.rgba'),out);
    records.push({id:c.id,variant:name,width:c.width,height:c.height,settings,input_sha256:c.input_sha256,r2_sha256:prior.trial_sha256,output_sha256:hash(out),integrity:finishIntegrity(integrity),finishOnlyMs:performance.now()-start});
  }
}
writeFileSync(resolve(dest,'render-report.json'),JSON.stringify({enabledInWorker:false,records},null,2)+'\n');
console.log(JSON.stringify({outputs:records.length,integrityPassed:records.every(r=>r.integrity.passed),detailPipeline:'retained R2 outputs; no new spatial filtering'}));
