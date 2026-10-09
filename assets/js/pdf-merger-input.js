// PDF Merger input admission — Task 1 behavior retained; mobile/desktop limits aligned for multi-PDF workflows.
// This module does not modify the PDF merging engine or other document tools.
export const PDF_MERGER_LIMITS=Object.freeze({
 mobile:Object.freeze({maxFiles:35,maxTotalBytes:200*1024*1024,maxFileBytes:100*1024*1024,maxPages:1200}),
 desktop:Object.freeze({maxFiles:35,maxTotalBytes:200*1024*1024,maxFileBytes:100*1024*1024,maxPages:1200})
});
export function limitsFor(isMobile){return isMobile?PDF_MERGER_LIMITS.mobile:PDF_MERGER_LIMITS.desktop;}
export function duplicateKey(file){return JSON.stringify([file.name,file.size,file.lastModified]);}
// Matching metadata is not proof that PDFs have the same bytes.
// Read only small chunks on collisions, even when files are large.
export async function samePdfContents(a,b){
 if(a.size!==b.size)return false;
 const chunkSize=256*1024;
 for(let offset=0;offset<a.size;offset+=chunkSize){
  const end=Math.min(a.size,offset+chunkSize);
  const left=new Uint8Array(await a.slice(offset,end).arrayBuffer());
  const right=new Uint8Array(await b.slice(offset,end).arrayBuffer());
  if(left.length!==right.length)return false;
  for(let i=0;i<left.length;i++)if(left[i]!==right[i])return false;
 }
 return true;
}
export function inputLimits(entries,files,isMobile){
 const limits=limitsFor(isMobile);
 const totalCount=entries.length+files.length;
 if(totalCount>limits.maxFiles)
  throw Error('This device supports up to '+limits.maxFiles+' PDFs per merge. Remove a file or use a smaller batch.');
 const totalSize=[...entries.map(item=>item.file),...files].reduce((sum,file)=>sum+file.size,0);
 if(totalSize>limits.maxTotalBytes)
  throw Error('Combined PDFs exceed the '+Math.round(limits.maxTotalBytes/(1024*1024))+' MB limit on this device. Previously selected files were retained.');
 for(const file of files){
  if(!file||typeof file.name!=='string'||typeof file.size!=='number')
   throw Error('The selected file is unavailable. Choose a PDF again.');
  if(!/\.pdf$/i.test(file.name))
   throw Error('Unsupported file "'+file.name+'". Select a .pdf document.');
  if(file.size===0)
   throw Error('"'+file.name+'" is empty. Choose a nonempty PDF.');
  if(file.size>limits.maxFileBytes)
   throw Error('"'+file.name+'" exceeds the per-file '+Math.round(limits.maxFileBytes/(1024*1024))+' MB limit.');
 }
 return limits;
}
export function describePdfError(file,error){
 const message=String(error?.message||error||'');
 if(/encrypt|password/i.test(message))
  return Error('"'+file.name+'" is password-protected or encrypted. Unlock it in a trusted PDF application before merging.');
 if(/page limit/i.test(message))return error;
 return Error('"'+file.name+'" could not be read as a valid PDF. It may be damaged or contain unsupported features. Resave it in a trusted PDF application and retry.');
}
export async function validatePdfFile(file,loadPdf,limits,usedPages=0){
 // Fast magic-byte check prevents extension-spoofed text/files entering the parser.
 // The PDF header may occur within the first 1024 bytes in some valid PDFs.
 const header=new Uint8Array(await file.slice(0,1024).arrayBuffer());
 let marker=false;
 for(let i=0;i+4<header.length;i++){
  if(header[i]===37&&header[i+1]===80&&header[i+2]===68&&header[i+3]===70&&header[i+4]===45){marker=true;break;}
 }
 if(!marker)throw Error('"'+file.name+'" is not a PDF: the file header is missing or invalid.');
 let pdf;
 try{
  // Full source bytes are held only for this single input preflight, not stored in the queue.
  pdf=await loadPdf(await file.arrayBuffer());
  const count=pdf.getPageCount();
  if(!Number.isSafeInteger(count)||count<1)
   throw Error('Document contains no usable pages.');
  if(usedPages+count>limits.maxPages)
   throw Error('page limit: This device supports up to '+limits.maxPages+
    ' combined pages. "'+file.name+'" would exceed the limit.');
  return count;
 }catch(error){
  if(/page limit/i.test(String(error?.message)))throw error;
  if(/no usable pages/i.test(String(error?.message)))
   throw Error('"'+file.name+'" contains no usable PDF pages. Choose a document with at least one page.');
  throw describePdfError(file,error);
 }finally{
  // pdf-lib documents have no destroy() API; release by relinquishing references.
  pdf=null;
 }
}
export async function preparePdfBatch(existing,selected,{isMobile=false,loadPdf}={}){
 if(typeof loadPdf!=='function')throw Error('PDF engine is unavailable for validation.');
 const previous=Array.isArray(existing)?existing:[];
 const incoming=Array.from(selected||[]);
 const known=new Map();
 for(const entry of previous){
  const key=duplicateKey(entry.file);
  if(!known.has(key))known.set(key,[]);
  known.get(key).push(entry.file);
 }
 const staged=[],skipped=[];
 for(const file of incoming){
  const key=duplicateKey(file);
  const candidates=known.get(key)||[];
  let duplicate=false;
  for(const candidate of candidates){
   if(await samePdfContents(candidate,file)){duplicate=true;break;}
  }
  if(duplicate){skipped.push(file.name);continue;}
  if(!known.has(key))known.set(key,[]);
  known.get(key).push(file);staged.push(file);
 }
 // Preflight all prospective changes before accepting a single new file.
 const limits=inputLimits(previous,staged,isMobile);
 let totalPages=previous.reduce((sum,item)=>sum+item.pageCount,0);
 if(totalPages>limits.maxPages)throw Error('The existing merge queue exceeds this device’s page limit.');
 const entries=[];
 for(const file of staged){
  const pageCount=await validatePdfFile(file,loadPdf,limits,totalPages);
  totalPages+=pageCount;
  entries.push({file,pageCount});
 }
 return {entries,skipped,limits,totalPages,added:entries.length};
}
