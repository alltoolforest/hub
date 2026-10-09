// PDF Merger heavy-job worker. Only loads local vendor PDFLib and the verified merger.
// Using a dedicated Worker keeps heavy page copying away from the mobile UI thread.
self.onmessage=async event=>{
 if(event.data?.type!=='merge')return;
 try{
  importScripts('../vendor/pdf-lib.js');
  if(!self.PDFLib?.PDFDocument)throw Error('The local PDF engine could not start.');
  const {verifiedMerge}=await import('./pdf-merger-verify.js');
  const {entries,isMobile}=event.data;
  const result=await verifiedMerge(entries,self.PDFLib,{
   isMobile,
   onProgress:info=>self.postMessage({type:'progress',info})
  });
  // Blob is structured-cloned without exposing source file contents to any server.
  self.postMessage({type:'result',blob:result.blob,pageCount:result.pageCount,byteLength:result.byteLength});
 }catch(error){
  // No stacks, file bytes or raw PDF content leave this worker.
  self.postMessage({type:'error',message:String(error?.message||'PDF merging failed.')});
 }
};
