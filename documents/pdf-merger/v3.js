
import * as pdfjsLib from "../../assets/vendor/pdf.mjs";
window.pdfjsLib = pdfjsLib;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const S={files:[],pages:[],hist:[]};let nid=1,pageNid=1,drag=-1,busy=false,importing=false,last=null,DL=null,activeJob=null;
const MOB=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1),LIM=MOB?1.2e8:8e8,TH=new Map(),TH_MAX=MOB?36:96,esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const say=(t,e)=>{const s=$('#st');s.textContent=t;s.className=e?'err':'';s.setAttribute('role',e?'alert':'status')};
// Task 7: reject clearly invalid/spoofed inputs before parser or decoder work.
// PDF headers can legally occur after a small leading prefix; support up to 1024 bytes.
function hasPdfHeader(bytes){const n=Math.min(bytes.length,1029);for(let i=0;i+4<n&&i<=1024;i++)if(bytes[i]===37&&bytes[i+1]===80&&bytes[i+2]===68&&bytes[i+3]===70&&bytes[i+4]===45)return true;return false}
const SAFE_IMAGE_MIME=new Set(['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/avif','image/heic','image/heif']);
const SAFE_IMAGE_EXT=/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
function classifyInput(file){const name=file.name||'',type=(file.type||'').toLowerCase();if(type==='image/svg+xml'||/\.svgz?$/i.test(name))throw new Error('SVG files are not supported; choose a raster photo');if(type==='application/pdf'||/\.pdf$/i.test(name))return 'pdf';if(SAFE_IMAGE_MIME.has(type)||SAFE_IMAGE_EXT.test(name))return 'img';throw new Error('isn’t a supported PDF or raster image')}

// Task 7: Check raster signatures before decoding files supplied by untrusted sources.
function hasRasterHeader(b){if(b.length<4)return false;const at=(...v)=>v.every((x,i)=>b[i]===x);const ascii=(i,t)=>[...t].every((x,j)=>b[i+j]===x.charCodeAt(0));return at(0xff,0xd8,0xff)||at(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)||ascii(0,'GIF8')||ascii(0,'BM')||(ascii(0,'RIFF')&&ascii(8,'WEBP'))||(ascii(4,'ftyp')&&(['avif','avis','heic','heix','hevc','hevx','mif1','msf1'].some(t=>ascii(8,t))))}

try{(window.claude&&claude.use?claude.use('downloads'):Promise.resolve(null)).then(d=>DL=d,()=>{})}catch(e){}
const PDF_ENGINE_READY=!!(window.PDFLib&&window.PDFLib.PDFDocument&&window.pdfjsLib&&window.pdfjsLib.getDocument&&window.createImageBitmap&&HTMLCanvasElement.prototype.toBlob);
if(!PDF_ENGINE_READY){document.addEventListener('DOMContentLoaded',()=>{
 $('#drop').innerHTML='<strong>PDF engine unavailable</strong><p>Required local libraries are missing or incompatible. Reload the page. If the problem continues, the PDF engine may be unavailable.</p>';
 $('#pick').disabled=true;$('#fi').disabled=true;
})}
else pdfjsLib.GlobalWorkerOptions.workerSrc='../../assets/vendor/pdf.worker.mjs';

function askPw(name,again){return new Promise(res=>{const d=$('#pw');if(!d.showModal){res(prompt((again?'Wrong password. ':'')+name+' is password-protected. Password:'));return}$('#pwName').textContent=name;$('#pwErr').hidden=!again;$('#pwIn').value='';d.onclose=()=>res(d.returnValue==='ok'?$('#pwIn').value:null);d.showModal();$('#pwIn').focus()})}
async function openPdf(f){let pw;for(let t=0;;t++){try{return await pdfjsLib.getDocument({data:f.bytes.slice(),password:pw,isEvalSupported:false}).promise}catch(e){if(e&&e.name==='PasswordException'){pw=await askPw(f.name,t>0);if(pw===null)throw new Error('skipped');f.enc=true}else throw new Error('can’t be read; the file may be damaged')}}}
let hl;const heic=async file=>{if(!window.heic2any)await(hl=hl||new Promise((ok,no)=>{const e=document.createElement('script');e.src='../../assets/vendor/heic.js';e.onload=ok;e.onerror=no;document.head.append(e)}));const r=await heic2any({blob:file,toType:'image/jpeg',quality:.92});return Array.isArray(r)?r[0]:r};
async function addOne(file){
 const kind=classifyInput(file);if(!file.size)throw new Error('is empty');
 const f={id:nid++,name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),type:file.type||''};f.hue=(f.id*67)%360;
 if(kind==='pdf'){if(!hasPdfHeader(f.bytes))throw new Error('does not have a valid PDF header');f.kind='pdf';f.doc=await openPdf(f);f.n=f.doc.numPages;f.size=f.bytes.length;f.bytes=null}
 else if(kind==='img'){if(!hasRasterHeader(f.bytes))throw new Error('does not have a supported raster image signature');f.kind='img';let src=file;try{f.bmp=await createImageBitmap(src)}catch(e){if(/hei[cf]/i.test(f.type+f.name)){try{src=await heic(file);f.bmp=await createImageBitmap(src);f.type='image/jpeg'}catch(e2){throw new Error('HEIC photo couldn’t be converted')}}else throw new Error('image format isn’t supported by this browser')}f.url=URL.createObjectURL(src);f.size=file.size;f.bytes=null;f.n=1}
 else throw new Error('isn’t a PDF or an image');
 S.files.push(f);for(let i=0;i<f.n;i++)S.pages.push({id:pageNid++,f,p:i,r:0});
}
async function addFiles(list){if(busy||importing){say('Finish the current file import or merge before adding more files.',true);return}list=[...list];if(!list.length)return;importing=true;say('Reading '+list.length+(list.length>1?' files…':' file…'));const before=snapshot(),bad=[];
 try{for(const file of list){try{await addOne(file)}catch(e){if(e.message!=='skipped')bad.push(file.name+' '+e.message);else bad.push(file.name+' was skipped')}}
 if(S.files.length!==before.files.length)record(before);draw();say(bad.length?bad.join('. ')+'.':'',!!bad.length);
 if(S.files.reduce((a,f)=>a+f.size,0)>LIM)say('These files are large for this device. If merging stalls or the page reloads, merge fewer files at a time.',true)}finally{importing=false}}
// Store complete shallow-immutable page records and the active source registry.
// Source objects hold browser PDF/image handles and intentionally retain identity.
function snapshot(){return {files:S.files.slice(),pages:S.pages.map(p=>({...p}))}}
function record(before){S.hist.push(before);if(S.hist.length>40)S.hist.shift()}
function restore(state){S.files=state.files.slice();S.pages=state.pages.map(p=>({...p}))}
function mut(fn){if(busy||importing)return;const before=snapshot();try{fn()}catch(e){restore(before);draw();throw e}record(before);draw()}
function undo(){if(!S.hist.length||busy)return;restore(S.hist.pop());say('Last change undone.');draw()}
const order=()=>[...new Set(S.pages.map(p=>p.f))];
const regroup=o=>{S.pages=o.flatMap(g=>S.pages.filter(p=>p.f===g))};
function parseRange(s,n){s=s.trim();if(!s)return[...Array(n).keys()];const out=[];for(const part of s.split(',')){const m=part.trim().match(/^(\d*)\s*-\s*(\d*)$|^(\d+)$/);if(!m)return null;if(m[3]){const v=+m[3];if(v<1||v>n)return null;out.push(v-1)}else{const a=m[1]?+m[1]:1,b=m[2]?+m[2]:n;if(a<1||b>n||a>b)return null;for(let i=a;i<=b;i++)out.push(i-1)}}return out}

function draw(){
 const focus=document.activeElement,chipFocus=focus?.closest?.('.chip'),pageFocus=focus?.closest?.('.pg');
 const focusKey=chipFocus?{kind:'file',id:chipFocus.dataset.f,action:focus.dataset.c}:pageFocus?{kind:'page',id:S.pages[Number(pageFocus.dataset.i)]?.id,action:focus.dataset.a}:null;
 document.body.classList.toggle('has',S.pages.length>0||S.files.length>0);$('#dock').hidden=!S.pages.length&&!S.files.length;
 staleThumbCache();const o=order();
 $('#chips').innerHTML=o.map((f,i)=>{const k=S.pages.filter(p=>p.f===f).length;return `<div class="chip" style="--h:${f.hue}" data-f="${f.id}"><div class="n" title="${esc(f.name)}">${esc(f.name)}</div><div class="m">${k} of ${f.n} page${f.n>1?'s':''}${f.enc?' (unlocked)':''}</div><div class="r"><input placeholder="Keep pages, e.g. 1-3, 5" aria-label="Pages to keep from ${esc(f.name)}"><button data-c="l" title="Move file earlier" aria-label="Move ${esc(f.name)} earlier" ${i?'':'disabled'}>◀</button><button data-c="r" title="Move file later" aria-label="Move ${esc(f.name)} later" ${i<o.length-1?'':'disabled'}>▶</button><button data-c="v" title="Reverse this file’s pages (for back-side scans)" aria-label="Reverse pages of ${esc(f.name)}">⇅</button><button data-c="d" title="Add a copy at the end" aria-label="Duplicate pages of ${esc(f.name)}">⧉</button><button data-c="x" title="Remove file" aria-label="Remove ${esc(f.name)}">✕</button></div></div>`}).join('');
 $('#grid').innerHTML=S.pages.map((pg,i)=>{const f=pg.f,q=(pg.r/90)%4;return `<figure class="pg" draggable="true" data-i="${i}" style="--h:${f.hue}"><div class="th q${q}"><img data-k="${f.id}:${pg.p}" alt="Page ${pg.p+1} of ${esc(f.name)}" style="transform:rotate(${pg.r}deg)"></div><figcaption>${i+1}. ${esc(f.name)}${f.n>1?' p'+(pg.p+1):''}</figcaption><div class="acts"><button data-a="l" title="Move earlier" aria-label="Move page ${i+1} earlier" ${i?'':'disabled'}>◀</button><button data-a="rot" title="Rotate 90°" aria-label="Rotate page ${i+1} 90 degrees">↻</button><button class="x" data-a="del" title="Delete page" aria-label="Delete page ${i+1}">✕</button><button data-a="r" title="Move later" aria-label="Move page ${i+1} later" ${i<S.pages.length-1?'':'disabled'}>▶</button></div></figure>`}).join('');
 $$('#grid img').forEach(im=>{const u=thumbCacheGet(im.dataset.k);if(u)im.src=u;else io.observe(im)});
 $('#go').textContent=S.pages.length?'Merge '+S.pages.length+' page'+(S.pages.length>1?'s':''):'Merge';$('#go').disabled=!S.pages.length||busy;
 $('#cancel').hidden=!busy;$('#cancel').disabled=!busy;$('#undo').disabled=!S.hist.length||busy;$('#undo-empty').hidden=!S.hist.length||S.pages.length>0;$('#undo-empty').disabled=busy;$('#int').disabled=o.length<2;
 if(focusKey){const found=focusKey.kind==='file'?$(`#chips .chip[data-f="${focusKey.id}"] button[data-c="${focusKey.action}"]`):S.pages.some(p=>p.id===focusKey.id)?$(`#grid .pg[data-i="${S.pages.findIndex(p=>p.id===focusKey.id)}"] button[data-a="${focusKey.action}"]`):null;(found&&!found.disabled?found:$('#undo')).focus({preventScroll:true})}
}
// Task 5: bounded thumbnail cache. URLs for imported images are source-owned; only
// generated thumbnails are cached, and data URLs are evicted via LRU.
function thumbCacheGet(k){if(!TH.has(k))return null;const v=TH.get(k);TH.delete(k);TH.set(k,v);return v}
function thumbCachePut(k,v){if(TH.has(k))TH.delete(k);TH.set(k,v);while(TH.size>TH_MAX)TH.delete(TH.keys().next().value)}
function staleThumbCache(){const valid=new Set(S.files.map(f=>f.id));for(const k of TH.keys())if(!valid.has(Number(k.split(':')[0])))TH.delete(k)}
function checkCancelled(job){if(job&&job.cancelled)throw Object.assign(new Error('Merge cancelled. Your source files and page edits are unchanged.'),{cancelled:true})}
function cancelMerge(){if(activeJob) {activeJob.cancelled=true;say('Cancelling at the next safe processing checkpoint…')}}
$('#cancel').onclick=cancelMerge;
let q=Promise.resolve();
async function thumb(f,p){const k=f.id+':'+p;if(TH.has(k))return thumbCacheGet(k);let u;
 if(f.kind==='img')u=f.url;else{const pg=await f.doc.getPage(p+1),w=pg.getViewport({scale:1}).width,vp=pg.getViewport({scale:Math.min(3,200/w)}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;const x=c.getContext('2d');try{x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:x,viewport:vp}).promise;u=c.toDataURL('image/jpeg',.72)}finally{c.width=0;c.height=0}}
 thumbCachePut(k,u);return u}
const io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;io.unobserve(e.target);const k=e.target.dataset.k,[id,p]=k.split(':').map(Number),f=S.files.find(x=>x.id===id);if(!f)return;
 q=q.then(()=>thumb(f,p)).then(u=>$$('img[data-k="'+k+'"]').forEach(i=>i.src=u)).catch(()=>{})}),{rootMargin:'400px'});

$('#chips').addEventListener('click',e=>{const b=e.target.closest('button[data-c]');if(!b)return;const f=S.files.find(x=>x.id==b.closest('.chip').dataset.f),c=b.dataset.c,o=order(),i=o.indexOf(f);
 if(c==='x')mut(()=>{S.pages=S.pages.filter(p=>p.f!==f);S.files=S.files.filter(x=>x!==f)});
 else if(c==='v')mut(()=>{const ix=[];S.pages.forEach((p,i)=>{if(p.f===f)ix.push(i)});const ps=ix.map(i=>S.pages[i]).reverse();ix.forEach((i,k)=>S.pages[i]=ps[k])});
 else if(c==='d')mut(()=>{S.pages.push(...S.pages.filter(p=>p.f===f).map(p=>({...p,id:pageNid++})))});
 else{const j=i+(c==='l'?-1:1);if(j<0||j>=o.length)return;mut(()=>{[o[i],o[j]]=[o[j],o[i]];regroup(o)})}});
$('#chips').addEventListener('change',e=>{const inp=e.target;if(inp.tagName!=='INPUT')return;const f=S.files.find(x=>x.id==inp.closest('.chip').dataset.f),idx=parseRange(inp.value,f.n);
 if(!idx||!idx.length){inp.classList.add('bad');say('Use page numbers and ranges between 1 and '+f.n+', like 1-3, 5.',true);return}
 say('');mut(()=>{const at=S.pages.findIndex(p=>p.f===f);S.pages=S.pages.filter(p=>p.f!==f);S.pages.splice(at,0,...idx.map(p=>({id:pageNid++,f,p,r:0})))})});
$('#grid').addEventListener('click',e=>{const b=e.target.closest('button[data-a]');if(!b)return;const i=+b.closest('.pg').dataset.i,a=b.dataset.a;
 mut(()=>{if(a==='rot')S.pages[i]={...S.pages[i],r:(S.pages[i].r+90)%360};else if(a==='del'){S.pages.splice(i,1);const o=order();S.files=S.files.filter(f=>o.includes(f))}else{const j=i+(a==='l'?-1:1),t=S.pages[i];S.pages[i]=S.pages[j];S.pages[j]=t}})});
const g=$('#grid');
g.addEventListener('dragstart',e=>{const c=e.target.closest('.pg');if(!c)return;drag=+c.dataset.i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','p')});
g.addEventListener('dragover',e=>{if(drag<0)return;e.preventDefault();$$('.over').forEach(x=>x.classList.remove('over'));const c=e.target.closest('.pg');if(c)c.classList.add('over')});
g.addEventListener('drop',e=>{if(drag<0)return;e.preventDefault();const c=e.target.closest('.pg'),from=drag;drag=-1;if(c)mut(()=>{const[m]=S.pages.splice(from,1);S.pages.splice(+c.dataset.i,0,m)})});
g.addEventListener('dragend',()=>{drag=-1;$$('.over').forEach(x=>x.classList.remove('over'))});

$$('[data-t]').forEach(b=>b.onclick=()=>{const o=order(),t=b.dataset.t;
 if(t==='az')mut(()=>regroup(o.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))));
 else if(t==='rev')mut(()=>regroup(o.reverse()));
 else if(o.length>1)mut(()=>{const L=o.map(f=>S.pages.filter(p=>p.f===f)),m=Math.max(...L.map(l=>l.length)),out=[];for(let i=0;i<m;i++)L.forEach(l=>{if(l[i])out.push(l[i])});S.pages=out})});
$('#undo').onclick=undo;$('#undo-empty').onclick=undo;
$('#clear').onclick=()=>{mut(()=>{S.pages=[];S.files=[]});say('Workspace cleared. Use Undo to restore.');};
const fi=$('#fi');$('#pick').onclick=$('#add').onclick=()=>fi.click();fi.onchange=()=>{addFiles(fi.files);fi.value=''};
let dc=0;const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
addEventListener('dragenter',e=>{if(hasFiles(e)){dc++;$('#drop').classList.add('on')}});
addEventListener('dragleave',e=>{if(hasFiles(e)&&--dc<=0){dc=0;$('#drop').classList.remove('on')}});
addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault()});
addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();dc=0;$('#drop').classList.remove('on');addFiles(e.dataTransfer.files)});

const tick=()=>new Promise(r=>setTimeout(r));
const blob=(c,t,qv)=>new Promise(r=>c.toBlob(r,t,qv));
const PS={a4:[595.28,841.89],letter:[612,792]};let OPT={};
// Task 3: preservation-mode operations must fail closed instead of silently rasterizing.
function integrityError(name,stage,error){
 const detail=error&&error.message?': '+error.message:'';
 return new Error('Cannot preserve PDF '+name+' during '+stage+detail+'. Original files were not changed. Try a different PDF or an explicitly selected conversion mode.');
}
function verifyMergedPages(output,expected){
 if(output.getPageCount()!==expected)throw new Error('Merged PDF page count differs from the requested page count.');
}
// Task 4: consent is determined from the CURRENT workspace and selected output modes.
function conversionDisclosure(pages,options){
 const pdfs=pages.filter(x=>x.f.kind==='pdf');
 const encrypted=pdfs.some(x=>x.f.enc);
 const reasons=[];
 if(options.cm>0)reasons.push('Reduced-size mode converts every PDF page into JPEG images. Searchable text, vector content, links, and interactive form features may be lost.');
 if(options.ps!=='keep')reasons.push('Page-size normalization can remove links, annotations and interactive form features.');
 if(encrypted)reasons.push('Password-protected PDF pages require image conversion and will not retain searchable text.');
 if(options.recover)reasons.push('Compatibility recovery may convert PDFs that cannot be copied into images, losing searchable text and interactive PDF features.');
 if(options.ff)reasons.push('Flattening form fields removes their editability.');
 if(pdfs.some(x=>x.f.enc) && !options.cm && !options.recover) return {blocked:'Password-protected PDFs cannot be preserved in full-quality mode. Enable image fallback or choose a reduced-size output mode, then approve its warning.'};
 return {reasons};
}
function getConversionApproval(pages,options,confirmFn){
 const disclosure=conversionDisclosure(pages,options);
 if(disclosure.blocked)return disclosure;
 if(disclosure.reasons.length && !confirmFn('PDF output changes\n\n'+disclosure.reasons.join('\n\n')+'\n\nContinue with these changes?'))return {blocked:'Merge cancelled. Original PDFs and page edits are unchanged.'};
 return {approved:true};
}
const fit=(dw,dh,W,H)=>{const k=Math.min(W/dw,H/dh);return[dw*k,dh*k]};
const box=(dw,dh)=>{const b=OPT.ps==='first'?OPT.first:PS[OPT.ps];return b?((dw>dh)===(b[0]>b[1])?b:[b[1],b[0]]):null};
async function imgPage(out,f,job){checkCancelled(job);const cm=OPT.cm,jpg=cm>0||/jpe?g/i.test(f.type+f.name),k=Math.min(1,(cm?[0,1600,1100][cm]:MOB?4096:8192)/Math.max(f.bmp.width,f.bmp.height)),c=document.createElement('canvas');c.width=Math.round(f.bmp.width*k);c.height=Math.round(f.bmp.height*k);const x=c.getContext('2d');if(jpg){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)}x.drawImage(f.bmp,0,0,c.width,c.height);
 let encoded;try{encoded=await blob(c,jpg?'image/jpeg':'image/png',cm?OPT.q:.92)}finally{c.width=0;c.height=0}checkCancelled(job);if(!encoded)throw new Error('Could not encode the selected image.');const buf=await encoded.arrayBuffer(),im=jpg?await out.embedJpg(buf):await out.embedPng(buf);
 const A=PS.a4,[W,H]=box(im.width,im.height)||(im.width>im.height?[A[1],A[0]]:A),m=24,[w,h]=fit(im.width,im.height,W-2*m,H-2*m),p=out.addPage([W,H]);p.drawImage(im,{x:(W-w)/2,y:(H-h)/2,width:w,height:h});return p}
async function rasterPage(out,f,n,job){checkCancelled(job);const pg=await f.doc.getPage(n+1),a=pg.getViewport({scale:1}),v=pg.getViewport({scale:Math.min(OPT.rs,Math.sqrt((MOB?6e6:2e7)/(a.width*a.height)))}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);try{await pg.render({canvasContext:x,viewport:v}).promise;checkCancelled(job);var encoded=await blob(c,'image/jpeg',OPT.q)}finally{c.width=0;c.height=0}checkCancelled(job);if(!encoded)throw new Error('Could not convert page to an image.');const im=await out.embedJpg(await encoded.arrayBuffer()),[W,H]=box(a.width,a.height)||[a.width,a.height],[w,h]=fit(a.width,a.height,W,H),p=out.addPage([W,H]);p.drawImage(im,{x:(W-w)/2,y:(H-h)/2,width:w,height:h});return p}
async function save(){if(!last)return;const nm=last.name;
 if(DL){try{await DL.save({filename:nm,data:last.blob});say('Saved '+nm+'.');return}catch(e){if(e&&e.code==='declined'){say('Download cancelled. Use “Download again” to save '+nm+'.');return}if(e&&e.code!=='unavailable'&&e.code!=='not_granted'){say('Couldn’t save the file: '+(e.message||e.code),true);return}}}
 const a=document.createElement('a');a.href=URL.createObjectURL(last.blob);a.download=nm;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),6e4);say('Downloaded '+nm+'.')}
async function merge(){
 if(busy||importing||!S.pages.length)return;
 const approved=getConversionApproval(S.pages,{cm:+$('#cm').value,ps:$('#ps').value,recover:$('#recover').checked,ff:$('#ff').checked},message=>window.confirm(message));
 if(approved.blocked){say(approved.blocked,true);return}
 busy=true;$('#go').disabled=true;const job={cancelled:false};activeJob=job;$('#cancel').hidden=false;const pr=$('#pr');pr.hidden=false;pr.value=0;say('Merging…');
 let wl;try{if(navigator.wakeLock&&navigator.wakeLock.request)wl=await navigator.wakeLock.request('screen')}catch(e){}
 const cm=+$('#cm').value;OPT={ps:$('#ps').value,cm,rs:[2,2.08,1.39][cm],q:[.9,.72,.55][cm],recover:$('#recover').checked};
 try{
  const{PDFDocument,StandardFonts,degrees,rgb,PDFName,PDFHexString}=PDFLib,out=await PDFDocument.create(),sep=$('#sep').checked,num=$('#num').checked,bm=$('#bm').checked,ff=$('#ff').checked,font=num?await out.embedFont(StandardFonts.Helvetica):null,st=new Map(),raster=new Set(),seen=new Set(),marks=[],keep=OPT.ps==='keep';let prev=null,expectedPages=0;
  if(OPT.ps==='first'){const p0=S.pages[0];if(p0.f.kind==='img')OPT.first=PS.a4;else{const a=await p0.f.doc.getPage(p0.p+1),v=a.getViewport({scale:1,rotation:(a.rotate+p0.r)%360});OPT.first=[v.width,v.height]}}
  for(let i=0;i<S.pages.length;i++){checkCancelled(job);const pg=S.pages[i],f=pg.f;let page,rot=false;
   if(sep&&prev&&prev!==f){const l=out.getPage(out.getPageCount()-1).getSize();out.addPage([l.width,l.height]);expectedPages++}
   if(bm&&!seen.has(f)){seen.add(f);marks.push({t:f.name.replace(/\.[^.]+$/,''),i:out.getPageCount()})}prev=f;
   if(f.kind==='img')page=await imgPage(out,f,job);
   else{let s=st.get(f);
    if(!s){s={m:new Map(),used:new Set()};
     try{if(f.enc||cm)throw new Error(f.enc?'encrypted source needs conversion':'raster output was explicitly selected');s.src=await PDFDocument.load(await f.doc.getData(),{updateMetadata:false});if(ff){try{s.src.getForm().flatten()}catch(e){throw Object.assign(integrityError(f.name,'form flattening',e),{isFormFailure:true})}}
      const idx=[...new Set(S.pages.filter(x=>x.f===f).map(x=>x.p))];
      if(keep){const c=await out.copyPages(s.src,idx);idx.forEach((p,k)=>s.m.set(p,c[k]))}
      else{const c=await out.embedPages(idx.map(p=>s.src.getPage(p)));idx.forEach((p,k)=>s.m.set(p,c[k]))}
     }catch(e){if(e&&e.isFormFailure)throw e;if(!cm&&!OPT.recover)throw integrityError(f.name,'PDF copying',e);s.src=null;raster.add(f.name)}st.set(f,s)}
    if(s.src&&keep){let cp;if(!s.used.has(pg.p)){cp=s.m.get(pg.p);s.used.add(pg.p)}else[cp]=await out.copyPages(s.src,[pg.p]);page=out.addPage(cp)}
    else if(s.src){const em=s.m.get(pg.p),R=(s.src.getPage(pg.p).getRotation().angle+pg.r)%360,od=R%180!==0,[W,H]=box(od?em.height:em.width,od?em.width:em.height),[mw,mh]=od?[H,W]:[W,H],[w,h]=fit(em.width,em.height,mw,mh);
      page=out.addPage([mw,mh]);page.drawPage(em,{x:(mw-w)/2,y:(mh-h)/2,width:w,height:h});page.setRotation(degrees(R));rot=true}
    else page=await rasterPage(out,f,pg.p,job)}
   if(pg.r&&!rot)page.setRotation(degrees((page.getRotation().angle+pg.r)%360));
   expectedPages++;pr.value=(i+1)/S.pages.length;if(MOB||i%3===2)await tick();checkCancelled(job)}
  if(num)out.getPages().forEach((p,i)=>{if(p.getRotation().angle)return;const{width}=p.getSize(),t=String(i+1);p.drawText(t,{x:(width-font.widthOfTextAtSize(t,9))/2,y:16,size:9,font,color:rgb(.35,.35,.35)})});
  if(marks.length){const c=out.context,root=c.nextRef(),rs=marks.map(()=>c.nextRef());marks.forEach((m,k)=>{const d=c.obj({Title:PDFHexString.fromText(m.t),Parent:root,Dest:[out.getPage(m.i).ref,'Fit']});if(k)d.set(PDFName.of('Prev'),rs[k-1]);if(k<marks.length-1)d.set(PDFName.of('Next'),rs[k+1]);c.assign(rs[k],d)});
   c.assign(root,c.obj({Type:'Outlines',First:rs[0],Last:rs[rs.length-1],Count:marks.length}));out.catalog.set(PDFName.of('Outlines'),root);out.catalog.set(PDFName.of('PageMode'),PDFName.of('UseOutlines'))}
  const nm=($('#name').value.replace(/[\\/:*?"<>|]+/g,'').trim()||'merged').replace(/\.pdf$/i,'')+'.pdf';
  out.setTitle(nm.replace(/\.pdf$/i,''));out.setProducer('AllToolForest PDF Merger');out.setCreator('AllToolForest PDF Merger');
  checkCancelled(job);verifyMergedPages(out,expectedPages);const bytes=await out.save();checkCancelled(job);if(!bytes||!bytes.length)throw new Error('PDF writer returned an empty file.');const verified=await PDFDocument.load(bytes,{updateMetadata:false});checkCancelled(job);if(verified.getPageCount()!==expectedPages)throw new Error('Saved PDF failed page-count verification.');last={name:nm,blob:new Blob([bytes],{type:'application/pdf'})};
  pr.hidden=true;
  say('Merged '+S.pages.length+' pages ('+(bytes.length/1048576).toFixed(1)+' MB).'+(raster.size?' Pages from '+[...raster].join(', ')+' were added as images, so their text isn’t selectable.':''));
  $('#dl').hidden=false;await save();
 }catch(e){pr.hidden=true;say(e&&e.cancelled?e.message:'Merge failed: '+(e&&e.message||'unknown error')+'. Try removing the file that caused it.',!e?.cancelled)}
 finally{try{wl&&await wl.release()}catch(e){}activeJob=null;busy=false;draw()}}
$('#go').onclick=merge;$('#dl').onclick=save;
