import {load} from './core.js';

const root=document.querySelector('#workspace');
if(root) initExtras(root);

function initExtras(root){
  const $=s=>root.querySelector(s);
  const state={file:null,analysisUrl:null,redaction:null};
  const status=(text,error=false)=>{const node=$('#status');if(node){node.textContent=text;node.classList.toggle('error',error)}};
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const escapeText=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,240);
  const fmtBytes=n=>n>=1048576?`${(n/1048576).toFixed(2)} MB`:`${Math.max(0,n/1024).toFixed(1)} KB`;
  const ext=name=>String(name||'').split('.').pop().toLowerCase();
  const canvasBlob=(c,type,quality)=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Image export failed. Reduce the image size and try again.')),type,quality));
  const make=(tag,attrs={},children=[])=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k==='hidden')n.hidden=!!v;else if(k==='checked')n.checked=!!v;else n.setAttribute(k,String(v))}for(const c of [].concat(children))if(c!=null)n.append(c.nodeType?c:document.createTextNode(String(c)));return n};
  const button=(text,fn,primary=false)=>{const b=make('button',{type:'button',text,class:primary?'primary':''});b.addEventListener('click',async()=>{try{b.disabled=true;await fn()}catch(e){console.error(e);status(e?.message||String(e),true)}finally{b.disabled=false}});return b};
  const section=(title)=>{const d=make('details',{class:'studio-extra-section'});d.append(make('summary',{text:title}));return d};
  const grid=()=>make('div',{class:'fields'});
  const row=()=>make('div',{class:'actions'});
  const inputField=(labelText,input)=>{const label=make('label');label.append(make('span',{text:labelText}),input);return label};

  const style=make('style');style.textContent=`
    .studio-extra-section{margin:18px 0}.studio-extra-section>summary{cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center}
    .studio-analysis-canvas{display:block;max-width:100%;height:auto;margin:12px 0;border:1px solid var(--line);border-radius:12px;touch-action:none;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0/16px 16px}
    .studio-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:12px 0}.studio-meta div{padding:10px;border:1px solid var(--line);border-radius:10px}.studio-meta small{display:block;color:var(--muted);margin-bottom:3px}.studio-meta strong{overflow-wrap:anywhere}
    .studio-swatches{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.studio-swatch{width:90px;min-height:72px;border:1px solid var(--line);border-radius:10px;padding:38px 6px 6px;background:var(--swatch);font:inherit;cursor:pointer}.studio-swatch span{background:rgba(255,255,255,.9);border-radius:5px;padding:2px 4px}
    .studio-selection{position:absolute;border:2px solid #fff;box-shadow:0 0 0 1px #145940;background:rgba(20,89,64,.14);pointer-events:none}.studio-analysis-wrap{position:relative;display:inline-block;max-width:100%}.studio-muted{color:var(--muted);font-size:14px}.studio-inline-check{display:flex;gap:8px;align-items:flex-start;margin:10px 0}.studio-inline-check input{margin-top:3px}
  `;document.head.append(style);

  const privacy=section('Privacy & metadata');
  const privacyCheck=make('label',{class:'studio-inline-check'},[make('input',{type:'checkbox',checked:true,disabled:true}),make('span',{text:'Metadata privacy: remove EXIF/GPS from exported image (always on for Image Studio canvas exports).'})]);
  const metaIntro=make('p',{class:'studio-muted',text:'Metadata is read locally. JPEG EXIF is inspected where available; unsupported metadata containers are reported honestly.'});
  const metaBox=make('div',{class:'studio-meta'});
  privacy.append(metaIntro,privacyCheck,button('Inspect metadata',inspectMetadata),metaBox);

  const colors=section('Colors · pixel picker & palette');
  const colorsHelp=make('p',{class:'studio-muted',text:'Analyze a performance-sized local copy, then click or tap the preview to read a pixel color.'});
  const colorWrap=make('div',{class:'studio-analysis-wrap',hidden:true});
  const colorCanvas=make('canvas',{class:'studio-analysis-canvas','aria-label':'Color analysis preview. Click or tap to pick a pixel color.'});colorWrap.append(colorCanvas);
  const colorReadout=make('p',{class:'studio-muted',text:'No color selected.'});
  const swatches=make('div',{class:'studio-swatches'});
  colors.append(colorsHelp,button('Analyze colors',analyzeColors),colorWrap,colorReadout,swatches);

  const redact=section('Blur / pixelate sensitive area');
  const redactHelp=make('p',{class:'studio-muted',text:'Visual image redaction only — not security-grade document redaction. Exported pixels are permanently changed.'});
  const redactControls=grid();
  const mode=make('select',{id:'extra-redact-mode'});for(const [v,t] of [['pixelate','Pixelate'],['blur','Blur']])mode.append(make('option',{value:v,text:t}));
  const intensity=make('input',{id:'extra-redact-intensity',type:'range',min:'2',max:'30',value:'12'});
  redactControls.append(inputField('Effect',mode),inputField('Intensity',intensity));
  const redactWrap=make('div',{class:'studio-analysis-wrap',hidden:true});const redactCanvas=make('canvas',{class:'studio-analysis-canvas','aria-label':'Redaction preview. Drag a rectangle over the sensitive area.'});const selection=make('div',{class:'studio-selection',hidden:true});redactWrap.append(redactCanvas,selection);
  const redactActions=row(),startRedact=button('Choose area',prepareRedaction),clearRedact=button('Clear selection',()=>{state.redaction=null;selection.hidden=true;status('Redaction selection cleared.')}),exportRedact=button('Download redacted image',downloadRedacted,true);redactActions.append(startRedact,clearRedact,exportRedact);
  redact.append(redactHelp,redactControls,redactActions,redactWrap);

  const circle=section('Round / circle profile image');
  const circleGrid=grid();const circleSize=make('select',{id:'extra-circle-size'});for(const n of [256,512,800,1080])circleSize.append(make('option',{value:n,text:`${n} × ${n}`}));circleSize.value='800';
  const circleFormat=make('select',{id:'extra-circle-format'});for(const [v,t] of [['image/png','PNG · transparent outside circle'],['image/webp','WebP · transparent outside circle'],['image/jpeg','JPG · white outside circle']])circleFormat.append(make('option',{value:v,text:t}));
  circleGrid.append(inputField('Profile size',circleSize),inputField('Output',circleFormat));
  circle.append(make('p',{class:'studio-muted',text:'Uses the current crop coordinates as the source area, normalizes to a centered square, then applies a circular mask.'}),circleGrid,button('Download circle image',downloadCircle,true));

  const anchor=[...root.querySelectorAll('h2')].find(h=>h.textContent.trim()==='Watermark')||root.querySelector('.actions');
  if(anchor){anchor.before(privacy,colors,redact,circle)}else root.append(privacy,colors,redact,circle);

  const fileInput=root.querySelector('#file-input');
  if(fileInput){fileInput.addEventListener('change',()=>{const f=fileInput.files?.[0];if(f)setFile(f)},true);const zone=fileInput.closest('.dropzone');zone?.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];if(f)setFile(f)},true)}
  function setFile(f){state.file=f;state.redaction=null;selection.hidden=true;colorWrap.hidden=true;redactWrap.hidden=true;swatches.replaceChildren();metaBox.replaceChildren();colorReadout.textContent='No color selected.'}
  function requireFile(){if(!state.file)throw new Error('Open an image first.');return state.file}

  async function decode(file,maxSide=0){let blob=file;const x=ext(file.name);if(x==='heic'||x==='heif'){const decoder=await load('heic');blob=await decoder({blob:file,toType:'image/png'});if(Array.isArray(blob))blob=blob[0]}
    let image;if(typeof createImageBitmap==='function'){try{image=await createImageBitmap(blob)}catch{}}
    if(!image){const u=URL.createObjectURL(blob);try{image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error(`Could not decode this ${x.toUpperCase()} image in this browser.`));im.src=u})}finally{URL.revokeObjectURL(u)}}
    if(image.width*image.height>80000000){image.close?.();throw new Error('This image is too large to analyze safely on this device.');}
    if(!maxSide||Math.max(image.width,image.height)<=maxSide)return {image,close:()=>image.close?.()};
    const s=maxSide/Math.max(image.width,image.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*s));c.height=Math.max(1,Math.round(image.height*s));c.getContext('2d').drawImage(image,0,0,c.width,c.height);image.close?.();return {image:c,close:()=>{c.width=c.height=0}};
  }

  async function inspectMetadata(){const file=requireFile();metaBox.replaceChildren();const base=[['File size',fmtBytes(file.size)],['MIME',file.type||'Unknown'],['Extension',ext(file.name).toUpperCase()||'Unknown']];let parsed={state:'not-supported',values:{}};
    if(['jpg','jpeg'].includes(ext(file.name))||file.type==='image/jpeg'){try{parsed=parseExif(await file.arrayBuffer())}catch(e){parsed={state:'parse-error',values:{},error:e.message}}}
    const dec=await decode(file);base.push(['Dimensions',`${dec.image.width} × ${dec.image.height}`]);dec.close();
    for(const [k,v] of base)metaBox.append(metaMetric(k,v));
    if(parsed.state==='ok'){const entries=Object.entries(parsed.values);if(entries.length){for(const [k,v] of entries)metaBox.append(metaMetric(k,escapeText(v)))}else metaBox.append(metaMetric('EXIF','Not present'))}
    else if(parsed.state==='parse-error')metaBox.append(metaMetric('EXIF','Could not parse safely'));
    else metaBox.append(metaMetric('EXIF','Inspection currently supports JPEG EXIF; this format was not parsed'));
    status('Metadata inspection complete. Nothing was uploaded.');
  }
  function metaMetric(k,v){return make('div',{},[make('small',{text:k}),make('strong',{text:v||'Not present'})])}

  function parseExif(buffer){const v=new DataView(buffer);if(v.byteLength<4||v.getUint16(0)!==0xffd8)return {state:'parse-error',values:{}};let p=2,exif=null;while(p+4<=v.byteLength){if(v.getUint8(p)!==0xff){p++;continue}const marker=v.getUint8(p+1);if(marker===0xda||marker===0xd9)break;const len=v.getUint16(p+2);if(len<2||p+2+len>v.byteLength)break;if(marker===0xe1&&len>=8&&ascii(v,p+4,6)==='Exif\0\0'){exif=p+10;break}p+=2+len}
    if(exif==null)return {state:'ok',values:{}};if(exif+8>v.byteLength)throw new Error('Truncated TIFF header');const little=v.getUint16(exif)===0x4949;if(!little&&v.getUint16(exif)!==0x4d4d)throw new Error('Bad TIFF byte order');const u16=o=>v.getUint16(o,little),u32=o=>v.getUint32(o,little);if(u16(exif+2)!==42)throw new Error('Bad TIFF marker');const values={};const types={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
    const readVal=(type,count,entry)=>{const bytes=(types[type]||1)*count,off=bytes<=4?entry+8:exif+u32(entry+8);if(off<0||off+bytes>v.byteLength)throw new Error('EXIF value outside file');if(type===2)return escapeText(ascii(v,off,Math.max(0,count-1)));if(type===3)return count===1?u16(off):undefined;if(type===4)return count===1?u32(off):undefined;if(type===5&&count===1){const d=u32(off+4);return d?u32(off)/d:undefined}if(type===9&&count===1)return v.getInt32(off,little);if(type===10&&count===1){const d=v.getInt32(off+4,little);return d?v.getInt32(off,little)/d:undefined}return undefined};
    let exifIfd=null,gpsIfd=null;const walk=(rel,kind='ifd0')=>{const off=exif+rel;if(off<exif||off+2>v.byteLength)throw new Error('Bad IFD offset');const n=u16(off);if(n>1024)throw new Error('Too many EXIF entries');const gps={};for(let i=0;i<n;i++){const e=off+2+i*12;if(e+12>v.byteLength)throw new Error('Truncated EXIF directory');const tag=u16(e),type=u16(e+2),count=u32(e+4),val=readVal(type,count,e);if(kind==='ifd0'){if(tag===0x010f&&val)values['Camera make']=val;if(tag===0x0110&&val)values['Camera model']=val;if(tag===0x0112&&val)values['Orientation']=String(val);if(tag===0x0131&&val)values['Software']=val;if(tag===0x0132&&val)values['Date/time']=val;if(tag===0x8769)exifIfd=u32(e+8);if(tag===0x8825)gpsIfd=u32(e+8)}else if(kind==='exif'){if(tag===0x9003&&val)values['Date taken']=val;if(tag===0x829a&&val!=null)values['Exposure time']=formatExposure(val);if(tag===0x829d&&val!=null)values['F-number']=`f/${Number(val).toFixed(1)}`;if(tag===0x8827&&val!=null)values['ISO']=String(val)}else if(kind==='gps'){gps[tag]={type,count,e,val}}}return gps};
    walk(u32(exif+4));if(exifIfd)walk(exifIfd,'exif');if(gpsIfd){const gps=walk(gpsIfd,'gps');const coord=(tag,refTag)=>{const a=gps[tag],r=gps[refTag];if(!a||!r)return null;const bytes=(types[a.type]||1)*a.count,base=bytes<=4?a.e+8:exif+u32(a.e+8);if(a.type!==5||a.count<3||base+24>v.byteLength)return null;const q=o=>{const d=u32(o+4);return d?u32(o)/d:0};let n=q(base)+q(base+8)/60+q(base+16)/3600;const ref=String(r.val||'').toUpperCase();if(ref==='S'||ref==='W')n=-n;return n};const lat=coord(2,1),lon=coord(4,3);if(lat!=null&&lon!=null)values['GPS coordinates']=`${lat.toFixed(6)}, ${lon.toFixed(6)}`}
    return {state:'ok',values};
  }
  function ascii(v,o,n){let s='';for(let i=0;i<n&&o+i<v.byteLength;i++)s+=String.fromCharCode(v.getUint8(o+i));return s}
  function formatExposure(v){if(v>=1)return `${v.toFixed(2)} s`;return `1/${Math.max(1,Math.round(1/v))} s`}

  async function analyzeColors(){const file=requireFile(),d=await decode(file,320);const c=colorCanvas,im=d.image;c.width=im.width;c.height=im.height;c.getContext('2d',{willReadFrequently:true}).drawImage(im,0,0,c.width,c.height);d.close();colorWrap.hidden=false;const data=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data,bins=new Map();for(let i=0;i<data.length;i+=16){if(data[i+3]<32)continue;const r=data[i]&0xf0,g=data[i+1]&0xf0,b=data[i+2]&0xf0,key=(r<<16)|(g<<8)|b;bins.set(key,(bins.get(key)||0)+1)}const top=[...bins].sort((a,b)=>b[1]-a[1]).slice(0,8);swatches.replaceChildren(...top.map(([key])=>{const r=(key>>16)&255,g=(key>>8)&255,b=key&255,hex=rgbHex(r+8,g+8,b+8),btn=make('button',{type:'button',class:'studio-swatch'});btn.style.setProperty('--swatch',hex);btn.append(make('span',{text:hex}));btn.addEventListener('click',()=>copyText(hex));return btn}));status('Color analysis ready. Click the preview for an exact sampled pixel or a swatch to copy HEX.');}
  colorCanvas.addEventListener('pointerdown',e=>{const r=colorCanvas.getBoundingClientRect(),x=clamp(Math.floor((e.clientX-r.left)/r.width*colorCanvas.width),0,colorCanvas.width-1),y=clamp(Math.floor((e.clientY-r.top)/r.height*colorCanvas.height),0,colorCanvas.height-1),d=colorCanvas.getContext('2d',{willReadFrequently:true}).getImageData(x,y,1,1).data,hex=rgbHex(d[0],d[1],d[2]),hsl=rgbHsl(d[0],d[1],d[2]);colorReadout.textContent=`HEX ${hex} · RGB ${d[0]}, ${d[1]}, ${d[2]} · HSL ${hsl[0]}°, ${hsl[1]}%, ${hsl[2]}%${d[3]<255?` · Alpha ${(d[3]/255).toFixed(2)}`:''}`});
  function rgbHex(r,g,b){return '#'+[r,g,b].map(n=>clamp(Math.round(n),0,255).toString(16).padStart(2,'0')).join('').toUpperCase()}
  function rgbHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);if(h<0)h+=360}return [Math.round(h),Math.round(s*100),Math.round(l*100)]}
  async function copyText(t){try{await navigator.clipboard.writeText(t);status(`${t} copied.`)}catch{status(`Copy unavailable. Value: ${t}`)}}

  let redactionDrag=null;
  async function prepareRedaction(){const file=requireFile(),d=await decode(file,900),im=d.image;redactCanvas.width=im.width;redactCanvas.height=im.height;redactCanvas.getContext('2d').drawImage(im,0,0,im.width,im.height);d.close();redactWrap.hidden=false;selection.hidden=true;state.redaction=null;status('Drag a rectangle over the sensitive area.');}
  const normPoint=e=>{const r=redactCanvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)}};
  redactCanvas.addEventListener('pointerdown',e=>{if(redactWrap.hidden)return;e.preventDefault();redactCanvas.setPointerCapture?.(e.pointerId);redactionDrag={start:normPoint(e),end:normPoint(e),id:e.pointerId};drawSelection()});
  redactCanvas.addEventListener('pointermove',e=>{if(!redactionDrag||e.pointerId!==redactionDrag.id)return;redactionDrag.end=normPoint(e);drawSelection()});
  redactCanvas.addEventListener('pointerup',e=>{if(!redactionDrag||e.pointerId!==redactionDrag.id)return;redactionDrag.end=normPoint(e);const a=redactionDrag.start,b=redactionDrag.end;redactionDrag=null;const r={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};if(r.w<.005||r.h<.005){selection.hidden=true;state.redaction=null;status('Select a larger redaction area.',true);return}state.redaction=r;drawSelection();status('Redaction area selected. Downloaded output will permanently modify these pixels.')});
  redactCanvas.addEventListener('pointercancel',()=>{redactionDrag=null});
  function drawSelection(){const r=redactionDrag?{x:Math.min(redactionDrag.start.x,redactionDrag.end.x),y:Math.min(redactionDrag.start.y,redactionDrag.end.y),w:Math.abs(redactionDrag.start.x-redactionDrag.end.x),h:Math.abs(redactionDrag.start.y-redactionDrag.end.y)}:state.redaction;if(!r){selection.hidden=true;return}const box=redactCanvas.getBoundingClientRect(),wrap=redactWrap.getBoundingClientRect();selection.hidden=false;selection.style.left=`${box.left-wrap.left+r.x*box.width}px`;selection.style.top=`${box.top-wrap.top+r.y*box.height}px`;selection.style.width=`${r.w*box.width}px`;selection.style.height=`${r.h*box.height}px`}
  window.addEventListener('resize',drawSelection,{passive:true});

  async function downloadRedacted(){const file=requireFile();if(!state.redaction)throw new Error('Choose a redaction area first.');const d=await decode(file),im=d.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);d.close();const r=state.redaction,x=Math.floor(r.x*c.width),y=Math.floor(r.y*c.height),w=Math.max(1,Math.ceil(r.w*c.width)),h=Math.max(1,Math.ceil(r.h*c.height)),strength=Number(intensity.value)||12;
    if(mode.value==='pixelate'){const block=Math.max(2,Math.round(strength)),tw=Math.max(1,Math.ceil(w/block)),th=Math.max(1,Math.ceil(h/block)),tmp=document.createElement('canvas');tmp.width=tw;tmp.height=th;tmp.getContext('2d').drawImage(c,x,y,w,h,0,0,tw,th);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(tmp,0,0,tw,th,x,y,w,h);ctx.restore();tmp.width=tmp.height=0}else{const factor=Math.max(3,Math.round(strength)),tw=Math.max(1,Math.ceil(w/factor)),th=Math.max(1,Math.ceil(h/factor)),tmp=document.createElement('canvas');tmp.width=tw;tmp.height=th;const t=tmp.getContext('2d');t.imageSmoothingEnabled=true;t.imageSmoothingQuality='high';t.drawImage(c,x,y,w,h,0,0,tw,th);ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(tmp,0,0,tw,th,x,y,w,h);ctx.restore();tmp.width=tmp.height=0}
    const type=ext(file.name)==='png'?'image/png':(ext(file.name)==='webp'&&supportsType('image/webp')?'image/webp':'image/jpeg'),blob=await canvasBlob(c,type,.92);verifyRedaction(c,r);downloadBlob(blob,`${baseName(file.name)}-redacted.${type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}`);c.width=c.height=0;status('Redacted image ready. Exported pixels in the selected region were modified.');}
  function verifyRedaction(c,r){const ctx=c.getContext('2d',{willReadFrequently:true}),x=clamp(Math.floor((r.x+r.w/2)*c.width),0,c.width-1),y=clamp(Math.floor((r.y+r.h/2)*c.height),0,c.height-1);ctx.getImageData(x,y,1,1)}

  async function downloadCircle(){const file=requireFile(),d=await decode(file),im=d.image;let x=Number($('#crop-x')?.value||0)/100,y=Number($('#crop-y')?.value||0)/100,w=Number($('#crop-w')?.value||100)/100,h=Number($('#crop-h')?.value||100)/100;x=clamp(x,0,1);y=clamp(y,0,1);w=clamp(w,.001,1-x);h=clamp(h,.001,1-y);let sx=x*im.width,sy=y*im.height,sw=w*im.width,sh=h*im.height;const side=Math.min(sw,sh);sx+=(sw-side)/2;sy+=(sh-side)/2;const n=Number(circleSize.value)||800,c=document.createElement('canvas');c.width=c.height=n;const ctx=c.getContext('2d'),type=circleFormat.value;if(type==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,n,n)}ctx.save();ctx.beginPath();ctx.arc(n/2,n/2,n/2,0,Math.PI*2);ctx.clip();ctx.drawImage(im,sx,sy,side,side,0,0,n,n);ctx.restore();d.close();if(type==='image/webp'&&!supportsType(type)){c.width=c.height=0;throw new Error('WebP export is not supported by this browser. Choose PNG or JPG.')}const blob=await canvasBlob(c,type,.92),actual=blob.type||type;if(actual!==type){c.width=c.height=0;throw new Error(`This browser returned ${actual||'an unknown format'} instead of ${type}. Choose PNG or JPG.`)}downloadBlob(blob,`${baseName(file.name)}-circle.${type==='image/jpeg'?'jpg':type==='image/webp'?'webp':'png'}`);c.width=c.height=0;status('Circle profile image ready. Metadata was removed during local re-encoding.');}
  function supportsType(type){if(type==='image/png'||type==='image/jpeg')return true;const c=document.createElement('canvas');c.width=c.height=1;try{return c.toDataURL(type).startsWith(`data:${type}`)}catch{return false}}
  function baseName(name){return String(name||'image').replace(/\.[^.]+$/,'').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'')||'image'}
  function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
  window.addEventListener('pagehide',()=>{if(state.analysisUrl)URL.revokeObjectURL(state.analysisUrl)},{once:true});
}
