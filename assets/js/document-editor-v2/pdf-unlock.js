import {PDFDocument} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/pdf-lib.js';
import {sourceDigest} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/workspace/native-draft.js';
const limit=60*1024*1024;
export function decryptPdf(bytes,password){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf-unlock-worker.js',import.meta.url));
    const finish=(error,value)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(new Error('PDF unlocking timed out. Your original file is unchanged.')),60000);
    worker.onerror=()=>finish(new Error('The local PDF unlock engine could not start.'));
    worker.onmessage=({data})=>data.error?finish(Object.assign(new Error(data.error),{code:data.code})):finish(null,{bytes:data.bytes,pageCount:data.pageCount});
    worker.postMessage({bytes,password});
  });
}
export function requestPdfPassword(message=''){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog'),form=document.createElement('form'),title=document.createElement('h2'),note=document.createElement('p'),label=document.createElement('label'),input=document.createElement('input'),unlock=document.createElement('button'),cancel=document.createElement('button'),status=document.createElement('p');
    title.textContent='Unlock PDF';title.id='document-v2-unlock-title';dialog.setAttribute('aria-labelledby',title.id);
    note.textContent='Enter the PDF password. Unlocking happens on this device. Recovery saves a decrypted local copy; the password is not saved. Exported copies are not password-protected.';
    input.type='password';input.autocomplete='off';label.append('PDF password ',input);unlock.type='submit';unlock.textContent='Unlock';cancel.type='button';cancel.textContent='Cancel';status.setAttribute('role','status');status.textContent=message;
    const finish=value=>{input.value='';dialog.close();dialog.remove();resolve(value);};
    form.addEventListener('submit',event=>{event.preventDefault();finish(input.value);});cancel.addEventListener('click',()=>finish(null));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    form.append(title,note,label,status,unlock,cancel);dialog.append(form);document.body.append(dialog);dialog.showModal();input.focus();
  });
}
export async function preparePdf(file,{recovery,requestPassword=requestPdfPassword,decrypt=decryptPdf}={}){
  if(file.size>limit)throw new Error('PDF exceeds 60 MB limit.');
  const original=new Uint8Array(await file.arrayBuffer());
  const source=await PDFDocument.load(original.slice(),{ignoreEncryption:true,updateMetadata:false});
  if(!source.isEncrypted){if(recovery?.unlocked)throw new Error('Decrypted recovery does not match this file.');return {file};}
  const digest=await sourceDigest(original);let bytes,expectedPages;
  if(recovery?.unlocked){
    if(recovery.unlocked.source!==digest||!(recovery.unlocked.bytes instanceof Uint8Array)||recovery.unlocked.bytes.length>limit)throw new Error('Decrypted recovery does not match this file.');
    bytes=recovery.unlocked.bytes.slice();expectedPages=recovery.unlocked.pageCount;
  }else{
    let message='';
    while(!bytes){
      const password=await requestPassword(message);if(password===null)throw new Error('Opening password-protected PDF cancelled.');
      if(typeof password!=='string'||/[\r\n\0]/.test(password))throw new Error('This password contains unsupported control characters.');
      try{const result=await decrypt(original,password);bytes=result.bytes;expectedPages=result.pageCount;}catch(error){if(error.code!=='PDF_PASSWORD_INCORRECT')throw error;message=error.message;}
    }
  }
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>limit)throw new Error('Invalid unlocked PDF.');
  const clear=await PDFDocument.load(bytes.slice(),{updateMetadata:false});
  if(clear.isEncrypted||!Number.isInteger(expectedPages)||expectedPages<1||expectedPages>250||clear.getPageCount()!==expectedPages)throw new Error('Unlocking did not preserve the document page count.');
  const unlocked=new Blob([bytes],{type:'application/pdf'});Object.defineProperty(unlocked,'name',{value:file.name||'document.pdf'});
  return {file:unlocked,unlocked:{source:digest,bytes,pageCount:expectedPages}};
}
