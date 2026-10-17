// Comparative managed-memory sampling; not whole-process RSS or physical RAM.
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
const path=process.env.PDF_COMPRESSOR_MOBILE_QA_OUTPUT,output=process.env.PDF_COMPRESSOR_PERFORMANCE_OUTPUT;
if(!path||!output)throw Error('Provide diagnostic and scratch evidence paths');
async function scans(count,width,height){
  const doc=await PDF.PDFDocument.create(),N=PDF.PDFName.of;let seed=123456;
  for(let n=0;n<count;n++){
    const raw=new Uint8Array(width*height*3);
    for(let p=0;p<width*height;p++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const x=p%width,y=Math.floor(p/width),stroke=y%90>=20&&y%90<26&&x>100&&x<width-100&&x%120<90;
      const gray=(stroke?20:220)+(seed>>>28);raw[p*3]=raw[p*3+1]=raw[p*3+2]=gray;
    }
    const ref=doc.context.register(doc.context.flateStream(raw,{Type:'XObject',Subtype:'Image',
      Width:width,Height:height,BitsPerComponent:8,ColorSpace:'DeviceRGB'}));
    const page=doc.addPage([600,800]);page.node.set(N('Resources'),doc.context.obj({XObject:{Image:ref}}));
    page.pushOperators(PDF.pushGraphicsState(),PDF.scale(600,800),PDF.drawObject('Image'),PDF.popGraphicsState());
  }
  return new Uint8Array(await doc.save({useObjectStreams:false}));
}
const sources=[{id:'small-mixed',bytes:(await buildFixture('mixed')).bytes},
  {id:'medium-scan',bytes:await scans(1,1800,2500)},
  {id:'large-scan',bytes:await scans(2,2400,3000)}];
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),remote=[];
  await page.route('**/*',route=>{
    if(/^(file:|blob:)/.test(route.request().url()))return route.continue();
    remote.push(route.request().url());return route.abort();
  });
  const root=await browser.newBrowserCDPSession(),main=await page.context().newCDPSession(page);
  const sessions=new Map(),pending=new Map();let sequence=0;
  root.on('Target.receivedMessageFromTarget',event=>{
    const response=JSON.parse(event.message),item=pending.get(response.id);
    if(item&&item.sessionId===event.sessionId){pending.delete(response.id);clearTimeout(item.timer);item.resolve(response.result??null);}
  });
  const workerHeap=sessionId=>new Promise(resolve=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);resolve(null);},500);
    pending.set(id,{resolve,timer,sessionId});
    root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method:'Runtime.getHeapUsage'})})
      .catch(()=>{const item=pending.get(id);if(item){clearTimeout(item.timer);pending.delete(id);resolve(null);}});
  });
  async function sample(){
    const {targetInfos}=await root.send('Target.getTargets'),live=new Set();
    for(const target of targetInfos.filter(t=>t.type==='worker')){
      live.add(target.targetId);
      if(!sessions.has(target.targetId))try{
        const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});sessions.set(target.targetId,sessionId);
      }catch{/* Worker may finish between discovery and attachment. */}
    }
    for(const id of sessions.keys())if(!live.has(id))sessions.delete(id);
    const values=await Promise.all([...sessions.values()].map(workerHeap));
    return {main:await main.send('Runtime.getHeapUsage'),workers:values.filter(Boolean)};
  }
  const cpuLedger=new Map();
  async function cpu(){
    try{const {processInfo}=await root.send('SystemInfo.getProcessInfo');
      for(const p of processInfo)cpuLedger.set(p.id,Math.max(cpuLedger.get(p.id)??0,p.cpuTime));
      const total=[...cpuLedger.values()].reduce((a,b)=>a+b,0);return total>0?total:null;
    }catch{return null;}
  }
  await page.goto(pathToFileURL(path).href);const rows=[];
  const wait=()=>page.waitForFunction(()=>/^(Completed:|Test failed)/.test(document.querySelector('#status').textContent),{},{timeout:180000});
  for(const source of sources){
    assert.ok(source.bytes.length<=20*1024*1024);
    await page.locator('#file').setInputFiles({name:source.id+'.pdf',mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});
    await page.waitForFunction(()=>/^Ready:/.test(document.querySelector('#status').textContent),{},{timeout:120000});
    const modes=source.id==='small-mixed'?['balanced','strong','lossless','balanced','balanced']:['balanced','strong','lossless'];
    for(const mode of modes){
      await page.locator('#mode').selectOption(mode);const baseline=await sample(),cpuBefore=await cpu();
      const peaks={mainUsedBytes:baseline.main.usedSize,mainBackingBytes:baseline.main.backingStorageSize??0,
        workerUsedBytes:null,workerBackingBytes:null,workerEmbedderBytes:null};let samples=0,sampling=false;
      const measure=async()=>{
        if(sampling)return;sampling=true;
        try{const memory=await sample();samples++;
          peaks.mainUsedBytes=Math.max(peaks.mainUsedBytes,memory.main.usedSize);
          peaks.mainBackingBytes=Math.max(peaks.mainBackingBytes,memory.main.backingStorageSize??0);
          for(const w of memory.workers){
            peaks.workerUsedBytes=Math.max(peaks.workerUsedBytes??0,w.usedSize);
            peaks.workerBackingBytes=Math.max(peaks.workerBackingBytes??0,w.backingStorageSize??0);
            peaks.workerEmbedderBytes=Math.max(peaks.workerEmbedderBytes??0,w.embedderHeapUsedSize??0);
          }
        }catch{/* Closed targets cannot provide a final sample. */}finally{sampling=false;}
      };
      const timer=setInterval(measure,100);
      try{
        await page.locator('#run').click();await wait();clearInterval(timer);
        while(sampling)await page.waitForTimeout(10);
        assert.match(await page.locator('#status').textContent(),/^Completed:/);
        const report=JSON.parse(await page.locator('#report').textContent()),cpuAfter=await cpu();
        assert.equal(report.resources.activeWorkers,0);assert.equal(report.resources.workersStarted,report.resources.workersTerminated);
        assert.ok(report.outputBytes<=report.inputBytes);
        rows.push({fixture:source.id,mode,inputBytes:report.inputBytes,outputBytes:report.outputBytes,
          engineMs:report.engineMs,wallMs:report.wallMs,maxUiGapMs:report.maxUiGapMs,samples,sampledManagedMemoryPeaks:peaks,
          processCPUSeconds:cpuBefore!==null&&cpuAfter!==null?Number((cpuAfter-cpuBefore).toFixed(3)):null,resources:report.resources});
        console.log(JSON.stringify(rows.at(-1)));
      }finally{clearInterval(timer);}
    }
  }
  await page.locator('#mode').selectOption('lossless');await page.locator('#run').click();
  await page.waitForFunction(()=>QA_PHASE==='lossless-optimization',{},{timeout:120000});
  await page.waitForTimeout(150);await page.locator('#cancel').click();await page.waitForTimeout(250);
  assert.match(await page.locator('#status').textContent(),/^Cancelled/);
  assert.equal(await page.locator('#download').isVisible(),false);assert.equal(await page.evaluate(()=>QA_WORKERS.length),0);
  await page.locator('#reset').click();await main.send('HeapProfiler.collectGarbage');const resetMemory=await main.send('Runtime.getHeapUsage');
  assert.deepEqual(remote,[]);
  writeFileSync(output,JSON.stringify({environment:'Linux headless Chromium '+browser.version(),
    metricNote:'CDP Runtime counters sampled about every 100 ms. Managed heap/backing storage only; excludes complete process/GPU/native RAM. Samples may miss transient peaks. Null CPU means unavailable. Not physical-device certification.',
    rows,resetMemory,cancelDuringLossless:true,noRemoteRequests:true},null,2));
}finally{await browser.close();}
