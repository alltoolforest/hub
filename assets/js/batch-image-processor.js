import {$,el,field,read,num,format,notice,setupStatus,status,fileInput,canvasBlob,output,downloads,clearOutputs,safeName,mobile,errorMessage} from './core.js';

const ZIP_OUTPUT_CAP_DESKTOP=96*1024*1024;
const ZIP_OUTPUT_CAP_MOBILE=32*1024*1024;
const TARGET_SEARCH_STEPS=10;
const HARD_CANVAS_SIDE=16384;
const ABSURD_SOURCE_SIDE=200000;
const ABSURD_SOURCE_PIXELS=5e9;
const SIZE_PRESETS={small:1280,medium:1920,large:2560,xlarge:3840};

function safeProcessingPixelCap(){
  const memory=Number(navigator.deviceMemory)||0;
  if(memory>0&&memory<=2)return 8e6;
  if(memory>0&&memory<=4)return 12e6;
  if(memory>0&&memory<=8)return 20e6;
  if(memory>8)return 32e6;
  const cores=Number(navigator.hardwareConcurrency)||0;
  return cores>=8?24e6:16e6;
}

function validateCanvasSize(w,h){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1)throw Error('Image dimensions are invalid.');
  if(w>HARD_CANVAS_SIDE||h>HARD_CANVAS_SIDE)throw Error('This image needs a smaller working size on this browser.');
}

function validateSourceDimensions(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Image dimensions are invalid or corrupted.');
  if(width>ABSURD_SOURCE_SIDE||height>ABSURD_SOURCE_SIDE||width*height>ABSURD_SOURCE_PIXELS)throw Error('This image reports unusually large dimensions and may be corrupted.');
}

function fitWithinBox(width,height,maxWidth,maxHeight){
  const scale=Math.min(1,maxWidth/width,maxHeight/height);
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

function fitWithinSafePixels(width,height,cap){
  const sideScale=Math.min(1,HARD_CANVAS_SIDE/width,HARD_CANVAS_SIDE/height);
  const pixelScale=width*height>cap?Math.sqrt(cap/(width*height)):1;
  const scale=Math.min(sideScale,pixelScale);
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}

function requestedDimensions(width,height,sizeMode,customWidth,customHeight){
  if(sizeMode==='original')return {width,height};
  if(sizeMode==='custom')return fitWithinBox(width,height,customWidth,customHeight);
  const maxSide=SIZE_PRESETS[sizeMode]||SIZE_PRESETS.medium;
  return fitWithinBox(width,height,maxSide,maxSide);
}

function formatFileSize(bytes){
  return bytes>=1024*1024?format(bytes/1024/1024,1)+' MB':format(bytes/1024,0)+' KB';
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

async function encodeCanvas(canvas,type,quality){
  const blob=await canvasBlob(canvas,type,quality);
  return {blob,actualType:blob.type||type};
}

async function lossyQualitySearch(canvas,type,quality,targetBytes){
  let first=await encodeCanvas(canvas,type,quality);
  if(first.blob.size<=targetBytes)return {...first,met:true,quality};
  let low=.02,high=quality,best=null,bestQuality=.02;
  for(let i=0;i<TARGET_SEARCH_STEPS;i++){
    const q=(low+high)/2;
    const candidate=await encodeCanvas(canvas,type,q);
    if(candidate.blob.size<=targetBytes){
      best=candidate;
      bestQuality=q;
      low=q;
    }else{
      high=q;
    }
  }
  if(best)return {...best,met:true,quality:bestQuality};
  const minimum=await encodeCanvas(canvas,type,.02);
  return {...minimum,met:minimum.blob.size<=targetBytes,quality:.02};
}

function resizedCanvas(source,width,height){
  const canvas=el('canvas',{width,height});
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw Error('Image resize workspace is unavailable.');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.clearRect(0,0,width,height);
  ctx.drawImage(source,0,0,width,height);
  return canvas;
}

async function dimensionSearch(source,type,quality,targetBytes){
  const originalWidth=source.width,originalHeight=source.height;
  const minScale=Math.max(1/originalWidth,1/originalHeight);
  let low=minScale,high=1,best=null;

  for(let i=0;i<TARGET_SEARCH_STEPS;i++){
    const scale=(low+high)/2;
    const width=Math.max(1,Math.round(originalWidth*scale));
    const height=Math.max(1,Math.round(originalHeight*scale));
    const candidateCanvas=resizedCanvas(source,width,height);
    let encoded;
    try{
      if(type==='image/png'){
        encoded=await encodeCanvas(candidateCanvas,type,1);
        encoded={...encoded,met:encoded.blob.size<=targetBytes,quality:1};
      }else{
        const preferred=Math.max(.45,Math.min(quality,.82));
        encoded=await lossyQualitySearch(candidateCanvas,type,preferred,targetBytes);
      }
      if(encoded.met){
        if(best?.canvas)best.canvas.width=best.canvas.height=0;
        best={...encoded,width,height,canvas:candidateCanvas};
        low=scale;
      }else{
        candidateCanvas.width=candidateCanvas.height=0;
        high=scale;
      }
    }catch(error){
      candidateCanvas.width=candidateCanvas.height=0;
      throw error;
    }
  }

  if(best){
    best.canvas.width=best.canvas.height=0;
    return {...best,canvas:null};
  }

  const tiny=resizedCanvas(source,1,1);
  try{
    const encoded=type==='image/png'
      ? {...await encodeCanvas(tiny,type,1),quality:1}
      : {...await encodeCanvas(tiny,type,.45),quality:.45};
    return {...encoded,met:encoded.blob.size<=targetBytes,width:1,height:1};
  }finally{
    tiny.width=tiny.height=0;
  }
}

async function encodeTarget(canvas,type,quality,targetKB){
  const targetBytes=Math.max(0,targetKB)*1024;
  const initial=await encodeCanvas(canvas,type,quality);
  if(targetBytes<=0||initial.blob.size<=targetBytes){
    return {...initial,met:true,width:canvas.width,height:canvas.height,quality};
  }

  if(type!=='image/png'){
    const qualityResult=await lossyQualitySearch(canvas,type,quality,targetBytes);
    if(qualityResult.met){
      return {...qualityResult,width:canvas.width,height:canvas.height};
    }
  }

  return dimensionSearch(canvas,type,quality,targetBytes);
}

async function inspectSource(file){
  const bytes=new Uint8Array(await file.slice(0,1048576).arrayBuffer());
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
  if(width!==null&&height!==null)validateSourceDimensions(width,height);
  return {type,width,height};
}

function validateImageFile(file){
  if(!file)throw Error('Choose an image first.');
  if(file.size<1)throw Error('This image is empty.');
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(!['jpg','jpeg','png','webp'].includes(ext))throw Error('Unsupported format. Choose JPG, PNG, or WebP.');
}

async function decodeForProcessing(file,type,width,height,sourcePixels,safeCap){
  if(typeof createImageBitmap==='function'){
    try{
      return await createImageBitmap(file,{resizeWidth:width,resizeHeight:height,resizeQuality:'high',imageOrientation:'from-image'});
    }catch{}
  }

  if(typeof ImageDecoder==='function'){
    let decoder=null,frame=null;
    try{
      decoder=new ImageDecoder({data:await file.arrayBuffer(),type,desiredWidth:width,desiredHeight:height,preferAnimation:false});
      const decoded=await decoder.decode({frameIndex:0,completeFramesOnly:true});
      frame=decoded.image;
      if(typeof createImageBitmap==='function'){
        const bitmap=await createImageBitmap(frame);
        frame.close?.();
        return bitmap;
      }
      return frame;
    }catch{
      frame?.close?.();
    }finally{
      decoder?.close?.();
    }
  }

  if(sourcePixels>safeCap*1.5)throw Error('This browser could not open this very large image safely. Try the latest Chrome, Edge, or Safari and retry.');

  const url=URL.createObjectURL(file);
  try{
    return await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(Error('Could not decode this image. Try resaving it as JPG, PNG, or WebP.'));
      image.src=url;
    });
  }finally{
    URL.revokeObjectURL(url);
  }
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
  const row=el('div',{class:'download-row','data-compressor-result':''});
  const text=el('span',{text:file.name+' · Waiting'});
  row.append(text);
  return {row,text};
}

export async function mount(root){
  let files=[],cancelRequested=false,processing=false,results=[];
  const input=fileInput(root,'.jpg,.jpeg,.png,.webp',true,'Select one or more JPG, PNG or WebP images');
  const summary=el('p',{text:'No images selected.'});
  root.append(summary);

  const sizeField=field('size','Image size','select','original',{options:[
    ['original','Original size'],
    ['small','Small — sharing'],
    ['medium','Medium — websites and documents'],
    ['large','Large — high detail'],
    ['xlarge','Extra large — maximum detail'],
    ['custom','Custom size']
  ]});
  const customWidthField=field('custom-width','Width','number',1920,{min:1,max:HARD_CANVAS_SIDE,step:1});
  const customHeightField=field('custom-height','Height','number',1080,{min:1,max:HARD_CANVAS_SIDE,step:1});
  customWidthField.hidden=true;customHeightField.hidden=true;

  const formatField=field('format','Output format','select','keep',{options:[
    ['keep','Same as original'],['image/jpeg','JPG'],['image/png','PNG'],['image/webp','WebP']
  ]});
  const qualityField=field('quality','Image quality','select','0.8',{options:[
    ['0.95','Best quality'],['0.88','High'],['0.8','Balanced — Recommended'],['0.68','Smaller file'],['0.5','Maximum compression']
  ]});
  const targetModeField=field('target-mode','Compressed file size','select','auto',{options:[
    ['auto','Automatic — Recommended'],['manual','Set maximum size']
  ]});
  const targetValueField=field('target-value','Maximum file size','number',1,{min:0.01,max:500000,step:0.01});
  const targetUnitField=field('target-unit','Size unit','select','mb',{options:[['kb','KB'],['mb','MB']]});
  targetValueField.hidden=true;targetUnitField.hidden=true;
  const watermarkField=field('watermark','Text watermark (optional)','text','',{full:true});

  const form=el('div',{class:'fields'},[
    sizeField,customWidthField,customHeightField,formatField,qualityField,targetModeField,targetValueField,targetUnitField,watermarkField
  ]);
  root.append(form);

  const syncSizeFields=()=>{
    const custom=read('size')==='custom';
    customWidthField.hidden=!custom;
    customHeightField.hidden=!custom;
  };
  const syncTargetFields=()=>{
    const manual=read('target-mode')==='manual';
    targetValueField.hidden=!manual;
    targetUnitField.hidden=!manual;
  };
  $('#size').addEventListener('change',syncSizeFields);
  $('#target-mode').addEventListener('change',syncTargetFields);

  notice(root,'Choose a size or keep the original. Large phone and camera photos are handled automatically with a memory-safe working size when needed. Automatic file size is recommended, or you can set your own maximum.');

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
      let total=0;
      for(const file of selected){
        validateImageFile(file);
        await inspectSource(file);
        total+=file.size;
      }
      files=selected;results=[];clearOutputs();
      summary.textContent=files.length+' image'+(files.length===1?'':'s')+' selected · '+format(total/1024/1024,1)+' MB total.';
      status('Ready to compress.');
    }catch(e){
      files=[];results=[];summary.textContent='No images selected.';status(errorMessage(e),true);
    }finally{
      active.forEach(n=>n.disabled=false);cancelButton.disabled=true;zipButton.disabled=true;
    }
  });

  const actions=el('div',{class:'actions'});
  const processButton=el('button',{type:'button',class:'primary',text:'Compress images'});
  const cancelButton=el('button',{type:'button',text:'Cancel',disabled:true});
  const zipButton=el('button',{type:'button',text:'Download all (.zip)',disabled:true});
  const resetButton=el('button',{type:'button',text:'Reset'});
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
    $('#size').value='original';$('#custom-width').value='1920';$('#custom-height').value='1080';
    $('#format').value='keep';$('#quality').value='0.8';$('#target-mode').value='auto';
    $('#target-value').value='1';$('#target-unit').value='mb';$('#watermark').value='';
    syncSizeFields();syncTargetFields();
    zipButton.disabled=true;
    status('Compressor reset.');
  });

  zipButton.addEventListener('click',async()=>{
    if(processing||!results.length)return;
    const cap=mobile()?ZIP_OUTPUT_CAP_MOBILE:ZIP_OUTPUT_CAP_DESKTOP;
    const total=results.reduce((n,r)=>n+r.blob.size,0);
    if(total>cap){status('Download all is unavailable because the combined outputs are '+format(total/1024/1024,1)+' MB. Download the files individually to avoid a large memory spike on this device.',true);return}
    zipButton.disabled=true;
    try{
      status('Preparing ZIP download…');
      const seen=new Map();
      const zip=await makeStoreZip(results.map(r=>({name:uniqueZipName(r.name,seen),blob:r.blob})));
      const zipName='alltoolforest-compressed-images.zip';
      const zipURL=output(zip,zipName);
      const trigger=el('a',{href:zipURL,download:zipName});
      trigger.style.display='none';
      document.body.append(trigger);
      trigger.click();
      trigger.remove();
      const fallback=[...$('#downloads').querySelectorAll('a[download]')].find(a=>a.download===zipName);
      fallback?.scrollIntoView?.({block:'nearest'});
      status('ZIP ready · '+results.length+' files · '+format(zip.size/1024/1024,1)+' MB. If your browser blocks the automatic download, use the ZIP download link below.');
    }catch(e){status(errorMessage(e),true)}finally{zipButton.disabled=false}
  });

  processButton.addEventListener('click',async()=>{
    if(processing)return;
    if(!files.length){status('Choose one or more images first.',true);return}
    clearOutputs();results=[];cancelRequested=false;zipButton.disabled=true;

    const sizeMode=read('size');
    let customWidth=0,customHeight=0;
    if(sizeMode==='custom'){
      try{
        customWidth=num('custom-width',{min:1,max:HARD_CANVAS_SIDE});
        customHeight=num('custom-height',{min:1,max:HARD_CANVAS_SIDE});
      }catch(e){status(errorMessage(e),true);return}
    }

    const quality=Number(read('quality'));
    if(!Number.isFinite(quality)||quality<=0||quality>1){status('Choose an image quality.',true);return}

    let targetKB=0;
    if(read('target-mode')==='manual'){
      let targetValue;
      try{targetValue=num('target-value',{min:0.01,max:500000})}catch(e){status(errorMessage(e),true);return}
      targetKB=read('target-unit')==='mb'?targetValue*1024:targetValue;
    }

    setProcessing(true);
    let failures=0,missed=0,created=0;
    try{
      const resultRows=[];
      for(const file of files){const item=resultRow(file);$('#downloads').append(item.row);resultRows.push(item)}
      for(let i=0;i<files.length;i++){
        if(cancelRequested)break;
        const file=files[i],row=resultRows[i];
        let image=null,c=null;
        try{
          status('Compressing '+(i+1)+' of '+files.length+': '+file.name);
          row.text.textContent=file.name+' · Opening…';
          const inspected=await inspectSource(file);
          if(!inspected.width||!inspected.height)throw Error('Could not read this image size safely. Try resaving the image and retry.');

          const requested=requestedDimensions(inspected.width,inspected.height,sizeMode,customWidth,customHeight);
          const safeCap=safeProcessingPixelCap();
          const planned=fitWithinSafePixels(requested.width,requested.height,safeCap);
          const largeImageSafeMode=planned.width<requested.width||planned.height<requested.height;
          if(largeImageSafeMode)row.text.textContent=file.name+' · Preparing large image safely…';

          image=await decodeForProcessing(file,inspected.type,planned.width,planned.height,inspected.width*inspected.height,safeCap);
          const decodedWidth=Number(image.width||image.displayWidth||planned.width);
          const decodedHeight=Number(image.height||image.displayHeight||planned.height);
          const drawSize=fitWithinBox(decodedWidth,decodedHeight,planned.width,planned.height);
          const ow=drawSize.width,oh=drawSize.height;
          validateCanvasSize(ow,oh);

          c=el('canvas',{width:ow,height:oh});
          const ctx=c.getContext('2d',{alpha:true});
          if(!ctx)throw Error('Image compression workspace is unavailable.');
          const requestedType=read('format')==='keep'?inspected.type:read('format');
          if(requestedType==='image/jpeg'){ctx.fillStyle='white';ctx.fillRect(0,0,ow,oh)}
          else ctx.clearRect(0,0,ow,oh);
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
          ctx.drawImage(image,0,0,ow,oh);
          watermark(ctx,read('watermark'),ow,oh);

          const encoded=await encodeTarget(c,requestedType,quality,targetKB);
          const blob=encoded.blob,met=encoded.met;
          const actualType=encoded.actualType||blob.type||requestedType;
          const ext=outputExt(actualType);
          const name=safeName(file.name,met?'-compressed':'-closest-result',ext);
          if(!met)missed++;
          output(blob,name);
          if(processing)for(const control of controls())if(control!==cancelButton)control.disabled=true;
          results.push({name,blob});created++;

          const targetAdjusted=encoded.width!==ow||encoded.height!==oh;
          const notes=[];
          if(largeImageSafeMode)notes.push('large image processed safely');
          if(targetKB>0)notes.push(met?'maximum file size met':'closest possible result');
          if(targetAdjusted)notes.push('size adjusted for your maximum');
          if(actualType!==requestedType)notes.push('saved as '+outputExt(actualType).toUpperCase());
          row.text.textContent=file.name+' · '+encoded.width+' × '+encoded.height+' · '+formatFileSize(blob.size)+' · Ready'+(notes.length?' · '+notes.join(' · '):'');
        }catch(e){
          failures++;
          row.text.textContent=file.name+' · Failed: '+errorMessage(e);
          row.row.classList.add('status','error');
        }finally{
          image?.close?.();
          if(c)c.width=c.height=0;
        }
      }

      if(cancelRequested){
        const processed=created+failures,remaining=files.length-processed;
        for(let j=processed;j<resultRows.length;j++)resultRows[j].text.textContent=files[j].name+' · Not processed (cancelled)';
        status('Compression cancelled. '+created+' created, '+failures+' failed, '+Math.max(0,remaining)+' not processed.');
      }else{
        status('Compression complete. '+created+' created, '+failures+' failed, '+missed+' above your maximum file size.');
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
