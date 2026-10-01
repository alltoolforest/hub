import {$,el,field,read,num,format,notice,setupStatus,status,fileInput,checkFile,decodeImage,canvasBlob,output,downloads,clearOutputs,safeName,mobile,errorMessage} from './core.js';

const MAX_FILES=40;
const SOURCE_PIXEL_CAP_DESKTOP=60e6;
const SOURCE_PIXEL_CAP_MOBILE=32e6;
const ZIP_OUTPUT_CAP_DESKTOP=96*1024*1024;
const ZIP_OUTPUT_CAP_MOBILE=32*1024*1024;

function pixelLimit(w,h){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1)throw Error('Dimensions must be positive whole pixels.');
  const limit=mobile()?8e6:24e6;
  if(w*h>limit||w>16384||h>16384)throw Error(`Reduce the output dimensions to at most ${limit/1e6} million pixels and 16,384 pixels per side.`);
}

function sourcePixelLimit(width,height){
  const cap=mobile()?SOURCE_PIXEL_CAP_MOBILE:SOURCE_PIXEL_CAP_DESKTOP;
  if(width*height>cap)throw Error(`Decoded image is too large for safe batch processing on this device. Use an image below ${Math.round(cap/1e6)} million pixels.`);
}

function watermark(ctx,text,w,h){
  if(!text)return;
  const size=Math.max(12,Math.min(w,h)*.035);
  ctx.font=`600 ${size}px sans-serif`;
  ctx.textAlign='right';
  ctx.textBaseline='bottom';
  ctx.fillStyle='rgba(0,0,0,.5)';
  const tw=ctx.measureText(text).width;
  ctx.fillRect(w-tw-24,h-size-26,tw+16,size+18);
  ctx.fillStyle='white';
  ctx.fillText(text,w-16,h-16);
}

async function encodeTarget(canvas,type,quality,targetKB){
  let blob=await canvasBlob(canvas,type,quality);
  if(targetKB<=0||blob.size<=targetKB*1024)return {blob,met:true};
  if(type==='image/png')return {blob,met:false};
  let low=.02,high=quality,best=null;
  for(let i=0;i<9;i++){
    const q=(low+high)/2;
    const candidate=await canvasBlob(canvas,type,q);
    if(candidate.size<=targetKB*1024){best=candidate;low=q}else high=q;
  }
  if(best)return {blob:best,met:true};
  blob=await canvasBlob(canvas,type,.02);
  return {blob,met:blob.size<=targetKB*1024};
}

async function inspectSource(file){
  const bytes=new Uint8Array(await file.slice(0,262144).arrayBuffer());
  let type=null,width=null,height=null;
  if(bytes.length>=24&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47){
    type='image/png';
    width=(bytes[16]<<24)|(bytes[17]<<16)|(bytes[18]<<8)|bytes[19];
    height=(bytes[20]<<24)|(bytes[21]<<16)|(bytes[22]<<8)|bytes[23];
    width>>>=0;height>>>=0;
  }else if(bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50){
    type='image/webp';
    const tag=String.fromCharCode(...bytes.slice(12,16));
    if(tag==='VP8X'&&bytes.length>=30){
      width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);
      height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);
    }else if(tag==='VP8 '&&bytes.length>=30&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a){
      width=(bytes[26]|(bytes[27]<<8))&0x3fff;
      height=(bytes[28]|(bytes[29]<<8))&0x3fff;
    }else if(tag==='VP8L'&&bytes.length>=25&&bytes[20]===0x2f){
      const b1=bytes[21],b2=bytes[22],b3=bytes[23],b4=bytes[24];
      width=1+(((b2&0x3f)<<8)|b1);
      height=1+(((b4&0x0f)<<10)|(b3<<2)|((b2&0xc0)>>6));
    }
  }else if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8){
    type='image/jpeg';
    let i=2;
    while(i+8<bytes.length){
      if(bytes[i]!==0xff){i++;continue}
      while(i<bytes.length&&bytes[i]===0xff)i++;
      const marker=bytes[i++];
      if(marker===0xd9||marker===0xda)break;
      if(marker>=0xd0&&marker<=0xd7)continue;
      if(i+1>=bytes.length)break;
      const len=(bytes[i]<<8)|bytes[i+1];
      if(len<2||i+len>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&len>=7){
        height=(bytes[i+3]<<8)|bytes[i+4];
        width=(bytes[i+5]<<8)|bytes[i+6];
        break;
      }
      i+=len;
    }
  }
  if(!type)throw Error('File contents do not match a supported JPG, PNG, or WebP image.');
  if(width!==null&&height!==null){
    if(width<1||height<1)throw Error('Image dimensions are invalid or corrupted.');
    sourcePixelLimit(width,height);
  }
  return {type,width,height};
}

function outputExt(type){
  return type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
}

function crcTable(){
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    table[n]=c>>>0;
  }
  return table;
}
const CRC_TABLE=crcTable();
function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concat(parts){
  const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);
  let offset=0;
  for(const p of parts){out.set(p,offset);offset+=p.length}
  return out;
}

async function makeStoreZip(entries){
  const encoder=new TextEncoder(),locals=[],centrals=[];
  let offset=0;
  for(const entry of entries){
    const name=encoder.encode(entry.name),data=new Uint8Array(await entry.blob.arrayBuffer()),crc=crc32(data);
    const local=concat([
      u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data
    ]);
    locals.push(local);
    centrals.push(concat([
      u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name
    ]));
    offset+=local.length;
  }
  const central=concat(centrals),body=concat(locals);
  const end=concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(central.length),u32(body.length),u16(0)]);
  return new Blob([body,central,end],{type:'application/zip'});
}

function uniqueZipName(name,seen){
  const count=seen.get(name)||0;
  seen.set(name,count+1);
  if(!count)return name;
  const dot=name.lastIndexOf('.');
  return dot>0?`${name.slice(0,dot)}-${count+1}${name.slice(dot)}`:`${name}-${count+1}`;
}

function resultRow(file){
  const row=el('div',{class:'download-row','data-batch-result':''});
  const text=el('span',{text:file.name+' · Waiting'});
  row.append(text);
  return {row,text};
}

export async function mount(root){
  let files=[],cancelRequested=false,processing=false,results=[];
  const input=fileInput(root,'.jpg,.jpeg,.png,.webp',true,'Select images for a batch');
  const summary=el('p',{text:'No images selected.'});
  root.append(summary);

  const form=el('div',{class:'fields'},[
    field('width','Maximum width','number',1600,{min:1,max:16384,step:1}),
    field('height','Maximum height','number',1600,{min:1,max:16384,step:1}),
    field('format','Output format','select','keep',{options:[['keep','Keep source format'],['image/jpeg','JPG'],['image/png','PNG'],['image/webp','WebP']]}),
    field('quality','Quality (1–100)','number',85,{min:1,max:100}),
    field('target','Maximum KB (0 = no limit)','number',0,{min:0,max:50000}),
    field('watermark','Text watermark','text','',{full:true})
  ]);
  root.append(form,el('label',{class:'check-row'},[el('input',{type:'checkbox',id:'upscale'}),'Allow upscaling']));
  notice(root,'Images are processed one at a time in your browser, preserving aspect ratio. A target KB that cannot be reached at the chosen dimensions is reported honestly.');

  const controls=()=>[...root.querySelectorAll('input,select,button')];
  const setProcessing=on=>{
    processing=on;
    for(const control of controls()){
      if(control===cancelButton)control.disabled=!on;
      else control.disabled=on;
    }
  };

  input.addEventListener('change',async()=>{
    const selected=[...input.files];
    input.value='';
    if(!selected.length)return;
    const active=[...root.querySelectorAll('input,select,button')];
    active.forEach(n=>n.disabled=true);
    status('Checking selected images…');
    try{
      if(selected.length>MAX_FILES)throw Error(`Select at most ${MAX_FILES} images per batch.`);
      let total=0;
      for(const file of selected){
        checkFile(file,['jpg','jpeg','png','webp'],mobile()?20:60);
        await inspectSource(file);
        total+=file.size;
      }
      files=selected;results=[];clearOutputs();
      summary.textContent=`${files.length} image${files.length===1?'':'s'} selected · ${format(total/1024/1024,1)} MB total.`;
      status('Batch ready.');
    }catch(e){
      files=[];results=[];summary.textContent='No images selected.';status(errorMessage(e),true);
    }finally{
      active.forEach(n=>n.disabled=false);cancelButton.disabled=true;zipButton.disabled=true;
    }
  });

  const actions=el('div',{class:'actions'});
  const processButton=el('button',{type:'button',class:'primary',text:'Process batch'});
  const cancelButton=el('button',{type:'button',text:'Cancel batch',disabled:true});
  const zipButton=el('button',{type:'button',text:'Download all (.zip)',disabled:true});
  const resetButton=el('button',{type:'button',text:'Reset batch'});
  actions.append(processButton,cancelButton,zipButton,resetButton);
  root.append(actions);
  setupStatus(root);
  downloads(root);

  cancelButton.addEventListener('click',()=>{
    if(!processing)return;
    cancelRequested=true;
    cancelButton.disabled=true;
    status('Cancelling after the current image finishes…');
  });

  resetButton.addEventListener('click',()=>{
    if(processing)return;
    files=[];results=[];cancelRequested=false;
    clearOutputs();
    summary.textContent='No images selected.';
    $('#width').value='1600';$('#height').value='1600';$('#format').value='keep';$('#quality').value='85';$('#target').value='0';$('#watermark').value='';$('#upscale').checked=false;
    zipButton.disabled=true;
    status('Batch reset.');
  });

  zipButton.addEventListener('click',async()=>{
    if(processing||!results.length)return;
    const cap=mobile()?ZIP_OUTPUT_CAP_MOBILE:ZIP_OUTPUT_CAP_DESKTOP;
    const total=results.reduce((n,r)=>n+r.blob.size,0);
    if(total>cap){status(`Download all is unavailable because the combined outputs are ${format(total/1024/1024,1)} MB. Download the files individually to avoid a large memory spike on this device.`,true);return}
    zipButton.disabled=true;
    try{
      status('Preparing ZIP download…');
      const seen=new Map();
      const zip=await makeStoreZip(results.map(r=>({name:uniqueZipName(r.name,seen),blob:r.blob})));
      output(zip,'alltoolforest-batch-images.zip');
      status(`ZIP ready · ${results.length} files · ${format(zip.size/1024/1024,1)} MB.`);
    }catch(e){status(errorMessage(e),true)}finally{zipButton.disabled=false}
  });

  processButton.addEventListener('click',async()=>{
    if(processing)return;
    if(!files.length){status('Choose images first.',true);return}
    clearOutputs();results=[];cancelRequested=false;zipButton.disabled=true;
    let failures=0,missed=0,created=0;
    const w=(()=>{try{return num('width',{min:1,max:16384})}catch(e){status(errorMessage(e),true);return null}})();
    const h=(()=>{try{return num('height',{min:1,max:16384})}catch(e){status(errorMessage(e),true);return null}})();
    const q=(()=>{try{return num('quality',{min:1,max:100})/100}catch(e){status(errorMessage(e),true);return null}})();
    const target=(()=>{try{return num('target',{min:0,max:50000})}catch(e){status(errorMessage(e),true);return null}})();
    if([w,h,q,target].some(v=>v===null))return;
    setProcessing(true);
    try{
      const resultRows=[];
      for(const file of files){const item=resultRow(file);$('#downloads').append(item.row);resultRows.push(item)}
      for(let i=0;i<files.length;i++){
        if(cancelRequested)break;
        const file=files[i],row=resultRows[i];
        let image=null,c=null;
        try{
          status(`Processing ${i+1} of ${files.length}: ${file.name}`);
          row.text.textContent=`${file.name} · Opening…`;
          const inspected=await inspectSource(file);
          image=await decodeImage(file);
          sourcePixelLimit(image.width,image.height);
          const scale=Math.min(w/image.width,h/image.height,$('#upscale').checked?Infinity:1);
          const ow=Math.max(1,Math.round(image.width*scale)),oh=Math.max(1,Math.round(image.height*scale));
          pixelLimit(ow,oh);
          c=el('canvas',{width:ow,height:oh});
          const ctx=c.getContext('2d');
          const requested=read('format')==='keep'?inspected.type:read('format');
          if(requested==='image/jpeg'){ctx.fillStyle='white';ctx.fillRect(0,0,ow,oh)}
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
          ctx.drawImage(image,0,0,ow,oh);
          watermark(ctx,read('watermark'),ow,oh);
          const {blob,met}=await encodeTarget(c,requested,q,target);
          const actualType=blob.type||requested,ext=outputExt(actualType);
          const name=safeName(file.name,met?'-processed':'-target-not-met',ext);
          if(!met)missed++;
          output(blob,name);
          if(processing)for(const control of controls())if(control!==cancelButton)control.disabled=true;
          results.push({name,blob});created++;
          row.text.textContent=`${file.name} · ${ow} × ${oh} · ${format(blob.size/1024)} KB · ${met?'Ready':'Target KB not met'}${actualType!==requested?` · Browser returned ${actualType}`:''}`;
        }catch(e){
          failures++;
          row.text.textContent=`${file.name} · Failed: ${errorMessage(e)}`;
          row.row.classList.add('status','error');
        }finally{
          image?.close?.();
          if(c)c.width=c.height=0;
        }
      }
      if(cancelRequested){
        const processed=created+failures,remaining=files.length-processed;
        for(let j=processed;j<resultRows.length;j++)resultRows[j].text.textContent=`${files[j].name} · Not processed (cancelled)`;
        status(`Batch cancelled. ${created} created, ${failures} failed, ${Math.max(0,remaining)} not processed.`);
      }else{
        status(`Batch complete. ${created} created, ${failures} failed, ${missed} over the requested KB limit.`);
      }
      zipButton.disabled=!results.length;
    }finally{
      setProcessing(false);
      zipButton.disabled=!results.length;
    }
  });
}

const root=$('#workspace');
if(root)mount(root).catch(e=>{root.append(el('p',{class:'status error',text:'This workspace could not start. Reload the page and try again.'}));console.error(e)});
