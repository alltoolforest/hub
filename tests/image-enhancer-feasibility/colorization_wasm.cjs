// Exact exported colorization graph in Node WASM, not a browser/device test.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const assert=require('node:assert/strict');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const [folder,ortPackage,out]=process.argv.slice(2);
 if(!out)throw Error('Usage: colorization_wasm.cjs EXPORT_FOLDER ORT_PACKAGE REPORT');
 const baseline=JSON.parse(fs.readFileSync(path.join(folder,'results.json')));
 assert.equal(baseline.pass,true);
 const bytes=fs.readFileSync(path.join(folder,'eccv16-fp32.onnx'));assert.equal(hash(bytes),baseline.onnxSha256);
 const load=(name,size)=>{const b=fs.readFileSync(path.join(folder,name));assert.equal(b.length,size*4);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
 const input=load('input.f32',256*256),reference=load('native-output.f32',2*256*256);
 const ort=require(path.resolve(ortPackage));ort.env.wasm.numThreads=1;
 const report={kind:'colorization-node-wasm-parity',modelSha256:baseline.onnxSha256,bytes:bytes.length,
  runtime:JSON.parse(fs.readFileSync(path.join(ortPackage,'package.json'))).version,
  host:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,node:process.version},threads:1,
  inputSha256:hash(Buffer.from(input.buffer)),nativeOutputSha256:hash(Buffer.from(reference.buffer)),runs:[],production:false,
  limitations:['One photographic luminance input; no full quality or browser/device acceptance','No application integration or default colorization']};
 let session;
 try{
  let start=performance.now();session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});report.sessionMs=performance.now()-start;
  for(let n=0;n<2;n++){
   const tensor=new ort.Tensor('float32',input,[1,1,256,256]);let outputs;
   try{
    start=performance.now();outputs=await session.run({[session.inputNames[0]]:tensor});
    const elapsedMs=performance.now()-start,result=outputs[session.outputNames[0]];
    assert.deepEqual(result.dims,[1,2,256,256]);let max=0,total=0,pass=true;
    for(let i=0;i<reference.length;i++){const d=Math.abs(result.data[i]-reference[i]);max=Math.max(max,d);total+=d;if(!Number.isFinite(result.data[i])||d>1e-4+1e-4*Math.abs(reference[i]))pass=false;}
    report.runs.push({elapsedMs,maxAbsChromaDifference:max,meanAbsChromaDifference:total/reference.length,pass,
     outputSha256:hash(Buffer.from(result.data.buffer,result.data.byteOffset,result.data.byteLength))});
   }finally{tensor.dispose();for(const t of Object.values(outputs||{}))t.dispose();}
  }
  report.repeatEqual=report.runs[0].outputSha256===report.runs[1].outputSha256;
  report.pass=report.repeatEqual&&report.runs.every(r=>r.pass);
 }catch(error){report.pass=false;report.error=error.message;}
 finally{if(session)await session.release();report.processMaxRssKiB=process.resourceUsage().maxRSS;}
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
