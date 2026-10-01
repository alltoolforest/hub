import {$,el,field,read,action,notice,setupStatus,status,fileInput,bindFile,checkFile,decodeImage,canvasBlob,output,downloads,clearOutputs,safeName,load,mobile} from './core.js';

function fittedDraw(ctx,image,w,h,fit='cover',position='center'){
  if(fit==='stretch'){ctx.drawImage(image,0,0,w,h);return}
  const scale=fit==='contain'?Math.min(w/image.width,h/image.height):Math.max(w/image.width,h/image.height);
  const dw=image.width*scale,dh=image.height*scale;
  let x=(w-dw)/2,y=(h-dh)/2;
  if(position==='left')x=0;
  if(position==='right')x=w-dw;
  if(position==='top')y=0;
  if(position==='bottom')y=h-dh;
  ctx.drawImage(image,x,y,dw,dh);
}

function safeOutputSize(width,height){
  const memory=Number(navigator.deviceMemory||0);
  const pixelCap=mobile()?(memory&&memory<=4?12e6:16e6):(memory&&memory<=4?24e6:40e6);
  const sideCap=16384;
  const scale=Math.min(1,Math.sqrt(pixelCap/(width*height)),sideCap/width,sideCap/height);
  return {
    width:Math.max(1,Math.round(width*scale)),
    height:Math.max(1,Math.round(height*scale)),
    reduced:scale<.9999,
    pixelCap
  };
}

function inferenceSize(width,height){
  const pixelCap=mobile()?1.5e6:3e6;
  const scale=Math.min(1,Math.sqrt(pixelCap/(width*height)));
  return {
    width:Math.max(1,Math.round(width*scale)),
    height:Math.max(1,Math.round(height*scale))
  };
}

function checkerboardFrame(image){
  const frame=el('div',{class:'canvas-frame',style:'background-color:#fff;background-image:linear-gradient(45deg,#dfe6e1 25%,transparent 25%),linear-gradient(-45deg,#dfe6e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe6e1 75%),linear-gradient(-45deg,transparent 75%,#dfe6e1 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0;'});
  image.style.background='transparent';
  frame.append(image);
  return frame;
}

export async function mount(root){
  let file=null,replacement=null,sourceImage=null;

  const input=fileInput(root,'.jpg,.jpeg,.png,.webp,.heic,.heif',false,'Select a foreground image');
  const sourcePreview=el('canvas',{'aria-label':'Selected source image preview',role:'img'});
  const sourceFrame=el('div',{class:'canvas-frame',hidden:true});
  sourceFrame.append(sourcePreview);
  root.append(sourceFrame);

  const backgroundField=field('background','Output background','select','transparent',{options:[['transparent','Transparent'],['white','White'],['color','Custom color'],['image','Replacement image']]});
  const colorField=field('color','Background color','color','#ffffff');
  const replacementField=field('replacement','Replacement background image','file','',{accept:'.jpg,.jpeg,.png,.webp,.heic,.heif'});
  const form=el('div',{class:'fields'},[backgroundField,colorField,replacementField]);
  root.append(form);

  function syncBackgroundControls(){
    const mode=read('background');
    colorField.hidden=mode!=='color';
    replacementField.hidden=mode!=='image';
  }
  $('#background').addEventListener('change',syncBackgroundControls);
  syncBackgroundControls();

  bindFile(input,async files=>{
    const next=files[0];
    checkFile(next,['jpg','jpeg','png','webp','heic','heif'],mobile()?20:60);
    const decoded=await decodeImage(next);
    if(decoded.width*decoded.height>60e6){decoded.close?.();throw Error('Use an image below 60 million pixels.');}
    sourceImage?.close?.();
    sourceImage=decoded;
    file=next;
    clearOutputs();
    const scale=Math.min(1,1200/sourceImage.width,900/sourceImage.height);
    sourcePreview.width=Math.max(1,Math.round(sourceImage.width*scale));
    sourcePreview.height=Math.max(1,Math.round(sourceImage.height*scale));
    const ctx=sourcePreview.getContext('2d');
    ctx.clearRect(0,0,sourcePreview.width,sourcePreview.height);
    ctx.drawImage(sourceImage,0,0,sourcePreview.width,sourcePreview.height);
    sourceFrame.hidden=false;
    status(`File ready · ${sourceImage.width} × ${sourceImage.height} pixels.`);
  });

  bindFile($('#replacement'),async files=>{
    const next=files[0];
    checkFile(next,['jpg','jpeg','png','webp','heic','heif'],mobile()?20:60);
    const test=await decodeImage(next);
    try{
      if(test.width*test.height>60e6)throw Error('Use a replacement image below 60 million pixels.');
      replacement=next;
    }finally{test.close?.();}
  });

  notice(root,'Your image pixels stay in your browser. The background-removal model/runtime may be downloaded from the configured third-party model host. Original resolution is preserved when device memory limits allow; very large images are reduced only to a safer output size.');

  root.append(el('div',{class:'actions'},action('Remove background',async()=>{
    if(!file||!sourceImage)throw Error('Choose a foreground image first.');
    if(read('background')==='image'&&!replacement)throw Error('Choose a replacement background image.');
    clearOutputs();

    status('Loading background-removal engine…');
    const engine=await load('background');
    if(typeof engine.segmentForeground!=='function')throw Error('Background-removal mask engine is unavailable.');

    const out=safeOutputSize(sourceImage.width,sourceImage.height);
    const infer=inferenceSize(sourceImage.width,sourceImage.height);
    const inferenceCanvas=el('canvas',{width:infer.width,height:infer.height});
    const inferenceCtx=inferenceCanvas.getContext('2d');
    inferenceCtx.imageSmoothingEnabled=true;
    inferenceCtx.imageSmoothingQuality='high';
    inferenceCtx.drawImage(sourceImage,0,0,infer.width,infer.height);

    status(`Preparing AI mask · ${infer.width} × ${infer.height} inference image…`);
    const inputBlob=await canvasBlob(inferenceCanvas,'image/png',1);
    inferenceCanvas.width=inferenceCanvas.height=0;

    const maskBlob=await engine.segmentForeground(inputBlob,{
      model:'isnet_quint8',
      device:'cpu',
      proxyToWorker:false,
      output:{format:'image/png',quality:1},
      progress:(key,current,total)=>{
        if(key.startsWith('fetch:'))status(`Loading background model… ${total?Math.round(current/total*100)+'%':''}`);
        else status(`Removing background… ${total?Math.round(current/total*100)+'%':''}`);
      }
    });

    const mask=await decodeImage(new File([maskBlob],'foreground-mask.png',{type:'image/png'}));
    const canvas=el('canvas',{width:out.width,height:out.height});
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    try{
      status('Compositing full-resolution result…');
      ctx.clearRect(0,0,out.width,out.height);
      ctx.drawImage(sourceImage,0,0,out.width,out.height);
      ctx.globalCompositeOperation='destination-in';
      ctx.drawImage(mask,0,0,out.width,out.height);
      ctx.globalCompositeOperation='destination-over';

      const mode=read('background');
      if(mode==='white'||mode==='color'){
        ctx.fillStyle=mode==='white'?'#fff':read('color');
        ctx.fillRect(0,0,out.width,out.height);
      }else if(mode==='image'){
        const bg=await decodeImage(replacement);
        try{fittedDraw(ctx,bg,out.width,out.height,'cover');}
        finally{bg.close?.();}
      }
      ctx.globalCompositeOperation='source-over';

      const finalBlob=await canvasBlob(canvas,'image/png',1);
      const url=output(finalBlob,safeName(file.name,'-background','png'));
      const preview=el('img',{src:url,class:'preview-image',alt:'Background removal result'});
      $('#downloads').prepend(checkerboardFrame(preview));
      status(`Ready · ${out.width} × ${out.height} pixels.${out.reduced?` Reduced from ${sourceImage.width} × ${sourceImage.height} only to stay within the safer ${Math.round(out.pixelCap/1e6)} MP device limit.`:' Original image dimensions preserved.'} Check fine edges before using the result.`);
    }finally{
      mask.close?.();
      canvas.width=canvas.height=0;
    }
  },true)));

  setupStatus(root);
  downloads(root);
  window.addEventListener('pagehide',()=>sourceImage?.close?.(),{once:true});
}
