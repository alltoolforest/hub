// Application Document Prep Task 1: processing reliability, no changes to other tools.
import {$,el,field,read,num,format,action,notice,setupStatus,status,fileInput,bindFile,checkFile,
  decodeImage,canvasBlob,output,downloads,clearOutputs,safeName,load,mobile,url} from './core.js';
import {encodeTarget} from './images.js'; // Reuse the existing verified encoding engine.
import {A4_POINTS,sourcePixelLimit,outputPixelLimit,checkPixels,checkApplicationFit,
  validateEncodedBlob,sniffImageDimensions,validatePdfPages} from './application-prep-checks.js';
import {cropFromPercent,cropToPercent,cropToPixels} from './application-prep-crop.js';

function fittedDraw(ctx,image,w,h,fit,position){
 const scale=fit==='contain'?Math.min(w/image.width,h/image.height):Math.max(w/image.width,h/image.height);
 const dw=image.width*scale,dh=image.height*scale;
 let x=(w-dw)/2,y=(h-dh)/2;
 if(position==='left')x=0;
 if(position==='right')x=w-dw;
 if(position==='top')y=0;
 if(position==='bottom')y=h-dh;
 ctx.drawImage(image,x,y,dw,dh);
}
function watermark(ctx,text,w,h){
 if(!text)return;
 const size=Math.max(12,Math.min(w,h)*.035);
 ctx.font='600 '+size+'px sans-serif';ctx.textAlign='right';ctx.textBaseline='bottom';
 ctx.fillStyle='rgba(0,0,0,.5)';
 const tw=ctx.measureText(text).width;
 ctx.fillRect(w-tw-24,h-size-26,tw+16,size+18);
 ctx.fillStyle='white';ctx.fillText(text,w-16,h-16);
}
export async function mount(root){
 let image=null,file=null,crop=null,drag=null,manual=false,updating=false;
 const input=fileInput(root,'.jpg,.jpeg,.png,.webp,.heic,.heif',false,'Select a photo or signature');
 const preview=el('canvas',{'aria-label':'Image preview; use manual crop then drag to select an area',role:'img'});
 const frame=el('div',{class:'canvas-frame',hidden:true});frame.append(preview);root.append(frame);
 const modeFields=el('div',{class:'fields app-workflow-fields'},[
   field('app-workflow','Preparing','select','photo',{options:[
     ['photo','Application photo'],['signature','Signature'],['document','Supporting image / PDF']
   ]})
 ]);
 const guidance=el('p',{class:'app-guidance',role:'status','aria-live':'polite'});
 frame.before(modeFields,guidance);
 const modeHints={
   photo:'Application photo: enter the exact portal dimensions and KB limit. Use Cover only when cropping is allowed. Do not alter identity features; acceptance is not guaranteed.',
   signature:'Signature: use the portal dimensions and KB limit. PNG preserves a transparent background where supported; JPG uses white. Avoid distortion.',
   document:'Supporting image: enter your required size, then choose image export or single-page A4 PDF. Check the portal accepts A4 and the final file size.'
 };
 const updateGuidance=()=>{guidance.textContent=modeHints[read('app-workflow')]||modeHints.photo;};
 $('#app-workflow').addEventListener('change',updateGuidance);updateGuidance();
 const form=el('div',{class:'fields app-essential-fields'});root.append(form);
 const add=(id,label,type='number',v='',options={})=>form.append(field(id,label,type,v,options));
 add('width','Width (pixels)','number',1200,{min:1,max:16384,step:1});
 add('height','Height (pixels)','number',800,{min:1,max:16384,step:1});
 add('fit','Fit mode','select','contain',{options:[['contain','Contain (fit within canvas)'],['cover','Cover (fill and crop)']]});
 add('position','Crop position','select','center',{options:['center','top','bottom','left','right']});
 add('format','Output format','select','image/jpeg',{options:[['image/jpeg','JPG'],['image/png','PNG'],['image/webp','WebP']]});
 add('quality','Quality (1–100)','number',90,{min:1,max:100});
 add('target','Maximum file size (KB; 0 = no limit)','number',0,{min:0,max:50000});
 add('rotation','Rotate','select','0',{options:[['0','0°'],['90','90°'],['180','180°'],['270','270°']]});
 add('brightness','Brightness (%)','number',100,{min:0,max:300});
 add('contrast','Contrast (%)','number',100,{min:0,max:300});
 add('watermark','Text watermark','text','',{full:true});
 form.append(el('label',{class:'check-row'},[el('input',{id:'lock-ratio',type:'checkbox',checked:true}),
    'Keep aspect ratio when changing dimensions']),
    el('label',{class:'check-row'},[el('input',{id:'flip-x',type:'checkbox'}),'Flip horizontally']),
    el('label',{class:'check-row'},[el('input',{id:'flip-y',type:'checkbox'}),'Flip vertically']));
 const advanced=el('details',{class:'app-advanced-settings'});
 advanced.append(el('summary',{text:'Advanced adjustments · quality, rotation, position'}));
 const advancedFields=el('div',{class:'fields app-advanced-fields'});
 for(const id of ['position','quality','rotation','brightness','contrast','watermark']){
   const fieldWrap=$('#'+id)?.closest('.field');
   if(fieldWrap)advancedFields.append(fieldWrap);
 }
 for(const id of ['flip-x','flip-y']){
   const check=$('#'+id)?.closest('.check-row');if(check)advancedFields.append(check);
 }
 advanced.append(advancedFields);root.append(advanced);
 const ratio=$('#lock-ratio')?.closest('.check-row');
 if(ratio){form.append(ratio);}
 const requirements=el('p',{class:'app-requirements',role:'status','aria-live':'polite'});
 root.append(requirements);
 const refreshRequirements=()=>{
   if(!image){requirements.textContent='Choose an image, then enter your portal’s width, height, format and optional KB limit.';return;}
   const w=Number(read('width')),h=Number(read('height')),kb=Number(read('target'));
   const valid=Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>0&&h>0;
   const original=image.width+' × '+image.height+' px';
   const output=valid?w+' × '+h+' px':'invalid output dimensions';
   const type=($('#format').selectedOptions[0]?.textContent)||read('format');
   const fit=read('fit');
   requirements.textContent='Source: '+original+' · Requested: '+output+' · '+type+
     (Number.isFinite(kb)&&kb>0?' · Max '+kb+' KB':' · No KB limit')+
     ' · '+(fit==='cover'?'Cover may crop image edges.':'Contain may add padding.')+
     ' Actual file size is checked after export.';
 };
 form.addEventListener('input',refreshRequirements);
 form.addEventListener('change',refreshRequirements);
 advanced.addEventListener('change',refreshRequirements);
 refreshRequirements();
 
 for(const id of ['width','height'])$('#'+id).addEventListener('input',()=>{
  if(updating||!image||!$('#lock-ratio').checked)return;
  const w=crop?crop.w*image.width:image.width,h=crop?crop.h*image.height:image.height;
  const r=+read('rotation')%180?h/w:w/h;
  if(!Number.isFinite(r)||r<=0)return;
  updating=true;
  try{if(id==='width')$('#height').value=Math.max(1,Math.round(+read('width')/r));
  else $('#width').value=Math.max(1,Math.round(+read('height')*r));}
  finally{updating=false;}
 });
 function showSource(){
  if(!image)return;
  const scale=Math.min(1,1000/image.width,1000/image.height);
  preview.width=Math.max(1,Math.round(image.width*scale));
  preview.height=Math.max(1,Math.round(image.height*scale));
  const c=preview.getContext('2d');if(!c)throw Error('Canvas preview unavailable on this device.');
  c.drawImage(image,0,0,preview.width,preview.height);
  const r=drag?{x:Math.min(drag.start.x,drag.end.x),y:Math.min(drag.start.y,drag.end.y),
    w:Math.abs(drag.start.x-drag.end.x),h:Math.abs(drag.start.y-drag.end.y)}:crop;
  if(r){
   c.fillStyle='#082b2944';c.fillRect(0,0,preview.width,preview.height);
   c.clearRect(r.x*preview.width,r.y*preview.height,r.w*preview.width,r.h*preview.height);
   c.drawImage(image,r.x*image.width,r.y*image.height,r.w*image.width,r.h*image.height,
     r.x*preview.width,r.y*preview.height,r.w*preview.width,r.h*preview.height);
   c.strokeStyle='#f5d983';c.lineWidth=2;
   c.strokeRect(r.x*preview.width,r.y*preview.height,r.w*preview.width,r.h*preview.height);
  }
 }
 bindFile(input,async files=>{
  const candidateFile=files[0];
  const ext=checkFile(candidateFile,['jpg','jpeg','png','webp','heic','heif'],mobile()?20:60);
  const limit=sourcePixelLimit(mobile());
  const header=new Uint8Array(await candidateFile.slice(0,262144).arrayBuffer());
  const dimensions=sniffImageDimensions(header,ext);
  if(dimensions)checkPixels(dimensions.width,dimensions.height,limit,'Source image');
  let candidate=null;
  try{
   candidate=await decodeImage(candidateFile);
   checkPixels(candidate.width,candidate.height,limit,'Source image');
   // Do not replace or close the last good image until its successor is validated.
   const old={image,file,crop,drag,manual};
   image=candidate;file=candidateFile;crop=null;drag=null;manual=false;
   preview.style.touchAction='auto';
   try{showSource();}
   catch(error){image=old.image;file=old.file;crop=old.crop;drag=old.drag;manual=old.manual;
     if(image)showSource();throw error;}
   frame.hidden=false;
   clearOutputs();
   if(old.image!==candidate)old.image?.close?.();
   $('#width').value=image.width;$('#height').value=image.height;
   resetCropFields();cropPanel.hidden=false;
   refreshRequirements();resultDetails.hidden=true;resultDetails.textContent='';
  }catch(error){if(candidate!==image)candidate?.close?.();throw error;}
 });
 const cropPanel=el('section',{class:'app-crop-panel',hidden:true,'aria-label':'Crop image without dragging'});
 cropPanel.append(el('h2',{text:'Crop the image'}));
 const cropHelp=el('p',{class:'app-crop-help',id:'app-crop-help',
   text:'Use the visual crop or enter left, top, width and height as percentages of the original image. Both methods produce the same crop.'});
 cropPanel.append(cropHelp);
 const cropFields=el('div',{class:'fields app-crop-fields'},[
   field('app-crop-x','Left (%)','number',0,{min:0,max:100,step:'any'}),
   field('app-crop-y','Top (%)','number',0,{min:0,max:100,step:'any'}),
   field('app-crop-w','Width (%)','number',100,{min:0.01,max:100,step:'any'}),
   field('app-crop-h','Height (%)','number',100,{min:0.01,max:100,step:'any'})
 ]);
 cropPanel.append(cropFields);
 function resetCropFields(){for(const [id,v] of [['app-crop-x',0],['app-crop-y',0],['app-crop-w',100],['app-crop-h',100]])$('#'+id).value=String(v);}
 function syncCropFields(){const p=cropToPercent(crop);
   for(const [id,v] of [['app-crop-x',p.x],['app-crop-y',p.y],['app-crop-w',p.w],['app-crop-h',p.h]])$('#'+id).value=String(v);
 }
 function applyCrop(c){
   if(!image)throw Error('Open an image first.');
   const px=cropToPixels(c,image.width,image.height);
   crop=c;drag=null;manual=false;preview.style.touchAction='auto';
   $('#width').value=px.w;$('#height').value=px.h;
   syncCropFields();showSource();refreshRequirements();
   cropHelp.textContent='Crop applied: '+px.w+' × '+px.h+' source pixels. Adjust percentages or clear the crop to revise.';
   status('Crop applied. Create the image or PDF to verify the final result.');
 }
 cropPanel.append(el('div',{class:'actions'},[
   action('Apply crop values',()=>applyCrop(cropFromPercent(
     read('app-crop-x'),read('app-crop-y'),read('app-crop-w'),read('app-crop-h')))),
   action('Use full image',()=>{
     if(!image)throw Error('Open an image first.');
     crop=null;drag=null;manual=false;preview.style.touchAction='auto';
     $('#width').value=image.width;$('#height').value=image.height;
     resetCropFields();showSource();refreshRequirements();
     cropHelp.textContent='Full image selected. You may enter new crop percentages.';
     status('Full image selected.');
   })
 ]));
 frame.after(cropPanel);
 const resultDetails=el('p',{class:'app-output-status',role:'status','aria-live':'polite',hidden:true});
 const point=e=>{
  const r=preview.getBoundingClientRect();
  return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),
    y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
 };
 preview.style.touchAction='auto';
 preview.addEventListener('pointerdown',e=>{
  if(!manual||!image)return;
  e.preventDefault();preview.setPointerCapture(e.pointerId);
  const p=point(e);drag={start:p,end:p};
 });
 preview.addEventListener('pointermove',e=>{if(drag){drag.end=point(e);showSource()}});
 preview.addEventListener('pointerup',()=>{
  if(!drag)return;
  const a=drag.start,b=drag.end;drag=null;
  if(Math.abs(a.x-b.x)<.005||Math.abs(a.y-b.y)<.005){status('Drag a larger crop area.',true);return;}
  const selection={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};
  try{applyCrop(selection);}catch(error){status(error.message||'Crop selection could not be applied.',true);}
 });
 preview.addEventListener('pointercancel',()=>{drag=null;showSource()});
 root.append(el('div',{class:'actions'},[
   action('Select visual crop',()=>{if(!image)throw Error('Open an image first.');
     manual=true;preview.style.touchAction='none';showSource();
     status('Drag on the image to select a crop. Scroll outside the image.');}),
   action('Clear crop',()=>{crop=null;manual=false;preview.style.touchAction='auto';
     showSource();if(image){$('#width').value=image.width;$('#height').value=image.height;}
     resetCropFields();refreshRequirements();})
 ]));
 function renderOutput(){
  if(!image)throw Error('Open an image first.');
  const w=num('width',{min:1,max:16384}),h=num('height',{min:1,max:16384});
  checkPixels(w,h,outputPixelLimit(mobile()),'Output image');
  const fit=checkApplicationFit(read('fit')),type=read('format');
  if(!['image/jpeg','image/png','image/webp'].includes(type))throw Error('Unsupported output format.');
  const brightness=num('brightness',{min:0,max:300}),contrast=num('contrast',{min:0,max:300});
  const rotation=+read('rotation');
  if(![0,90,180,270].includes(rotation))throw Error('Choose a valid image rotation.');
  const c=el('canvas',{width:w,height:h});let temp=null;
  try{
   const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas processing unavailable on this device.');
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   if(type==='image/jpeg'){ctx.fillStyle='white';ctx.fillRect(0,0,w,h);}
   const sx=(crop?.x||0)*image.width,sy=(crop?.y||0)*image.height;
   const sw=(crop?.w||1)*image.width,sh=(crop?.h||1)*image.height;
   if(sw<1||sh<1)throw Error('Crop selection is too small.');
   const limit=outputPixelLimit(mobile());
   const scale=Math.min(1,Math.sqrt(limit/(sw*sh)));
   const rw=Math.max(1,Math.round(sw*scale)),rh=Math.max(1,Math.round(sh*scale));
   temp=el('canvas',{width:rotation%180?rh:rw,height:rotation%180?rw:rh});
   const tc=temp.getContext('2d');if(!tc)throw Error('Canvas rotation unavailable.');
   tc.translate(temp.width/2,temp.height/2);
   tc.rotate(rotation*Math.PI/180);
   tc.scale($('#flip-x').checked?-1:1,$('#flip-y').checked?-1:1);
   tc.drawImage(image,sx,sy,sw,sh,-rw/2,-rh/2,rw,rh);
   ctx.filter='brightness('+brightness+'%) contrast('+contrast+'%)';
   fittedDraw(ctx,temp,w,h,fit,read('position'));
   ctx.filter='none';watermark(ctx,read('watermark'),w,h);
   return c;
  }catch(e){c.width=c.height=0;throw e;}
  finally{if(temp)temp.width=temp.height=0;}
 }
 const actions=el('div',{class:'actions'});
 actions.append(action('Create image',async()=>{
  let c=null;
  try{
   c=renderOutput();
   const type=read('format'),target=num('target',{min:0,max:50000});
   const quality=num('quality',{min:1,max:100})/100;
   const {blob}=await encodeTarget(c,type,quality,target);
   const info=validateEncodedBlob(blob,type,c.width,c.height,target);
   const actual=type==='image/jpeg'?'jpg':type==='image/webp'?'webp':'png';
   // Preserve previous download if render/encode/validation fails.
   clearOutputs();
   const link=output(blob,safeName(file.name,'-edited',actual));
   $('#downloads').prepend(el('img',{src:link,alt:'Processed image preview',class:'preview-image'}));
   resultDetails.hidden=false;
   resultDetails.textContent='Ready: '+info.width+' × '+info.height+' px · '+format(info.kb)+' KB · '+actual.toUpperCase()+
     '. Compare with your portal’s required dimensions, format and size before submitting.';
   status(info.width+' × '+info.height+' pixels · '+format(info.kb)+' KB · '+actual.toUpperCase()+
     (target?' · within '+target+' KB limit.':'.')+
     ' Check your portal requirements; file acceptance is not guaranteed.');
  }finally{if(c)c.width=c.height=0;}
 },true));
 actions.append(action('Create supporting-image PDF',async()=>{
  let c=null;
  try{
   c=renderOutput();
   const target=num('target',{min:0,max:50000}),quality=num('quality',{min:1,max:100})/100;
   const p=await load('pdf'),doc=await p.PDFDocument.create();
   const jpeg=read('format')==='image/jpeg';
   const inputBlob=await canvasBlob(c,jpeg?'image/jpeg':'image/png',quality);
   validateEncodedBlob(inputBlob,jpeg?'image/jpeg':'image/png',c.width,c.height);
   const img=jpeg?await doc.embedJpg(await inputBlob.arrayBuffer()):await doc.embedPng(await inputBlob.arrayBuffer());
   const page=doc.addPage(A4_POINTS),size=img.scaleToFit(A4_POINTS[0]-40,A4_POINTS[1]-40);
   page.drawImage(img,{x:(A4_POINTS[0]-size.width)/2,y:(A4_POINTS[1]-size.height)/2,
     width:size.width,height:size.height});
   validatePdfPages(doc);
   const blob=new Blob([await doc.save()],{type:'application/pdf'});
   const info=validateEncodedBlob(blob,'application/pdf',c.width,c.height,target);
   clearOutputs();
   output(blob,safeName(file.name,'-application','pdf'));
   resultDetails.hidden=false;
   resultDetails.textContent='Ready: single-page A4 PDF · '+format(info.kb)+' KB. Check that your portal accepts A4 PDFs.';
   status('A4 PDF · one page · '+format(info.kb)+' KB'+
     (target?' · within '+target+' KB limit.':'.')+
     ' Verify your portal accepts A4 PDFs. The image is fitted without stretching.');
  }finally{if(c)c.width=c.height=0;}
 }));
 root.append(el('p',{},el('a',{href:url('documents/pdf-compressor/'),class:'button',
   text:'Prepare an existing PDF ↗'})));
 actions.append(action('Reset image',()=>{
  crop=null;drag=null;manual=false;clearOutputs();preview.style.touchAction='auto';
  $('#rotation').value='0';$('#brightness').value=$('#contrast').value='100';
  $('#flip-x').checked=$('#flip-y').checked=false;$('#watermark').value='';
  if(image){$('#width').value=image.width;$('#height').value=image.height;}
  resetCropFields();refreshRequirements();resultDetails.hidden=true;resultDetails.textContent='';
  showSource();
 }));
 root.append(actions,resultDetails);
 setupStatus(root);downloads(root);
 window.addEventListener('pagehide',()=>image?.close?.(),{once:true});
}