// PDF Merger Task 2 — verified, bounded, ordered output.
// Keep input admission in Task 1 and UI rendering/preview in Task 3.
import {limitsFor} from './pdf-merger-input.js';

export function cancellationError(){
 return Object.assign(Error('Merge cancelled. Your previous successful download is still available.'),{name:'AbortError'});
}
export function requireActive(signal){
 if(signal?.aborted)throw cancellationError();
}
export function pdfPageGeometry(page){
 const crop=page.getCropBox();
 return {
  width:page.getWidth(),height:page.getHeight(),
  rotation:page.getRotation().angle,
  crop:{x:crop.x,y:crop.y,width:crop.width,height:crop.height}
 };
}
export function sameGeometry(a,b){
 const near=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<.02;
 return near(a.width,b.width)&&near(a.height,b.height)&&a.rotation===b.rotation&&
  ['x','y','width','height'].every(key=>near(a.crop[key],b.crop[key]));
}
export function checkComplexStructure(source,lib,name,{allowBookmarkLoss=false}={}){
 // Page-copy workflows cannot promise to preserve cross-document structures.
 // Reject known incompatible documents rather than silently stripping user data.
 const root=source.catalog;
 // A copied-page merge does not retain document bookmarks.
 // Require deliberate user consent before omitting them.
 if(root.get(lib.PDFName.of('Outlines'))!==undefined&&!allowBookmarkLoss)
  throw Error('"'+name+'" contains bookmarks / document outlines. To merge its pages, select "Merge pages only (remove bookmarks)" below Create PDF, then retry. Original PDFs stay unchanged.');
 const keys=[
  ['AcroForm','interactive form fields or signatures'],
  ['AF','associated document attachments'],
  ['Perms','document permissions or certification signatures'],
  ['OpenAction','document-level interactive actions'],
  ['AA','document-level actions'],
  ['StructTreeRoot','tagged accessibility structure'],
  ['OCProperties','optional-content layers'],
  ['PageLabels','custom page labels'],
  ['Dests','named destinations'],
  ['Threads','document threads'],
  ['Collection','PDF portfolio structure']
 ];
 for(const [key,feature] of keys){
  if(root.get(lib.PDFName.of(key))!==undefined)
   throw Error('"'+name+'" contains '+feature+
    '. PDF Merger cannot safely preserve this document-level feature. Use a flattened or simplified copy from a trusted PDF application.');
 }
 const names=root.get(lib.PDFName.of('Names'));
 if(names!==undefined){
  // Named destinations, JavaScript and embedded file dictionaries refer to source
  // document structure, which is not carried forward by copying pages alone.
  throw Error('"'+name+'" contains document-level named resources (such as attachments, scripts or destinations).'+
   ' Use a simplified copy from a trusted PDF application before merging.');
 }
 // Page-scoped destinations and actions can refer to objects/pages that
 // copying pages into a new PDF does not reliably carry over.
 for(const page of source.getPages()){
  if(page.node.get(lib.PDFName.of('AA'))!==undefined)
   throw Error('"'+name+'" contains page-level actions that cannot be preserved safely. Use a simplified copy.');
  const raw=page.node.get(lib.PDFName.of('Annots'));
  if(raw===undefined)continue;
  const annotations=source.context.lookup(raw);
  if(!annotations||typeof annotations.asArray!=='function')
   throw Error('"'+name+'" contains unsupported annotations. Use a simplified copy.');
  for(const ref of annotations.asArray()){
   const annotation=source.context.lookup(ref);
   if(!annotation||typeof annotation.get!=='function')
    throw Error('"'+name+'" contains unsupported annotations. Use a simplified copy.');
   if(annotation.get(lib.PDFName.of('Dest'))!==undefined)
    throw Error('"'+name+'" contains internal page destinations that cannot be preserved safely. Use a simplified copy.');
   if(annotation.get(lib.PDFName.of('AA'))!==undefined)
    throw Error('"'+name+'" contains annotation actions that cannot be preserved safely. Use a simplified copy.');
   const actionRef=annotation.get(lib.PDFName.of('A'));
   if(actionRef!==undefined){
    const action=source.context.lookup(actionRef);
    // Ordinary external URI links remain supported. Other actions may
    // point to missing pages/objects or trigger unsafe behavior.
    if(action?.get?.(lib.PDFName.of('S'))?.toString()!=='/URI')
     throw Error('"'+name+'" contains unsupported page links or actions. Use a simplified copy.');
   }
  }
 }
}
export async function verifiedMerge(entries,lib,{signal=null,onProgress=()=>{},isMobile=false,allowBookmarkLoss=false}={}){
 if(!Array.isArray(entries)||entries.length<2)throw Error('Choose at least two PDFs.');
 if(!lib?.PDFDocument?.load||!lib?.PDFDocument?.create||!lib?.PDFName?.of)
  throw Error('The PDF merge engine is unavailable. Reload and retry.');
 const limits=limitsFor(isMobile);
 if(entries.length>limits.maxFiles)throw Error('Too many source documents for this device.');
 const combinedSize=entries.reduce((sum,e)=>sum+(e?.file?.size||0),0);
 const promisedPages=entries.reduce((sum,e)=>sum+e.pageCount,0);
 if(combinedSize>limits.maxTotalBytes||promisedPages>limits.maxPages)
  throw Error('These PDFs exceed the safe merge limits for this device. Use a smaller batch.');
 const outputLimit=250*1024*1024; // Same verified-output envelope across phone and desktop.
 let output=null;
 const expected=[];
 try{
  output=await lib.PDFDocument.create();
  for(const [index,entry] of entries.entries()){
   requireActive(signal);
   onProgress({phase:'copying',index:index+1,total:entries.length});
   // No cached decoded source PDF retained between inputs.
   let source=null;
   try{
    source=await lib.PDFDocument.load(await entry.file.arrayBuffer(),{updateMetadata:false});
    requireActive(signal);
    const count=source.getPageCount();
    if(count!==entry.pageCount||count<1)
     throw Error('"'+entry.file.name+'" changed since selection. Remove the file and add it again.');
    checkComplexStructure(source,lib,entry.file.name,{allowBookmarkLoss});
    const srcPages=source.getPages();
    for(const page of srcPages)expected.push(pdfPageGeometry(page));
    const copies=await output.copyPages(source,source.getPageIndices());
    requireActive(signal);
    for(const page of copies)output.addPage(page);
   }catch(error){
    if(error?.name==='AbortError')throw error;
    if(/contains | changed since selection/.test(String(error?.message)))throw error;
    throw Error('Could not merge "'+entry.file.name+'". '+( /encrypt|password/i.test(error?.message||'')
     ?'This source is encrypted or password-protected.'
     :'The source may be corrupted or unsupported. Your previous download is preserved.'));
   }finally{source=null;}
   // Allow progress UI and the Cancel control to respond between sources.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  requireActive(signal);
  if(output.getPageCount()!==promisedPages||expected.length!==promisedPages)
   throw Error('Merged page count did not match the selected sources. No new download was created.');
  onProgress({phase:'saving',total:entries.length,index:entries.length});
  const bytes=await output.save();
  requireActive(signal);
  if(!bytes?.byteLength||bytes.byteLength>outputLimit)
   throw Error('The merged PDF exceeds the safe output size for this device. Try a smaller batch. Previous downloads are preserved.');
  onProgress({phase:'verifying',total:entries.length,index:entries.length});
  // Reopen the actual result, not the in-memory assembly.
  let checked=null;
  try{
   checked=await lib.PDFDocument.load(bytes,{updateMetadata:false});
   if(checked.getPageCount()!==promisedPages)
    throw Error('Merged result has an unexpected number of pages.');
   const actual=checked.getPages().map(pdfPageGeometry);
   for(let i=0;i<actual.length;i++)
    if(!sameGeometry(actual[i],expected[i]))
     throw Error('Merged page '+(i+1)+' differs from the source page size, crop or orientation.');
  }catch(error){
   throw Error('Merged PDF could not be verified: '+String(error?.message||error)+'. No new download was created.');
  }finally{checked=null;}
  requireActive(signal);
  onProgress({phase:'ready',total:entries.length,index:entries.length});
  return {blob:new Blob([bytes],{type:'application/pdf'}),pageCount:promisedPages,byteLength:bytes.byteLength};
 }finally{output=null;}
}
