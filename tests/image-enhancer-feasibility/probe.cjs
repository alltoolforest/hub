// Isolated Task 2 graph/runtime probe. Never imported by the application.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

async function main() {
  const [modelPath, expectedHash] = process.argv.slice(2);
  if (!modelPath || !/^[a-f0-9]{64}$/.test(expectedHash || '')) throw Error('Usage: node probe.cjs MODEL EXPECTED_SHA256; set ONNX_SCHEMA_PATH and ORT_PACKAGE_PATH');
  const bytes = fs.readFileSync(modelPath);
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) throw Error('Model hash mismatch; refusing to decode or execute');
  const { onnx } = require(path.resolve(process.env.ONNX_SCHEMA_PATH));
  const model = onnx.ModelProto.decode(bytes);
  if (model.graph.initializer.some(x => x.externalData?.length)) throw Error('External tensors require separate integrity verification');
  const ops = {};
  function visit(graph) {
    for (const n of graph.node) {
      const key = `${n.domain || 'ai.onnx'}:${n.opType}`;
      ops[key] = (ops[key] || 0) + 1;
      for (const a of n.attribute || []) { if (a.g) visit(a.g); for (const g of a.graphs || []) visit(g); }
    }
  }
  visit(model.graph);
  const shape = x => ({name:x.name, type:x.type?.tensorType?.elemType, dims:x.type?.tensorType?.shape?.dim.map(d=>d.dimParam || Number(d.dimValue))});
  const report = {kind:'synthetic-node-wasm-probe', photographicQuality:'NOT_EVALUATED', browserViability:'NOT_EVALUATED', conversionParity:'NOT_EVALUATED', sha256:actualHash, bytes:bytes.length,
    host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,node:process.version},
    graph:{opsets:model.opsetImport.map(x=>({domain:x.domain||'ai.onnx',version:Number(x.version)})),ops,inputs:model.graph.input.map(shape),outputs:model.graph.output.map(shape)},runs:[]};
  const root = path.resolve(process.env.ORT_PACKAGE_PATH);
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  const ort = require(root);
  report.runtime={name:pkg.name,version:pkg.version,provider:'wasm',threads:1};
  ort.env.wasm.numThreads=1;
  let session;
  try {
    const start=performance.now();
    session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
    report.sessionMs=performance.now()-start;
    if (session.inputNames.length!==1) throw Error('Probe supports single RGB input only');
    const input=model.graph.input.find(x=>x.name===session.inputNames[0]);
    if (input.type.tensorType.elemType!==1) throw Error('Probe requires float32 input; do not silently convert');
    const data=Float32Array.from({length:3*64*64},(_,i)=>(i%251)/250);
    for(let i=0;i<2;i++) {
      const t=new ort.Tensor('float32',data,[1,3,64,64]);
      const then=performance.now();
      const result=await session.run({[session.inputNames[0]]:t});
      const elapsedMs=performance.now()-then;
      const out=result[session.outputNames[0]];
      const hash=crypto.createHash('sha256').update(Buffer.from(out.data.buffer,out.data.byteOffset,out.data.byteLength)).digest('hex');
      report.runs.push({elapsedMs,dims:out.dims,finite:Array.from(out.data).every(Number.isFinite),sha256:hash,rssBytes:process.memoryUsage().rss});
      t.dispose(); for(const x of Object.values(result)) x.dispose();
    }
    report.repeatEqual=report.runs[0].sha256===report.runs[1].sha256;
    if(!report.repeatEqual || report.runs.some(x=>!x.finite)) throw Error('Nondeterministic or nonfinite probe output');
    report.status='PASS_DIAGNOSTIC_ONLY';
  } catch(e) { report.status='FAIL'; report.error=e.message; process.exitCode=1; }
  finally { if(session) await session.release(); report.processMaxRssKiB=os.platform()==='linux'?process.resourceUsage().maxRSS:null; }
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
