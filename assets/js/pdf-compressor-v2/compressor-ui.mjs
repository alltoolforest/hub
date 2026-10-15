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
      <option value="maximum">Maximum Compression</option><option value="lossless">Lossless</option>
    </select>
    <p id="compressor-quality"></p>
    <div class="compressor-target"><label for="compressor-target">Optional target size (MB)</label>
      <input id="compressor-target" type="number" inputmode="decimal" min="0.01" max="100" step="any"
        placeholder="e.g. 5" aria-describedby="compressor-target-help">
      <p id="compressor-target-help">Best effort, not a guaranteed size. The engine tries up to your selected compression level, preserves selectable text and verifies each result. Allow extra processing time.</p>
    </div>
    <div class="compressor-actions"><button data-run disabled>Compress PDF</button>
      <button data-cancel hidden>Cancel</button><button data-clear>Clear PDF</button></div>
    <p data-status role="status" aria-live="polite" aria-atomic="true">Select a PDF to begin.</p>
    <section data-result hidden aria-label="Compression result"><h2>Your result</h2>
      <dl><dt>Mode used</dt><dd data-result-mode></dd><dt>Original size</dt><dd data-original></dd><dt>Output size</dt><dd data-output></dd>
      <dt>Saved</dt><dd data-saved></dd></dl><p data-outcome></p>
      <a data-download>Download PDF</a></section>
    <p>Keep your original PDF. Balanced, Strong and Maximum may reduce embedded-image quality; Maximum may make text within scanned images less readable. Existing selectable text stays selectable. Lossless preserves image quality. Some PDFs cannot be made smaller.</p>
  </div>`;
  const el=s=>root.querySelector(s),file=el('#compressor-file'),mode=el('#compressor-mode'),target=el('#compressor-target');
  const readTarget=()=>{
    if(mode.value==='lossless'||!target.value.trim())return undefined;
    const input=Number(target.value);
    if(target.validity.badInput||!Number.isFinite(input)||input<=0||input>100||
      !Number.isSafeInteger(Math.round(input*1e6))||Math.round(input*1e6)<1)return NaN;
    return Math.round(input*1e6);
  };
  const syncTarget=()=>{
    target.disabled=mode.value==='lossless';
    const invalid=Number.isNaN(readTarget());
    target.setAttribute('aria-invalid',String(invalid));
    el('#compressor-target-help').textContent=mode.value==='lossless'?
      'Lossless preserves image quality; a target size requires Balanced, Strong or Maximum Compression.':
      invalid?'Enter a positive target size up to 100 MB, or leave this field empty.':
      'Best effort, not a guaranteed size. Compression may retry using a stronger verified profile up to the selected level. Allow extra processing time.';
    el('[data-run]').disabled=!session.snapshot().canRetry||invalid;
  };
  const quality={balanced:'Balanced reduces eligible images moderately while preserving text and page layout.',
    strong:'Strong prioritizes smaller files and may make eligible images less detailed.',
    maximum:'Maximum Compression aggressively reduces eligible image quality and resolution. Fine detail and text inside scanned images may become harder to read. Original selectable text is preserved.',
    lossless:'Lossless optimizes PDF structure without reducing image quality. Savings may be small or zero.'};
  const showMode=()=>{el('#compressor-quality').textContent=quality[mode.value];};
  showMode();mode.addEventListener('change',()=>{showMode();syncTarget();});
  target.addEventListener('input',()=>syncTarget());
  el('[data-limit]').textContent=`Input limit: ${formatBytes(limits.maxBytes)}. Image and document complexity limits also apply.`;
  const session=createCompressionSession({engine,limits,onChange:s=>{
    const busy=['loading','processing'].includes(s.state);
    file.disabled=busy;mode.disabled=busy;target.disabled=busy||mode.value==='lossless';
    el('[data-run]').disabled=!s.canRetry||Number.isNaN(readTarget());
    el('[data-cancel]').hidden=!busy;el('[data-result]').hidden=!s.canDownload;
    // Keep live status outside an aria-busy ancestor so progress can be announced.
    root.dataset.processing=String(busy);
    el('[data-source]').textContent=s.source?`Active PDF: ${s.source.name} · ${formatBytes(s.source.size)}`:'';
    const statuses={empty:'Select a PDF to begin.',loading:'Checking your PDF…',ready:'PDF selected. Full checks run when you compress.',
      processing:'Compressing and verifying your PDF…',cancelled:'Cancelled. You can retry with the same PDF.'};
    el('[data-status]').textContent=s.state==='failed'?s.error.message:
      s.state==='completed'?'Your verified PDF is ready to download.':statuses[s.state];
    const link=el('[data-download]');
    if(s.canDownload){
      const r=s.result;el('[data-result-mode]').textContent=r.target?
        r.target.effectiveMode+' (limit: '+r.mode+')':r.mode;el('[data-original]').textContent=formatBytes(r.inputBytes);
      el('[data-output]').textContent=formatBytes(r.outputBytes);
      el('[data-saved]').textContent=`${formatBytes(r.savedBytes)} (${r.reductionPercent.toFixed(2)}%)`;
      el('[data-outcome]').textContent=r.target?
        (r.target.reached?'Requested target '+formatBytes(r.target.requestedBytes)+' achieved. Review the verified PDF before using it.':
          'Requested target '+formatBytes(r.target.requestedBytes)+' could not be reached safely. Smallest verified result returned; the target is not guaranteed.'):
        r.savedBytes>0?(r.mode!=='lossless'&&r.settings?.imageTransformationApplied===false?
          'PDF structure optimized; image quality unchanged. Review the downloaded PDF before using it.':
          'Compression verified. Review the downloaded PDF before using it.'):
          'No smaller verified output was found. The download contains your original PDF.';
      link.href=r.url;link.download=r.name;
    }else{link.removeAttribute('href');link.removeAttribute('download');}
  }});
  file.addEventListener('change',()=>{if(file.files[0])void session.select(file.files[0]);});
  el('[data-run]').addEventListener('click',()=>{
    const targetBytes=readTarget();
    if(session.snapshot().canRetry&&!Number.isNaN(targetBytes))
      void session.compress(mode.value,{targetBytes});
  });
  el('[data-cancel]').addEventListener('click',session.cancel);
  el('[data-clear]').addEventListener('click',()=>{session.reset();file.value='';});
  syncTarget();
  const dispose=()=>{session.dispose();file.value='';};
  globalThis.addEventListener('pagehide',dispose);
  return {session,dispose:()=>{globalThis.removeEventListener('pagehide',dispose);dispose();},
    progress:stage=>{if(session.snapshot().state==='processing')el('[data-status]').textContent=
      ({inspect:'Checking PDF…','target-attempt':'Trying a verified compression level…','embedded-images':'Compressing eligible images…',lossless:'Optimizing PDF structure…',
        'lossless-inspection':'Checking preservation of PDF content…','lossless-optimization':'Optimizing PDF structure…','lossless-verification':'Verifying preserved PDF content…','final-output':'Verifying the output…'})[stage]??'Processing PDF…';}};
}
