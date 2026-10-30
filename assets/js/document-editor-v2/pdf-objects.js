import {assertObjectLayout} from './pdf-object-layout.js';
import {imagesIn,applyImageChanges} from './pdf-image-objects.js';
import {PDFDocument,PDFName,PDFArray,PDFDict,PDFString} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/pdf-lib.js';
import {PdfRenderer} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/rendering/renderer.js';
import {sourceDigest} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/workspace/native-draft.js';
import {detectDocumentFlags} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/document-model.js';
import {formRegionSafe,verifyFormPreservation} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/form-protection.js';

const clone=value=>structuredClone(value);
function safeUrl(value){
  const text=String(value||'').trim();
  if(/[\u0000-\u001f\u007f]/u.test(text))throw new Error('The link contains invalid control characters.');
  let url;try{url=new URL(text);}catch{throw new Error('Enter a complete https://, http:// or mailto: link.');}
  if(!['https:','http:','mailto:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP, HTTPS or email link without embedded credentials.');
  return url.href;
}
function linksIn(doc){
  const result=[];
  for(const [pageIndex,page] of doc.getPages().entries()){
    const annots=page.node.lookupMaybe(PDFName.of('Annots'),PDFArray);if(!annots)continue;
    for(let index=0;index<annots.size();index++){
      const annotation=doc.context.lookup(annots.get(index));
      if(!(annotation instanceof PDFDict)||annotation.get(PDFName.of('Subtype'))?.toString()!=='/Link')continue;
      const action=annotation.lookupMaybe(PDFName.of('A'),PDFDict),uri=action?.lookup(PDFName.of('URI'));
      const rect=annotation.lookupMaybe(PDFName.of('Rect'),PDFArray)?.asArray().map(value=>doc.context.lookup(value)?.asNumber?.());
      if(!rect||rect.length!==4||!rect.every(Number.isFinite))continue;
      const text=uri?.decodeText?.();
      // Preserve internal destinations and non-URI actions without reinterpretation.
      if(action?.get(PDFName.of('S'))?.toString()!=='/URI'||typeof text!=='string')continue;
      result.push({id:`source-link:${pageIndex}:${index}`,kind:'link',pageIndex,x:Math.min(rect[0],rect[2]),y:Math.min(rect[1],rect[3]),width:Math.abs(rect[2]-rect[0]),height:Math.abs(rect[3]-rect[1]),url:text,source:{index,rect,url:text}});
    }
  }
  return result;
}

export async function createPdfObjectTools(file,{onChange,getBaseBytes,getEditorState}){
  const original=new Uint8Array(await file.arrayBuffer()),digest=await sourceDigest(original);
  const source=await PDFDocument.load(original.slice(),{updateMetadata:false});
  const boxes=source.getPages().map(page=>page.getCropBox()),sourceLinks=linksIn(source),sourceImages=imagesIn(source).map(({streamIndex,start,end,...item})=>item),sourceItems=[...sourceLinks,...sourceImages];
  let changes=[],busy=false,disposed=false,renderer=null;
  const panel=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Images, hyperlinks and page previews';panel.className='document-v2-search';
  const note=document.createElement('p');note.textContent='Add PNG/JPEG images or edit URL link rectangles. Position and size use original-page PDF points from the bottom-left; verified flow is applied at preview/export. Supported original images can also be moved, resized, replaced or deleted. Clipped, rotated, nested-form and inline images, and internal destination links, remain protected. Object edits can be exported alongside text flow on other pages; added images and links can follow verified same-page and cross-page flow. Original hyperlinks retain their actions during supported cascades. Objects crossing a cut boundary and original-image edits inside reconstructed slices remain protected.';
  const fields=document.createElement('div');fields.className='document-v2-actions';
  function field(label,type='number'){
    const wrap=document.createElement('label'),input=document.createElement('input');input.type=type;if(type==='number')input.step='0.1';wrap.append(label+' ',input);fields.append(wrap);return input;
  }
  const selection=document.createElement('select');selection.setAttribute('aria-label','Image or hyperlink to edit');fields.append(selection);
  const pageField=field('Page'),x=field('Left'),y=field('Bottom'),width=field('Width'),height=field('Height'),url=field('Link URL','url'),upload=field('PNG/JPEG image','file');
  pageField.min='1';pageField.max=String(boxes.length);pageField.step='1';upload.accept='image/png,image/jpeg';pageField.value='1';x.value='24';y.value='24';width.value='160';height.value='80';
  const status=document.createElement('p');status.setAttribute('role','status');
  const preview=document.createElement('div');preview.style.overflow='auto';preview.style.maxHeight='65vh';
  const thumbs=document.createElement('div');thumbs.className='document-v2-actions';thumbs.setAttribute('aria-label','Page thumbnails');
  panel.append(summary,note,fields,status,thumbs,preview);
  const controls=[];
  async function action(fn){
    if(busy||disposed)return;busy=true;for(const control of [...controls,...fields.querySelectorAll('input,select')])control.disabled=true;
    try{await fn();}catch(error){status.textContent=error.message;}
    finally{busy=false;for(const control of [...controls,...fields.querySelectorAll('input,select')])control.disabled=false;}
  }
  function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>action(fn));controls.push(b);fields.append(b);return b;}
  function currentItems(){const updates=new Map(changes.map(item=>[item.id,item]));return [...sourceItems.map(item=>updates.get(item.id)||item),...changes.filter(item=>!item.source)].filter(item=>!item.deleted);}
  function refresh(selected=selection.value){
    selection.replaceChildren(new Option('Select an image or hyperlink',''));
    for(const item of currentItems())selection.append(new Option(`Page ${item.pageIndex+1}: ${item.kind==='image'?(item.source?'original image':'added image'):item.url}`,item.id));
    selection.value=selected;
  }
  function selected(){const item=currentItems().find(item=>item.id===selection.value);if(!item)throw new Error('Select an image or hyperlink first.');return item;}
  function geometry(){return {pageIndex:Number(pageField.value)-1,x:Number(x.value),y:Number(y.value),width:Number(width.value),height:Number(height.value)};}
  function validate(item,outputBoxes=boxes){
    const box=outputBoxes[item.pageIndex];
    if(!box||!Number.isInteger(item.pageIndex)||!['x','y','width','height'].every(key=>Number.isFinite(item[key]))||item.width<=0||item.height<=0||item.x<box.x||item.y<box.y||item.x+item.width>box.x+box.width+.001||item.y+item.height>box.y+box.height+.001)throw new Error('The object rectangle must fit inside the selected page.');
    if(item.kind==='link')safeUrl(item.url);
    else if(item.kind!=='image'||(!item.source&&!item.bytes)||(item.bytes&&(!(item.bytes instanceof Uint8Array)||!['png','jpg'].includes(item.format))))throw new Error('Invalid image data.');
  }
  function commit(item){
    if(disposed)throw new Error('PDF session is closed.');
    if(!item.deleted)validate(item);
    const next=changes.filter(value=>value.id!==item.id);next.push(item);
    if(next.reduce((sum,value)=>sum+(value.bytes?.byteLength||0),0)>64*1024*1024)throw new Error('Image additions exceed this session’s 64 MB recovery budget.');
    changes=next;refresh(item.deleted?'':item.id);onChange();status.textContent='Object changes saved in the workspace. Refresh the preview to see the combined PDF.';
  }
  async function imageData(){
    const chosen=upload.files?.[0];if(!chosen)throw new Error('Choose a PNG or JPEG image.');
    if(chosen.size>64*1024*1024)throw new Error('This image exceeds the session recovery budget.');
    const bytes=new Uint8Array(await chosen.arrayBuffer());
    const format=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'png':bytes[0]===255&&bytes[1]===216?'jpg':null;
    if(!format)throw new Error('The selected file is not a PNG or JPEG image.');
    const probe=await PDFDocument.create();const embedded=format==='png'?await probe.embedPng(bytes):await probe.embedJpg(bytes);
    return {bytes,format,ratio:embedded.width/embedded.height};
  }
  selection.addEventListener('change',()=>{
    if(!selection.value)return;const item=selected();pageField.value=String(item.pageIndex+1);x.value=String(item.x);y.value=String(item.y);width.value=String(item.width);height.value=String(item.height);url.value=item.url||'';
  });
  button('Add image',async()=>{const image=await imageData(),rect=geometry();commit({id:crypto.randomUUID(),kind:'image',...rect,bytes:image.bytes,format:image.format});});
  button('Add hyperlink',()=>commit({id:crypto.randomUUID(),kind:'link',...geometry(),url:safeUrl(url.value)}));
  button('Apply position and size',()=>{const item=selected();if(item.source&&geometry().pageIndex!==item.pageIndex)throw new Error('Existing objects can be moved within their original page.');commit({...item,...geometry(),...(item.kind==='link'?{url:safeUrl(url.value)}:{})});});
  button('Replace selected image',async()=>{const item=selected();if(item.kind!=='image')throw new Error('Select an image.');const image=await imageData();commit({...item,bytes:image.bytes,format:image.format});});
  button('Keep image proportions',async()=>{const item=selected();if(item.kind!=='image')throw new Error('Select an image.');let ratio;if(item.bytes){const probe=await PDFDocument.create(),embedded=item.format==='png'?await probe.embedPng(item.bytes):await probe.embedJpg(item.bytes);ratio=embedded.height/embedded.width;}else ratio=item.source.pixelHeight/item.source.pixelWidth;height.value=String(Number(width.value)*ratio);status.textContent='Height adjusted. Apply position and size to save.';});
  button('Delete selected object',()=>{const item=selected();if(item.source)commit({...item,deleted:true});else{changes=changes.filter(value=>value.id!==item.id);refresh('');onChange();status.textContent='Added object deleted.';}});
  const alignment=document.createElement('select');alignment.setAttribute('aria-label','Object alignment');for(const value of ['left','center','right','top','middle','bottom'])alignment.append(new Option(value,value));fields.append(alignment);
  button('Align selected object',()=>{
    const item=selected(),box=boxes[item.pageIndex],next={...item};
    if(alignment.value==='left')next.x=box.x;if(alignment.value==='center')next.x=box.x+(box.width-item.width)/2;if(alignment.value==='right')next.x=box.x+box.width-item.width;
    if(alignment.value==='bottom')next.y=box.y;if(alignment.value==='middle')next.y=box.y+(box.height-item.height)/2;if(alignment.value==='top')next.y=box.y+box.height-item.height;
    commit(next);selection.dispatchEvent(new Event('change'));
  });
  async function apply(bytes,exportState=null){
    if(!changes.length)return bytes;
    const state=exportState||getEditorState();
    const doc=await PDFDocument.load(bytes.slice(),{updateMetadata:false});
    const exportChanges=assertObjectLayout(changes,state,boxes.length,doc.getPageCount());
    const flags=detectDocumentFlags(doc);
    if(flags.signed||detectDocumentFlags(source).signed)throw new Error('Signed PDFs are protected from image and hyperlink edits.');
    for(const item of exportChanges)if(!formRegionSafe(flags,item.pageIndex,item))throw new Error('This object edit overlaps a protected PDF form field.');
    const outputBoxes=doc.getPages().map(page=>page.getCropBox()),currentLinks=linksIn(doc),deletions=new Map();
    await applyImageChanges(doc,exportChanges);
    for(const item of exportChanges){
      const page=doc.getPage(item.pageIndex);
      if(item.kind==='image'){
        if(item.source)continue;
        validate(item,outputBoxes);const image=item.format==='png'?await doc.embedPng(item.bytes):await doc.embedJpg(item.bytes);
        page.drawImage(image,{x:item.x,y:item.y,width:item.width,height:item.height});continue;
      }
      let annotations=page.node.lookupMaybe(PDFName.of('Annots'),PDFArray);
      if(item.source){
        const matches=currentLinks.filter(link=>link.pageIndex===item.pageIndex&&link.source.url===item.source.url&&JSON.stringify(link.source.rect)===JSON.stringify(item.source.rect));const match=matches.length===1?matches[0]:null;
        if(!match)throw new Error('An original hyperlink changed during text/OCR export. Its edit was not applied.');
        // Clone the annotation, preserving unrelated fields and shared objects.
        const annotation=doc.context.lookup(annotations.get(match.source.index)).clone(doc.context);
        if(item.deleted){const list=deletions.get(item.pageIndex)||[];list.push(match.source.index);deletions.set(item.pageIndex,list);continue;}
        else{validate(item,outputBoxes);annotation.set(PDFName.of('Rect'),doc.context.obj([item.x,item.y,item.x+item.width,item.y+item.height]));annotation.set(PDFName.of('A'),doc.context.obj({S:'URI',URI:PDFString.of(safeUrl(item.url))}));annotation.delete(PDFName.of('Dest'));}
        // Clone the array too, so an inherited/shared annotation array is not edited.
        annotations=annotations.clone(doc.context);annotations.set(match.source.index,doc.context.register(annotation));page.node.set(PDFName.of('Annots'),annotations);
      }else{
        validate(item,outputBoxes);annotations=annotations?annotations.clone(doc.context):doc.context.obj([]);
        annotations.push(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[item.x,item.y,item.x+item.width,item.y+item.height],Border:[0,0,0],A:{S:'URI',URI:PDFString.of(safeUrl(item.url))}})));page.node.set(PDFName.of('Annots'),annotations);
      }
    }
    for(const [index,indices] of deletions){const page=doc.getPage(index),annots=page.node.lookup(PDFName.of('Annots'),PDFArray).clone(doc.context);for(const position of indices.sort((a,b)=>b-a))annots.remove(position);page.node.set(PDFName.of('Annots'),annots);}
    const out=new Uint8Array(await doc.save({useObjectStreams:false,updateFieldAppearances:false}));
    await verifyFormPreservation(original,out,{reflowMetrics:state.reflowMetrics||[]});
    const check=await PDFDocument.load(out.slice(),{updateMetadata:false});if(check.getPageCount()!==doc.getPageCount())throw new Error('Object export lost a page.');
    return out;
  }
  button('Discard image and link edits',()=>{
    if(!changes.length){status.textContent='No image or link edits to discard.';return;}
    if(!confirm('Discard all image and hyperlink changes? Text and OCR edits will remain.'))return;
    changes=[];refresh('');onChange();status.textContent='Image and link edits discarded. Text and OCR edits remain. Use workspace Undo to recover them.';
  });
  async function showPage(index){
    if(!renderer)return;
    const info=await renderer.pageInfo(index),canvas=document.createElement('canvas');
    await renderer.render(index,canvas,{scale:Math.min(1,760/info.width)});
    if(disposed)return;canvas.setAttribute('aria-label',`PDF preview page ${index+1}`);canvas.style.maxWidth='100%';canvas.style.height='auto';preview.replaceChildren(canvas);pageField.value=String(index+1);
  }
  button('Refresh PDF preview',async()=>{
    const base=await getBaseBytes();
    const bytes=base?.bytes?await apply(base.bytes,{reflowMetrics:base.nativeResult?.reflowMetrics??base.reflowMetrics??getEditorState().reflowMetrics??[],ocrEditedPages:base.ocrEditedPages??getEditorState().ocrEditedPages??[]}):await apply(base);await renderer?.destroy();renderer=new PdfRenderer(bytes,{maxCachedPages:2});await renderer.load();
    const index=Math.max(0,Math.min(boxes.length-1,Number(pageField.value)-1||0));await showPage(index);
    thumbs.replaceChildren();
    const start=Math.floor(index/6)*6;
    for(let i=start;i<Math.min(start+6,boxes.length);i++){
      const b=document.createElement('button'),canvas=document.createElement('canvas');b.type='button';b.setAttribute('aria-label',`Preview page ${i+1}`);
      const info=await renderer.pageInfo(i);await renderer.render(i,canvas,{scale:Math.min(100/info.width,130/info.height)});b.append(canvas,`Page ${i+1}`);b.addEventListener('click',()=>action(()=>showPage(i)));thumbs.append(b);
    }
    status.textContent=`Combined PDF preview; thumbnails ${start+1}–${Math.min(start+6,boxes.length)} of ${boxes.length}. Enter another page number and refresh for another group.`;
  });
  refresh();
  return {panel,apply,
    snapshot(){if(busy)throw new Error('Wait for the image/link operation to finish.');return {version:1,source:digest,changes:clone(changes)};},
    async restore(draft){
      if(!draft)return;if(draft.version!==1||draft.source!==digest||!Array.isArray(draft.changes)||draft.changes.length>10000)throw new Error('Invalid PDF object draft.');
      const ids=new Set();let size=0;
      for(const item of draft.changes){
        if(!item||typeof item.id!=='string'||ids.has(item.id))throw new Error('Duplicate or invalid PDF object.');ids.add(item.id);
        if(item.source){const original=sourceItems.find(link=>link.id===item.id);if(!original||original.kind!==item.kind||original.pageIndex!==item.pageIndex||JSON.stringify(original.source)!==JSON.stringify(item.source))throw new Error('Original object does not match this draft.');}
        else if(sourceItems.some(original=>original.id===item.id))throw new Error('An original object is missing its source identity.');
        if(!item.deleted)validate(item);else if(!item.source)throw new Error('Invalid deleted object.');size+=item.bytes?.byteLength||0;
      }
      if(size>64*1024*1024)throw new Error('Image draft exceeds the recovery budget.');changes=clone(draft.changes);refresh();
    },
    async dispose(){disposed=true;await renderer?.destroy();preview.replaceChildren();thumbs.replaceChildren();changes=[];}
  };
}
