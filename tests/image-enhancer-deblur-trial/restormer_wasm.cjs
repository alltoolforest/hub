// Isolated ORT Web execution and native-output parity; no browser/device claim.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const [folder, ortPackage, output] = process.argv.slice(2);
  if (!output) throw Error('Usage: restormer_wasm.cjs EXPORT_FOLDER ORT_PACKAGE OUTPUT_JSON');
  const exported = JSON.parse(fs.readFileSync(path.join(folder,'export-results.json')));
  assert.equal(exported.pass,true,'Require sampled original-framework parity first');
  const bytes = fs.readFileSync(path.join(folder,'restormer-defocus-fp32.onnx'));
  assert.equal(hash(bytes),exported.onnxSha256,'Model integrity');
  const load = name => {
    const bytes = fs.readFileSync(path.join(folder,name));
    assert.equal(bytes.length,3*88*128*4);
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  };
  const input=load('coffee-input.f32'), reference=load('coffee-native-output.f32');
  const ort = require(path.resolve(ortPackage));ort.env.wasm.numThreads=1;
  const report={kind:'restormer-photographic-node-wasm-parity',production:false,
    modelSha256:exported.onnxSha256,bytes:bytes.length,shape:[1,3,88,128],
    inputSha256:hash(Buffer.from(input.buffer)),nativeOutputSha256:hash(Buffer.from(reference.buffer)),
    runtime:JSON.parse(fs.readFileSync(path.join(ortPackage,'package.json'))).version,
    host:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,node:process.version},
    threads:1,runs:[],limitations:['Node WASM is not physical-device or browser acceptance',
      'One small photographic input; no full-size/tiled/cancellation/quality acceptance']};
  let session;
  try {
    const start=performance.now();
    session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
    report.sessionMs=performance.now()-start;
    for(let i=0;i<2;i++) {
      const tensor=new ort.Tensor('float32',input,[1,3,88,128]);let outputs;
      try {
        const start=performance.now();outputs=await session.run({[session.inputNames[0]]:tensor});
        const elapsedMs=performance.now()-start,out=outputs[session.outputNames[0]];
        assert.deepEqual(out.dims,[1,3,88,128]);
        let max=0,total=0,pass=true;
        for(let k=0;k<reference.length;k++) {
          const delta=Math.abs(out.data[k]-reference[k]);
          if(!Number.isFinite(out.data[k])||delta>1e-5+1e-4*Math.abs(reference[k]))pass=false;
          max=Math.max(max,delta);total+=delta;
        }
        report.runs.push({elapsedMs,maxAbsDifference:max,meanAbsDifference:total/reference.length,
          pass,outputSha256:hash(Buffer.from(out.data.buffer,out.data.byteOffset,out.data.byteLength))});
      } finally {tensor.dispose();for(const t of Object.values(outputs||{}))t.dispose();}
    }
    report.repeatEqual=report.runs[0].outputSha256===report.runs[1].outputSha256;
    report.pass=report.repeatEqual&&report.runs.every(r=>r.pass);
  } catch(error) {report.pass=false;report.error=error.message;}
  finally {if(session)await session.release();report.processMaxRssKiB=process.resourceUsage().maxRSS;}
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  if(!report.pass)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
