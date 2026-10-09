// PDF Merger Task 1: isolated source validation. The merge engine remains unchanged.
import {el,format,action,notice,setupStatus,status,fileInput,bindFile,pdfLib,output,downloads,clearOutputs,mobile} from './core.js';
import {preparePdfBatch,limitsFor} from './pdf-merger-input.js';

export async function mount(root){
 let files=[];
 const isMobile=mobile();
 const limits=limitsFor(isMobile);
 const input=fileInput(root,'.pdf',true,'Select PDFs');
 const list=el('ul',{class:'file-list'});
 const summary=el('p',{class:'pdf-merger-admission',role:'status','aria-live':'polite',
  text:'No PDFs selected. Up to '+limits.maxFiles+' files, '+limits.maxPages+' pages and '+
   Math.round(limits.maxTotalBytes/(1024*1024))+' MB total on this device.'});
 root.append(list,summary);
 function drawFiles(){
  list.replaceChildren();
  files.forEach((entry,i)=>{
   const row=el('li');
   row.append(
    el('span',{text:(i+1)+'. '+entry.file.name+' · '+format(entry.file.size/1024)+' KB · '+entry.pageCount+' page'+(entry.pageCount===1?'':'s')}),
    action('↑',()=>{if(i>0)[files[i-1],files[i]]=[files[i],files[i-1]];drawFiles()}),
    action('↓',()=>{if(i<files.length-1)[files[i+1],files[i]]=[files[i],files[i+1]];drawFiles()}),
    action('Remove',()=>{files.splice(i,1);drawFiles()})
   );
   list.append(row);
  });
  const pages=files.reduce((total,entry)=>total+entry.pageCount,0);
  summary.textContent=files.length+' PDF(s) · '+pages+' page(s) selected. Limits: '+limits.maxFiles+
   ' files, '+limits.maxPages+' pages, '+Math.round(limits.maxTotalBytes/(1024*1024))+' MB total.';
 }
 bindFile(input,async selected=>{
  // Neither the queue nor the displayed order changes until every new PDF is verified.
  try{
   const engine=await pdfLib();
   const result=await preparePdfBatch(files,selected,{
    isMobile,
    loadPdf:bytes=>engine.PDFDocument.load(bytes,{updateMetadata:false})
   });
   if(result.entries.length)files=[...files,...result.entries];
   drawFiles();
   const added=result.entries.length,skipped=result.skipped.length;
   const message=added+' PDF(s) added'+(skipped?' · '+skipped+' exact duplicate(s) skipped: '+result.skipped.join(', '):'')+
    '. The existing file order is preserved.';
   summary.textContent+=' '+message;
  }catch(error){
   // Existing entries and their order remain unchanged; bindFile presents error status.
   summary.textContent='Upload rejected. Previously selected '+files.length+
    ' PDF(s) retained in the same order. '+String(error?.message||error);
   throw error;
  }
 });
 notice(root,'Add files in batches, then use the arrows to set their order. Exact duplicate selections are skipped. Invalid or oversized batches do not replace previously selected PDFs.');
 // Preserve the existing sequential copyPages() merge operation and output handling.
 // Task 2 will separately address output integrity, prior downloads and merge recovery.
 async function process(){
  if(files.length<2)throw Error('Choose at least two PDFs.');
  const p=await pdfLib(),out=await p.PDFDocument.create();
  for(let i=0;i<files.length;i++){
   status('Merging '+(i+1)+' of '+files.length+'…');
   const source=await p.PDFDocument.load(await files[i].file.arrayBuffer());
   for(const page of await out.copyPages(source,source.getPageIndices()))out.addPage(page);
  }
  output(new Blob([await out.save()],{type:'application/pdf'}),'merged.pdf');
 }
 root.append(el('div',{class:'actions'},[
  action('Create PDF',async()=>{clearOutputs();await process()},true),
  action('Reset',()=>{
   files=[];list.replaceChildren();clearOutputs();drawFiles();
  })
 ]));
 setupStatus(root);downloads(root);
}
