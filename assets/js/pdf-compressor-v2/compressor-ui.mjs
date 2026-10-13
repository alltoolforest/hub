// Isolated Task 11 interface. Engine and resource budget are supplied by the host.
import {createCompressionSession} from './compression-session.mjs';
export const formatBytes=n=>n<1000000?(n/1000).toFixed(1)+' KB':(n/1000000).toFixed(2)+' MB';
export function mountCompressor(root,{engine,limits}={}){
  if(!root||!limits)throw new TypeError('A root and verified resource budget are required');
  root.innerHTML=`<div class="pdf-compressor">
    <h1>PDF Compressor</h1>
    <p>Choose a PDF, select a compression mode, then review and download the result. Processing stays on this device.</p>
    <p data-limit></p>
    <label for="compressor-file">Select PDF</label>
    <input id="compressor-file" type="file" accept="application/pdf,.pdf">
    <p data-source></p>
    <label for="compressor-mode">Compression mode</label>
    <select id="compressor-mode" aria-describedby="compressor-quality">
      <option value="balanced">Balanced</option><option value="strong">Strong</option>
      <option value="lossless">Lossless</option>
    </select>
    <p id="compressor-quality"></p>
    <div class="compressor-actions"><button data-run disabled>Compress PDF</button>
      <button data-cancel hidden>Cancel</button><button data-clear>Clear PDF</button></div>
    <p data-status role="status" aria-live="polite" aria-atomic="true">Select a PDF to begin.</p>
    <section data-result hidden aria-label="Compression result"><h2>Your result</h2>
      <dl><dt>Original size</dt><dd data-original></dd><dt>Output size</dt><dd data-output></dd>
      <dt>Saved</dt><dd data-saved></dd></dl><p data-outcome></p>
      <a data-download>Download PDF</a></section>
    <p>Keep your original PDF. Balanced and Strong may reduce image quality; existing text stays selectable. Lossless preserves image quality. Some PDFs cannot be made smaller.</p>
  </div>`;
  const el=s=>root.querySelector(s),file=el('#compressor-file'),mode=el('#compressor-mode');
  const quality={balanced:'Balanced reduces eligible images moderately while preserving text and page layout.',
    strong:'Strong prioritizes smaller files and may make eligible images less detailed.',
    lossless:'Lossless optimizes PDF structure without reducing image quality. Savings may be small or zero.'};
  const showMode=()=>{el('#compressor-quality').textContent=quality[mode.value];};
  showMode();mode.addEventListener('change',showMode);
  el('[data-limit]').textContent=`Current tested input limit: ${formatBytes(limits.maxBytes)}. Image and document complexity limits also apply.`;
  const session=createCompressionSession({engine,limits,onChange:s=>{
    const busy=['loading','processing'].includes(s.state);
    file.disabled=busy;mode.disabled=busy;el('[data-run]').disabled=!s.canRetry;
    el('[data-cancel]').hidden=!busy;el('[data-result]').hidden=!s.canDownload;
    // Keep live status outside an aria-busy ancestor so progress can be announced.
    root.dataset.processing=String(busy);
    el('[data-source]').textContent=s.source?`${s.source.name} · ${formatBytes(s.source.size)}`:'';
    const statuses={empty:'Select a PDF to begin.',loading:'Checking your PDF…',ready:'PDF ready. Choose a mode and compress.',
      processing:'Compressing and verifying your PDF…',cancelled:'Cancelled. You can retry with the same PDF.'};
    el('[data-status]').textContent=s.state==='failed'?s.error.message:
      s.state==='completed'?'Your verified PDF is ready to download.':statuses[s.state];
    const link=el('[data-download]');
    if(s.canDownload){
      const r=s.result;el('[data-original]').textContent=formatBytes(r.inputBytes);
      el('[data-output]').textContent=formatBytes(r.outputBytes);
      el('[data-saved]').textContent=`${formatBytes(r.savedBytes)} (${r.reductionPercent.toFixed(2)}%)`;
      el('[data-outcome]').textContent=r.savedBytes>0?'Compression verified. Review the downloaded PDF before using it.':
        'No smaller verified output was found. The download contains your original PDF.';
      link.href=r.url;link.download=r.name;
    }else{link.removeAttribute('href');link.removeAttribute('download');}
  }});
  file.addEventListener('change',()=>{if(file.files[0])void session.select(file.files[0]);});
  el('[data-run]').addEventListener('click',()=>{if(session.snapshot().canRetry)void session.compress(mode.value);});
  el('[data-cancel]').addEventListener('click',session.cancel);
  el('[data-clear]').addEventListener('click',()=>{session.reset();file.value='';});
  const dispose=()=>{session.dispose();file.value='';};
  globalThis.addEventListener('pagehide',dispose);
  return {session,dispose:()=>{globalThis.removeEventListener('pagehide',dispose);dispose();},
    progress:stage=>{if(session.snapshot().state==='processing')el('[data-status]').textContent=
      ({inspect:'Checking PDF…','embedded-images':'Compressing eligible images…',lossless:'Optimizing PDF structure…',
        'lossless-optimization':'Optimizing PDF structure…','final-output':'Verifying the output…'})[stage]??'Processing PDF…';}};
}
