import {verifyExport} from './verify.js';
import {safeFilename} from './engine.js';

import * as pdfjsLib from '../../assets/vendor/pdf.mjs';
import {ensurePdfPreviewCompatibility} from '../../assets/js/pdf-organizer-compat.js';
ensurePdfPreviewCompatibility();
(() => {
'use strict';

/* ---------- Config ---------- */
const WORKER_SRC = new URL('../../assets/vendor/pdf.worker.mjs', import.meta.url).href;
const THUMB_WIDTH = 360;      // px, internal thumbnail render width
const CACHE_LIMIT = 24;      // thumbnails kept in memory
const UNDO_LIMIT = 100;
const COLORS = ['#145940', '#1f6fb2', '#b4531a', '#7a3fa0', '#a8324b', '#5f7a14'];

if (!window.PDFLib || !window.Sortable) {
  document.getElementById('drop').innerHTML = '<strong>Could not load the PDF libraries.</strong><p class="hint">Check your connection or the script paths and reload.</p>';
  return;
}
const { PDFDocument, degrees, PageSizes, PDFName } = window.PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

/* ---------- State ---------- */
const S = { sources: [], items: [], undo: [], redo: [], nextUid: 1, nextSrc: 1, anchor: null, pv: null };
const $ = (id) => document.getElementById(id);
const el = {
  drop: $('drop'), file: $('file'), pick: $('pick'), ws: $('workspace'), files: $('files'), warnings: $('warnings'),
  grid: $('grid'), bar: $('bar'), stat: $('stat'), status: $('status'), toast: $('toast'), root: $('pdf-organizer'),
  zoom: $('zoom'), range: $('range'), outName: $('outName'), create: $('create'), blankSize: $('blankSize'),
  undo: $('undo'), redo: $('redo'), pv: $('pv'), pvCanvas: $('pvCanvas'), pvTitle: $('pvTitle')
};
let busy=false, cancelled=false, exportWorker=null, rejectExport=null, downloadURL=null, inspectWorker=null, rejectInspect=null, verifyTask=null;
function setBusy(value){
  busy=value; el.root.setAttribute('aria-busy',String(value));
  el.root.querySelectorAll('button,input,select').forEach(b=>{if(!['cancel','clearSession'].includes(b.id))b.disabled=value;});
  $('cancel').hidden=!value; $('progress').hidden=!value;
  if(!value)render();
}
$('cancel').addEventListener('click',()=>{
  cancelled=true;
  if(inspectWorker){inspectWorker.terminate();inspectWorker=null;rejectInspect?.(new DOMException('Cancelled','AbortError'));}
  verifyTask?.destroy();
  if(exportWorker){exportWorker.terminate();exportWorker=null;rejectExport?.(new DOMException('Cancelled','AbortError'));}
  status('Cancellation requested.');
});
$('clearSession').addEventListener('click',async()=>{
  if(busy){$('cancel').click();return;}
  if(S.items.length&&!confirm('Clear this session and its undo history?'))return;
  ++pvTok;el.pv.close();
  for(const src of S.sources)await src.pdfjs.destroy();
  S.sources=[];S.items=[];S.undo=[];S.redo=[];S.anchor=null;
  for(const c of cache.values()){c.width=0;c.height=0;}cache.clear();
  if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}
  $('verifiedDownload')?.remove();el.outName.value='';render();status('Session cleared.');
});
const srcById = (id) => S.sources.find((s) => s.id === id);
const newItem = (src, page, extra = {}) => ({ uid: S.nextUid++, src, page, rot: 0, removed: false, selected: false, blank: false, ...extra });
const snap = () => S.items.map((i) => ({ ...i }));

function status(msg) { el.status.textContent = msg; }
let toastTimer;
function toast(msg) {
  el.toast.textContent = msg; el.toast.hidden = false; status(msg);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.toast.hidden = true), 7000);
}
function invalidateDownload(){
  $('verifiedDownload')?.remove();if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}
}
function mutate(fn, msg) {
  if(busy)return;
  const previous=snap(),beforeUid=S.nextUid;
  // Invalid operations must not consume history, clear redo, or invalidate
  // the last verified download. Roll back all page edits atomically.
  try {fn();} catch(error) {
    S.items=previous;S.nextUid=beforeUid;
    render();toast(error?.message||'This operation could not be completed.');
    return;
  }
  if(S.items.length>2000) {
    S.items=previous;S.nextUid=beforeUid;
    render();toast('This candidate supports at most 2,000 pages.');
    return;
  }
  invalidateDownload();
  S.undo.push(previous);if(S.undo.length>UNDO_LIMIT)S.undo.shift();
  S.redo=[];render();if(msg)status(msg);
}
function undo() { if (busy || !S.undo.length) return; invalidateDownload(); S.redo.push(snap()); S.items = S.undo.pop(); render(); status('Undone'); }
function redo() { if (busy || !S.redo.length) return; invalidateDownload(); S.undo.push(snap()); S.items = S.redo.pop(); render(); status('Redone'); }
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

/* ---------- Loading files ---------- */
async function inspectFile(bytes){
  try{return await new Promise((resolve,reject)=>{
    rejectInspect=reject;
    inspectWorker=new Worker(new URL('./inspect-worker.js',import.meta.url),{type:'module'});
    inspectWorker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);
    inspectWorker.onerror=()=>reject(Error('Source inspection stopped. The current session is unchanged.'));
    inspectWorker.postMessage({bytes});
  });}finally{inspectWorker?.terminate();inspectWorker=null;rejectInspect=null;}
}
async function addFiles(fileList) {
  if(busy)return;
  const files=[...fileList].filter(f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf');
  if(!files.length)return toast('Please choose PDF files.');
  // Candidate budgets limit admitted source bytes; PDF parser allocations are
  // not streaming and still require stress verification before production.
  const limit=64*1024*1024;
  if(files.reduce((n,f)=>n+f.size,0)+S.sources.reduce((n,f)=>n+f.size,0)>limit)return toast('This candidate supports 64 MB total input per session.');
  cancelled=false;setBusy(true);const staged=[];const added=[];
  try {
    for(const f of files){
      if(cancelled)throw new DOMException('Cancelled','AbortError');
      status('Reading '+f.name+'…');let doc;
      try {
        const bytes=new Uint8Array(await f.arrayBuffer());
        const inspected=await inspectFile(bytes);
        if(cancelled)throw new DOMException('Cancelled','AbortError');
        const task=pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,
          cMapUrl:new URL('../../assets/vendor/cmaps/',import.meta.url).href,cMapPacked:true,
          standardFontDataUrl:new URL('../../assets/vendor/standard_fonts/',import.meta.url).href,
          wasmUrl:new URL('../../assets/vendor/wasm/',import.meta.url).href});
        verifyTask=task;
        try{doc=await task.promise;}catch(e){await task.destroy();throw e;}finally{verifyTask=null;}
        if(cancelled)throw new DOMException('Cancelled','AbortError');
        if(doc.numPages!==inspected.pages)throw Error('PDF parsers disagree about page count.');
        if(S.items.length+added.length+doc.numPages>2000)throw Error('This candidate supports 2,000 pages per session.');
        const src={id:S.nextSrc++,name:f.name,size:f.size,bytes,pdfjs:doc,pages:doc.numPages,sizes:inspected.sizes,warnings:inspected.warnings};
        src.color=COLORS[(src.id-1)%COLORS.length];staged.push(src);doc=null;
        for(let p=0;p<src.pages;p++)added.push(newItem(src.id,p));
      }catch(e){if(doc)await doc.destroy();throw e;}
    }
    if(cancelled)throw new DOMException('Cancelled','AbortError');
    S.sources.push(...staged);setBusy(false);
    mutate(()=>S.items.push(...added),added.length+' pages added');
    if(!el.outName.value)el.outName.value=safeFilename(srcById(added[0].src).name.replace(/\.pdf$/i,'')+'-organized');
  }catch(e){for(const src of staged)await src.pdfjs.destroy();toast(cancelled||e.name==='AbortError'?'Loading cancelled.':e.message);}
  finally{setBusy(false);}
}

/* ---------- Thumbnails ---------- */
const cache = new Map(), pending = new Map(), queue = [];
let running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift(); running++;
    job().finally(() => { running--; pump(); });
  }
}
function cacheGet(k) { if (!cache.has(k)) return null; const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
function cacheSet(k, v) { cache.set(k, v); if (cache.size > CACHE_LIMIT) {const key=cache.keys().next().value,old=cache.get(key);old.width=0;old.height=0;cache.delete(key);} }
function getBase(srcId, page) {
  const key = srcId + ':' + page;
  const hit = cacheGet(key); if (hit) return Promise.resolve(hit);
  if (pending.has(key)) return pending.get(key);
  const p = new Promise((resolve) => {
    queue.push(async () => {
      try {
        const src = srcById(srcId);
        const pg = await src.pdfjs.getPage(page + 1);
        const v0 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: Math.min(4, THUMB_WIDTH / Math.max(v0.width,v0.height)) });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        cacheSet(key, c); resolve(c);
      } catch (e) { resolve(null); } finally { pending.delete(key); }
    });
    pump();
  });
  pending.set(key, p);
  return p;
}
function blankDimensions(it){
  if(el.blankSize.value==='a4')return PageSizes.A4;
  if(el.blankSize.value==='letter')return PageSizes.Letter;
  const index=S.items.findIndex(x=>x.uid===it.uid);
  for(let i=index-1;i>=0;i--){const prev=S.items[i];if(!prev.removed&&!prev.blank)return srcById(prev.src).sizes[prev.page];}
  return PageSizes.A4;
}
function paintThumb(card, it) {
  const cv = card.querySelector('canvas');
  const finish = (w, h) => {
    const a = h / w, w0 = Math.min(1, 1.35 / a), h0 = a * w0;
    const quarter = it.rot % 180 !== 0;
    cv.style.setProperty('--k', quarter ? Math.min(1 / h0, 1.35 / w0).toFixed(4) : '1');
    cv.dataset.ready = '1';
  };
  if (it.blank) {
    const [w,h]=blankDimensions(it),scale=300/Math.max(w,h);cv.width=Math.max(1,Math.round(w*scale));cv.height=Math.max(1,Math.round(h*scale));
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#9aa7a0'; g.font = '16px sans-serif'; g.textAlign = 'center'; g.fillText('Blank page', cv.width/2, cv.height/2);
    return finish(cv.width, cv.height);
  }
  getBase(it.src, it.page).then((c) => {
    if(!card.isConnected || card.dataset.visible!=='1')return;
    if (!c) { card.querySelector('.ph').textContent = 'Preview unavailable'; return; }
    cv.width = c.width; cv.height = c.height;
    cv.getContext('2d').drawImage(c, 0, 0);
    finish(c.width, c.height);
  });
}

/* ---------- Rendering ---------- */
let observer;const cards=new Map();
function cardHTML(it, idx, outPos, multi) {
  const src = it.blank ? null : srcById(it.src);
  const label = it.blank ? 'Blank page' : 'Page ' + (it.page + 1);
  const where = it.blank ? '' : (multi ? src.name : 'original');
  const out = it.removed ? 'Removed' : '#' + outPos;
  return `
  <label class="chk"><input type="checkbox" data-act="sel" aria-label="Select ${label}" ${it.selected ? 'checked' : ''}></label>
  <div class="thumb" data-act="open" title="Drag to reorder. Double-click to preview.">
    <canvas style="--r:${it.rot}deg"></canvas><span class="ph">Loading…</span>
    ${it.removed ? '<span class="badge">Removed</span>' : ''}
  </div>
  <div class="meta"><span class="nm" title="${esc(where)}">${label}${where ? ' · ' + esc(where) : ''}</span><span class="out">${out}</span></div>
  <div class="acts">
    <button data-act="rotL" aria-label="Rotate left" title="Rotate left">⟲</button>
    <button data-act="rotR" aria-label="Rotate right" title="Rotate right">⟳</button>
    <button data-act="dup" aria-label="Duplicate page" title="Duplicate">⧉</button>
    <button data-act="blank" aria-label="Insert blank page after" title="Insert blank page after">＋</button>
    <button data-act="${it.removed ? 'res' : 'del'}" aria-label="${it.removed ? 'Restore page' : 'Remove page'}" title="${it.removed ? 'Restore' : 'Remove'}">${it.removed ? '↩' : '✕'}</button>
    <button data-act="prev" aria-label="Move earlier" title="Move earlier">◀</button>
    <button data-act="next" aria-label="Move later" title="Move later">▶</button>
    <button data-act="open" aria-label="Preview page" title="Preview">⌕</button>
  </div>
  <label class="goto">Move to <input type="number" min="1" inputmode="numeric" data-act="goto" placeholder="${it.removed ? '—' : outPos}" aria-label="Move to position"></label>`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function render() {
  const focused=document.activeElement;
  const has = S.items.length > 0;
  el.ws.hidden = !has; el.bar.hidden = !has;
  el.drop.hidden = has;
  if (!observer) observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      e.target.dataset.visible=e.isIntersecting?'1':'0';
      if (!e.isIntersecting){const cv=e.target.querySelector('canvas');cv.width=0;cv.height=0;delete cv.dataset.ready;return;}
      const it = S.items.find((x) => x.uid === +e.target.dataset.uid);
      if (it) paintThumb(e.target, it);
    });
  }, { rootMargin: '160px' });

  const activeSrc = new Set(S.items.filter((i) => !i.blank).map((i) => i.src));
  const multi = activeSrc.size > 1;
  const desired=new Set(S.items.map(i=>i.uid));
  for(const [uid,card] of cards)if(!desired.has(uid)){observer.unobserve(card);card.remove();cards.delete(uid);}
  let pos=0;
  S.items.forEach((it,idx)=>{
    if(!it.removed)pos++;
    let li=cards.get(it.uid);
    if(!li){li=document.createElement('li');li.dataset.uid=it.uid;li.innerHTML=cardHTML(it,idx,pos,multi);cards.set(it.uid,li);observer.observe(li);}
    li.className='card'+(it.selected?' sel':'')+(it.removed?' removed':'');
    li.querySelector('[data-act="sel"]').checked=it.selected;
    li.querySelector('canvas').style.setProperty('--r',it.rot+'deg');
    const out=li.querySelector('.out');out.textContent=it.removed?'Removed':'#'+pos;
    const remove=li.querySelector('[data-act="del"],[data-act="res"]');
    remove.dataset.act=it.removed?'res':'del';remove.textContent=it.removed?'↩':'✕';remove.setAttribute('aria-label',it.removed?'Restore page':'Remove page');
    li.querySelector('[data-act="goto"]').placeholder=it.removed?'—':String(pos);
    const name=li.querySelector('.nm'),src=it.blank?null:srcById(it.src);
    name.textContent=it.blank?'Blank page':'Page '+(it.page+1)+(multi?' · '+src.name:'');name.title=src?.name||'Blank page';
    li.style.setProperty('--c',src?.color||'#145940');
    if(el.grid.children[idx]!==li)el.grid.insertBefore(li,el.grid.children[idx]||null);
    if(it.blank&&li.dataset.visible==='1')paintThumb(li,it);
    if(li.dataset.visible==='1'&&li.querySelector('canvas').dataset.ready) {
      const cv=li.querySelector('canvas'),a=cv.height/cv.width,w0=Math.min(1,1.35/a),h0=a*w0;
      cv.style.setProperty('--k',it.rot%180?Math.min(1/h0,1.35/w0).toFixed(4):'1');
    }
  });

  // file chips
  el.files.replaceChildren(...[...activeSrc].map((id) => {
    const s = srcById(id), d = document.createElement('span');
    d.className = 'chip'; d.style.setProperty('--c', s.color);
    d.innerHTML = `${esc(s.name)} <small class="hint">${s.pages} p · ${fmtSize(s.size)}</small><button type="button" data-rmsrc="${id}" aria-label="Remove ${esc(s.name)}">✕</button>`;
    return d;
  }));
  // warnings
  const wl = [...activeSrc].map(srcById).filter((s) => s.warnings.length);
  el.warnings.innerHTML = wl.map((s) => `<div class="warn" role="note"><strong>${esc(s.name)}</strong> contains ${s.warnings.join(', ')}. Exports preserve supported structures and stop when a transformation cannot be verified safely.</div>`).join('');

  const kept = S.items.filter((i) => !i.removed).length, sel = S.items.filter((i) => i.selected).length;
  el.stat.textContent = `${S.items.length} pages · ${S.items.length - kept} removed · ${sel} selected · output ${kept} page${kept === 1 ? '' : 's'}`;
  el.create.disabled = kept === 0;
  document.querySelectorAll('[data-needsel]').forEach((b) => (b.disabled = sel === 0));
  el.undo.disabled = !S.undo.length; el.redo.disabled = !S.redo.length;
  if(focused?.isConnected&&focused!==document.activeElement)focused.focus({preventScroll:true});
}

/* ---------- Operations ---------- */
const idxOf = (uid) => S.items.findIndex((i) => i.uid === uid);
const selected = () => S.items.filter((i) => i.selected);
function rotate(list, d) { list.forEach((i) => (i.rot = (i.rot + d + 360) % 360)); }
function moveTo(uid, n) {
  const i = idxOf(uid); if (i < 0) return;
  const [m] = S.items.splice(i, 1);
  const kept = S.items.filter((x) => !x.removed);
  n = Math.max(1, Math.floor(n));
  if (n > kept.length) {
    const last = kept.length ? S.items.indexOf(kept[kept.length - 1]) + 1 : S.items.length;
    S.items.splice(last, 0, m);
  } else S.items.splice(S.items.indexOf(kept[n - 1]), 0, m);
}
function dupAfter(list) {
  list.forEach((it) => { const i = idxOf(it.uid); S.items.splice(i + 1, 0, { ...it, uid: S.nextUid++, selected: false }); });
}
function blankAfter(list) {
  if (!list.length) { S.items.push(newItem(null, 0, { blank: true })); return; }
  list.forEach((it) => { const i = idxOf(it.uid); S.items.splice(i + 1, 0, newItem(null, 0, { blank: true })); });
}
function parseRange(text, max) {
  const set=new Set();
  for(const token of text.split(/[,\s]+/).filter(Boolean)) {
    const match=token.match(/^(\d*)(?:-(\d*))?$/);
    if(!match)throw Error('Use ranges such as 1-3, 7, or 10-.');
    let start=match[1]===''?1:Number(match[1]);
    let end=match[2]===undefined?start:match[2]===''?max:Number(match[2]);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
       start<1||start>max||end<1||end>max) {
      throw Error('Choose pages between 1 and '+max+'.');
    }
    if(start>end)[start,end]=[end,start];
    for(let n=start;n<=end;n++)set.add(n);
  }
  return set;
}
function resetAll() {
  const active = [...new Set(S.items.filter((i) => !i.blank).map((i) => i.src))];
  const items = [];
  active.forEach((id) => { for (let p = 0; p < srcById(id).pages; p++) items.push(newItem(id, p)); });
  S.items = items;
}

function bulk(name) {
  if(busy)return;
  const sel = selected();
  switch (name) {
    case 'selAll': S.items.forEach((i) => (i.selected = true)); return render();
    case 'selNone': S.items.forEach((i) => (i.selected = false)); return render();
    case 'selInv': S.items.forEach((i) => (i.selected = !i.selected)); return render();
    case 'selOdd': S.items.forEach((it, k) => (it.selected = k % 2 === 0)); return render();
    case 'selEven': S.items.forEach((it, k) => (it.selected = k % 2 === 1)); return render();
    case 'rotL': return mutate(() => rotate(sel, -90), 'Rotated left');
    case 'rotR': return mutate(() => rotate(sel, 90), 'Rotated right');
    case 'del': return mutate(() => sel.forEach((i) => (i.removed = true)), sel.length + ' pages removed');
    case 'res': return mutate(() => sel.forEach((i) => (i.removed = false)), 'Restored');
    case 'dup': return mutate(() => dupAfter(sel), 'Duplicated');
    case 'blank': return mutate(() => blankAfter(sel), 'Blank page inserted');
    case 'toStart': return mutate(() => { const ids = new Set(sel.map((i) => i.uid)); S.items = [...S.items.filter((i) => ids.has(i.uid)), ...S.items.filter((i) => !ids.has(i.uid))]; }, 'Moved to start');
    case 'toEnd': return mutate(() => { const ids = new Set(sel.map((i) => i.uid)); S.items = [...S.items.filter((i) => !ids.has(i.uid)), ...S.items.filter((i) => ids.has(i.uid))]; }, 'Moved to end');
    case 'reverse': return mutate(() => S.items.reverse(), 'Order reversed');
    case 'reset': if (confirm('Reset all changes? Duplicates, blank pages and edits will be discarded.')) mutate(resetAll, 'Reset'); return;
    case 'extract': return exportPdf(sel.filter((i) => !i.removed), (el.outName.value || 'document').replace(/\.pdf$/i, '') + '-extract.pdf');
  }
}

/* ---------- Events ---------- */
el.pick.addEventListener('click', () => el.file.click());
$('addMore').addEventListener('click', () => el.file.click());
el.file.addEventListener('change', () => { addFiles(el.file.files); el.file.value = ''; });
el.undo.addEventListener('click', undo); el.redo.addEventListener('click', redo);
el.create.addEventListener('click', () => exportPdf(S.items.filter((i) => !i.removed), el.outName.value));
el.blankSize.addEventListener('change',()=>{invalidateDownload();for(const it of S.items)if(it.blank){const card=cards.get(it.uid);if(card?.dataset.visible==='1')paintThumb(card,it);}});
el.zoom.addEventListener('input', () => el.root.style.setProperty('--card-w', el.zoom.value + 'px'));
el.range.addEventListener('input', () => {
  try {
    const set=parseRange(el.range.value,S.items.length);
    el.range.setCustomValidity('');
    el.range.removeAttribute('aria-invalid');
    S.items.forEach((it,k)=>it.selected=set.has(k+1));
    render();
  } catch(error) {
    // Keep the existing selection unchanged until the range is valid.
    el.range.setCustomValidity(error.message);
    el.range.setAttribute('aria-invalid','true');
    status('Invalid page selection: '+error.message);
  }
});
el.root.querySelector('.toolbar').addEventListener('click', (e) => { const b = e.target.closest('[data-bulk]'); if (b) bulk(b.dataset.bulk); });
el.files.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rmsrc]'); if (!b) return;
  const id = +b.dataset.rmsrc;
  mutate(() => (S.items = S.items.filter((i) => i.src !== id)), 'File removed');
});

el.grid.addEventListener('click', (e) => {
  if(busy)return;
  const card = e.target.closest('.card'); if (!card) return;
  const it = S.items[idxOf(+card.dataset.uid)]; if (!it) return;
  const act = e.target.closest('[data-act]'); if (!act) return;
  switch (act.dataset.act) {
    case 'sel': {
      const i = idxOf(it.uid), on = act.checked;
      if (e.shiftKey && S.anchor !== null) {
        const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)];
        for (let k = a; k <= b; k++) S.items[k].selected = on;
      } else it.selected = on;
      S.anchor = i; return render();
    }
    case 'open': if (e.detail >= 2 || act.tagName === 'BUTTON') openPreview(it.uid); return;
    case 'rotL': return mutate(() => rotate([it], -90));
    case 'rotR': return mutate(() => rotate([it], 90));
    case 'dup': return mutate(() => dupAfter([it]), 'Page duplicated');
    case 'blank': return mutate(() => blankAfter([it]), 'Blank page inserted');
    case 'del': return mutate(() => (it.removed = true), 'Page removed');
    case 'res': return mutate(() => (it.removed = false), 'Page restored');
    case 'prev': case 'next': {
      const i = idxOf(it.uid), j = i + (act.dataset.act === 'prev' ? -1 : 1);
      if (j < 0 || j >= S.items.length) return;
      return mutate(() => { const [m] = S.items.splice(i, 1); S.items.splice(j, 0, m); }, 'Page moved');
    }
  }
});
el.grid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.dataset.act !== 'goto' || !e.target.value) return;
  const uid = +e.target.closest('.card').dataset.uid, n = +e.target.value;
  mutate(() => moveTo(uid, n), 'Page moved to position ' + n);
});
el.grid.addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'goto' || !e.target.value) return;
  const uid = +e.target.closest('.card').dataset.uid, n = +e.target.value;
  mutate(() => moveTo(uid, n), 'Page moved to position ' + n);
});

new Sortable(el.grid, {
  animation: 150, handle: '.thumb', ghostClass: 'sortable-ghost',
  delay: 160, delayOnTouchOnly: true, touchStartThreshold: 6,
  onMove:()=>!busy,
  onEnd: (evt) => {
    if (evt.oldIndex === evt.newIndex) return;
    mutate(() => { const [m] = S.items.splice(evt.oldIndex, 1); S.items.splice(evt.newIndex, 0, m); }, 'Page moved');
  }
});

// Drag & drop files anywhere
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  document.body.classList.remove('dragging'); dragDepth = 0;
  if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (busy || el.pv.open || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || '')) && e.target.type !== 'checkbox') return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (mod && k === 'a' && S.items.length) { e.preventDefault(); bulk('selAll'); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selected().length) { e.preventDefault(); bulk('del'); }
  else if (e.key === 'Escape') bulk('selNone');
});
window.addEventListener('beforeunload', (e) => { if (S.undo.length) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Preview dialog ---------- */
let pvTok = 0, pvRender=null;
function openPreview(uid) { S.pv = uid; if (!el.pv.open) el.pv.showModal(); drawPreview().catch(e=>{if(e.name!=='RenderingCancelledException')toast('Preview unavailable: '+e.message);}); }
async function drawPreview() {
  const i = idxOf(S.pv); if (i < 0) return;
  const it = S.items[i], tok = ++pvTok, cv = el.pvCanvas;
  pvRender?.cancel();pvRender=null;
  el.pvTitle.textContent = (it.blank ? 'Blank page' : 'Page ' + (it.page + 1) + ' of ' + srcById(it.src).name) + ' — position ' + (i + 1) + '/' + S.items.length;
  const ctx = cv.getContext('2d');
  if(it.blank){let [w,h]=blankDimensions(it);if(it.rot%180)[w,h]=[h,w];const fit=Math.min(innerWidth*.8/w,innerHeight*.65/h);cv.width=Math.ceil(w*fit);cv.height=Math.ceil(h*fit);cv.style.width=cv.width+'px';cv.style.height=cv.height+'px';ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);return;}
  const pg = await srcById(it.src).pdfjs.getPage(it.page + 1);
  if(tok!==pvTok)return;
  const rot = (pg.rotate + it.rot) % 360;
  const v0 = pg.getViewport({ scale: 1, rotation: rot });
  const dpr = Math.min(2,window.devicePixelRatio || 1);
  const fit = Math.min(Math.min(innerWidth * 0.88, 900) / v0.width, (innerHeight * 0.72) / v0.height);
  const vp = pg.getViewport({ scale: fit * dpr, rotation: rot });
  const tmp = document.createElement('canvas'); tmp.width = Math.ceil(vp.width); tmp.height = Math.ceil(vp.height);
  const task=pg.render({canvasContext:tmp.getContext('2d'),viewport:vp});pvRender=task;
  try {
    await task.promise;if(tok!==pvTok)return;
    cv.width=tmp.width;cv.height=tmp.height;
    cv.style.width=tmp.width/dpr+'px';cv.style.height=tmp.height/dpr+'px';
    cv.getContext('2d').drawImage(tmp,0,0);
  }finally{if(pvRender===task)pvRender=null;tmp.width=0;tmp.height=0;}

}
el.pv.addEventListener('close',()=>{++pvTok;pvRender?.cancel();pvRender=null;el.pvCanvas.width=0;el.pvCanvas.height=0;});
$('pvClose').addEventListener('click', () => el.pv.close());
$('pvPrev').addEventListener('click', () => { const i = idxOf(S.pv); if (i > 0) openPreview(S.items[i - 1].uid); });
$('pvNext').addEventListener('click', () => { const i = idxOf(S.pv); if (i < S.items.length - 1) openPreview(S.items[i + 1].uid); });
el.pv.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') $('pvPrev').click(); if (e.key === 'ArrowRight') $('pvNext').click(); });
el.pv.addEventListener('click', (e) => { if (e.target === el.pv) el.pv.close(); });

/* ---------- Export ---------- */
async function exportPdf(list,name) {
  if(busy)return;
  $('verifiedDownload')?.remove();if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}
  if(!list.length)return toast('Nothing to export.');
  const plan=list.map(i=>({...i})),filename=safeFilename(name);
  cancelled=false;setBusy(true);$('progress').value=0;
  try {
    status('Verifying source documents…');
    const ids=new Set(plan.filter(i=>!i.blank).map(i=>i.src));
    const sources=S.sources.filter(s=>ids.has(s.id)).map(s=>({id:s.id,bytes:s.bytes}));
    const bytes=await new Promise((resolve,reject)=>{
      rejectExport=reject;
      exportWorker=new Worker(new URL('./export-worker.js',import.meta.url),{type:'module'});
      exportWorker.onmessage=({data})=>{
        if(data.error)reject(Error(data.error));
        else if(data.bytes)resolve(data.bytes);
        else if(data.message){status(data.message);$('progress').value=data.progress;}
      };
      exportWorker.onerror=()=>reject(Error('Export worker stopped. Try a smaller document or clear the session.'));
      exportWorker.postMessage({sources,items:plan,blankSize:el.blankSize.value});
    });
    if(cancelled)throw new DOMException('Cancelled','AbortError');
    await verifyExport({pdfjs:pdfjsLib,bytes,items:plan,sources:S.sources,cancelled:()=>cancelled,onTask:t=>{verifyTask=t;},onProgress:(v,m)=>{status(m);$('progress').value=v;}});
    if(cancelled)throw new DOMException('Cancelled','AbortError');
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    downloadURL=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=downloadURL;a.download=filename;
    a.textContent='Download verified PDF';a.className='btn';a.id='verifiedDownload';
    $('verifiedDownload')?.remove();el.status.after(a);a.click();
    status('Verified '+plan.length+' pages. Use Download verified PDF if your browser did not start the download.');
  }catch(err){toast(cancelled||err.name==='AbortError'?'Export cancelled. No output was created.':'Export stopped: '+err.message);}
  finally{exportWorker?.terminate();exportWorker=null;rejectExport=null;setBusy(false);}
}

render();
})();
