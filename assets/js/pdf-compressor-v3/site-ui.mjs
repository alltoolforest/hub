// PDF Compressor V3 only: private browser-side UI and disposable worker.
// Shared AllToolForest app routing and frozen tools remain untouched.
const MAX_BYTES=100_000_000;
const display=n=>n>=1_000_000?(n/1e6).toFixed(2)+' MB':(n/1000).toFixed(1)+' KB';
export function mountV3Compressor(root,{
  workerFactory=()=>new Worker(new URL('./dist/worker.js',import.meta.url),{type:'classic'}),
  timeoutMs=240000
}={}){
 if(!root||typeof workerFactory!=='function')throw new TypeError('V3 root and worker required');
 root.innerHTML=`<div class="atf-v3">
  <h2>PDF Compressor V3</h2>
  <p>Reduce PDF size directly in your browser. Your file is not uploaded.</p>
  <p>Accepts PDFs up to 100 MB. Large documents may take longer on some devices.</p>
  <label for="v3-file">Select PDF</label>
  <input id="v3-file" type="file" accept=".pdf,application/pdf">
  <p data-v3-file-status></p>
  <label for="v3-mode">Compression strength</label>
  <select id="v3-mode">
    <option value="balanced">Balanced</option>
    <option value="strong">Strong</option>
    <option value="maximum">Maximum — smallest valid output</option>
    <option value="lossless">Lossless — preserve image quality</option>
  </select>
  <label class="v3-agree"><input id="v3-flatten" type="checkbox">
    I allow aggressive page flattening if it makes my PDF smaller.
  </label>
  <p id="v3-risk">Flattening can remove selectable text, forms, hyperlinks,
    annotations, bookmarks, attachments and document tags. The compressed PDF
    will still contain rendered pages. Leave unchecked to preserve document features.</p>
  <div class="v3-controls">
    <button type="button" data-v3-run disabled>Compress PDF</button>
    <button type="button" data-v3-cancel hidden>Cancel</button>
    <button type="button" data-v3-clear>Clear</button>
  </div>
  <p role="status" aria-live="polite" aria-atomic="true" data-v3-status>Select a PDF to begin.</p>
  <section data-v3-result hidden aria-label="Verified compression result">
    <h3>Compression result</h3>
    <dl>
      <dt>Original</dt><dd data-v3-in></dd>
      <dt>Output</dt><dd data-v3-out></dd>
      <dt>Saved</dt><dd data-v3-saved></dd>
      <dt>Processing time</dt><dd data-v3-time></dd>
      <dt>Strategy</dt><dd data-v3-strategy></dd>
    </dl>
    <p data-v3-warning></p>
    <a data-v3-download download>Download compressed PDF</a>
  </section>
  </div>`;
 const q=s=>root.querySelector(s),file=q('#v3-file'),mode=q('#v3-mode');
 const consent=q('#v3-flatten'),run=q('[data-v3-run]'),cancel=q('[data-v3-cancel]');
 let worker=null,timer=null,outputURL=null,disposed=false,busy=false;
 const safeStatus=(message)=>{q('[data-v3-status]').textContent=message;};
 const clearOutput=()=>{
   if(outputURL){URL.revokeObjectURL(outputURL);outputURL=null;}
   q('[data-v3-result]').hidden=true;
   const a=q('[data-v3-download]');a.removeAttribute('href');a.removeAttribute('download');
 };
 const sync=()=>{
   const f=file.files?.[0],eligible=!busy&&f&&f.size>=16&&f.size<=MAX_BYTES;
   run.disabled=!eligible;
   file.disabled=busy;mode.disabled=busy;consent.disabled=busy||mode.value==='lossless';
   cancel.hidden=!busy;
   q('[data-v3-file-status]').textContent=f?
     `${f.name} · ${display(f.size)}`:'';
 };
 const stop=()=>{
   if(worker){worker.terminate();worker=null;}
   if(timer!==null){clearTimeout(timer);timer=null;}
   busy=false;sync();
 };
 const fail=code=>{
   stop();clearOutput();
   const labels={
     'signed-or-certified-pdf':'Digitally signed PDFs cannot be modified safely.',
     'encrypted-pdf':'Encrypted PDFs are not supported.',
     'unreadable-or-encrypted-pdf':'The PDF could not be opened or is encrypted.',
     'active-content-pdf':'This PDF contains an unsafe active action.',
     'input-too-large':'PDF exceeds the 100 MB file limit.',
     'page-limit':'Document page count exceeds a safe processing budget.',
     'security-structure-limit':'The PDF structure exceeded the safety budget.',
     'processing-timeout':'The document took too long. Try a lower-complexity file.',
     'independent-output-verification-failed':'The compressed output could not be verified.',
     'file-limit':'Select a valid PDF up to 100 MB.'
   };
   safeStatus(labels[code]??`Compression could not finish safely (${String(code).slice(0,64)}). Your original PDF is unchanged.`);
 };
 const process=()=>{
   if(busy||disposed||run.disabled)return;
   const f=file.files?.[0];if(!f)return;
   if(f.size>MAX_BYTES){fail('file-limit');return;}
   clearOutput();
   busy=true;sync();safeStatus('Checking PDF security and preparing compression…');
   try{worker=workerFactory();}
   catch{fail('worker-unavailable');return;}
   worker.onerror=()=>fail('worker-error');
   worker.onmessageerror=()=>fail('worker-message-error');
   worker.onmessage=event=>{
     if(!busy||disposed)return;
     const data=event.data;
     if(data?.type==='progress'){
       const d=data.detail;
       if(data.stage==='raster'&&Number.isInteger(d?.completed))
         safeStatus(`Compressing page ${d.completed} of ${d.total}…`);
       else safeStatus('Compressing and verifying document…');
       return;
     }
     if(data?.type==='error'){fail(data.code??'processing-failed');return;}
     if(data?.type!=='result')return;
     stop();
     if(data.status!=='compressed'||!(data.bytes instanceof Uint8Array)){
       safeStatus(data.mode==='lossless'?
         'Lossless did not produce a smaller verified PDF; the original is unchanged.':
         'No smaller verified PDF was produced. You can enable page flattening for more aggressive compression.');
       return;
     }
     if(!Number.isSafeInteger(data.inputBytes)||!Number.isSafeInteger(data.outputBytes)||
       data.outputBytes>=data.inputBytes||data.outputBytes!==data.bytes.length){
       fail('invalid-output-receipt');return;
     }
     outputURL=URL.createObjectURL(new Blob([data.bytes],{type:'application/pdf'}));
     q('[data-v3-in]').textContent=display(data.inputBytes);
     q('[data-v3-out]').textContent=display(data.outputBytes);
     q('[data-v3-saved]').textContent=display(data.savedBytes)+
       ' ('+data.reductionPercent.toFixed(2)+'%)';
     q('[data-v3-time]').textContent=(data.engineMs/1000).toFixed(1)+' seconds';
     q('[data-v3-strategy]').textContent=data.selectedStrategy==='raster'?
       'Aggressive page flattening':'Selective image recompression';
     q('[data-v3-warning]').textContent=data.destructive?
       'This output is flattened: selectable text, forms, bookmarks, attachments and links are not preserved.':
       'Document page programs and text were independently verified.';
     const a=q('[data-v3-download]');
     a.href=outputURL;a.download=(f.name.replace(/\.pdf$/i,'').slice(0,100)||'document')+'-compressed.pdf';
     q('[data-v3-result]').hidden=false;
     safeStatus('Verified PDF ready to download.');
   };
   timer=setTimeout(()=>fail('processing-timeout'),timeoutMs);
   worker.postMessage({op:'compress',file:f,mode:mode.value,
     allowFlatten:mode.value!=='lossless'&&consent.checked});
 };
 file.addEventListener('change',()=>{clearOutput();sync();safeStatus('PDF selected. Choose strength and compress.');});
 mode.addEventListener('change',()=>{sync();clearOutput();});
 consent.addEventListener('change',()=>clearOutput());
 run.addEventListener('click',process);
 cancel.addEventListener('click',()=>{if(busy){stop();clearOutput();safeStatus('Cancelled. Your original PDF is unchanged.');}});
 q('[data-v3-clear]').addEventListener('click',()=>{
   stop();clearOutput();file.value='';consent.checked=false;sync();
   safeStatus('Select a PDF to begin.');
 });
 const dispose=()=>{disposed=true;stop();clearOutput();};
 globalThis.addEventListener('pagehide',dispose,{once:true});
 sync();
 return {dispose};
}
