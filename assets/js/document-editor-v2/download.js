// Shared delivery UI only. Export bytes and validation remain engine-owned.
export function createDownloadDelivery(root,say){
 const doc=root.ownerDocument,nav=doc.defaultView.navigator;
 const panel=doc.createElement('div');panel.className='document-v2-download';panel.hidden=true;panel.setAttribute('aria-label','Prepared download');
 const heading=doc.createElement('p'),save=doc.createElement('a'),open=doc.createElement('a'),share=doc.createElement('button'),help=doc.createElement('p');
 save.textContent='Save file';save.className='button primary';open.textContent='Open file';open.className='button';open.target='_blank';open.rel='noopener';share.type='button';share.textContent='Share / Save to Files';
 help.textContent='If saving does not start, tap Save file. On iPhone, use Share / Save to Files when available, or open the file and use the viewer’s Share button.';
 const row=doc.createElement('div');row.className='document-v2-actions';row.append(save,open,share);panel.append(heading,row,help);const status=root.querySelector('#document-v2-status');status.after(panel);
 let url=null,file=null,sharing=false;
 function clear(){panel.hidden=true;save.removeAttribute('href');open.removeAttribute('href');file=null;if(url)URL.revokeObjectURL(url);url=null;}
 share.addEventListener('click',()=>{
  if(!file||sharing)return;sharing=true;share.disabled=true;
  // Invoke synchronously within this tap, with no export/await ahead of it.
  let pending;try{pending=nav.share({files:[file]});}catch(error){pending=Promise.reject(error);}
  Promise.resolve(pending).then(()=>say('File handed to your device. Confirm it was saved in Files or your chosen app.'),error=>say(error.name==='AbortError'?'Sharing cancelled. Your prepared file is still available.':'Sharing is unavailable. Try Save file or Open file instead.',error.name!=='AbortError')).finally(()=>{sharing=false;share.disabled=false;});
 });
 return {clear,prepare(blob,name){
  clear();url=URL.createObjectURL(blob);save.href=open.href=url;save.download=name;heading.textContent='Ready to save: '+name;share.hidden=true;
  try{const FileType=doc.defaultView.File;file=new FileType([blob],name,{type:blob.type});share.hidden=!(typeof nav.share==='function'&&typeof nav.canShare==='function'&&nav.canShare({files:[file]}));}catch{file=null;}
  panel.hidden=false;
  // Retain ordinary automatic downloads, but the attached links remain usable
  // from a fresh gesture when a browser blocks the asynchronous attempt.
  try{save.click();}catch{/* The visible links remain available. */}
 },panel};
}
