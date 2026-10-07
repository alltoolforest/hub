const KEY='alltoolforest.invoice-builder.draft.v1';
const VERSION=1;
const MAX_BYTES=250000;

function storageAvailable(){
  try{
    const key='__atf_invoice_probe__';
    localStorage.setItem(key,'1');localStorage.removeItem(key);return true;
  }catch{return false}
}
export function saveInvoiceDraft(draft){
  if(!storageAvailable())return {ok:false,reason:'storage_unavailable'};
  try{
    const payload=JSON.stringify({version:VERSION,savedAt:new Date().toISOString(),draft});
    if(new Blob([payload]).size>MAX_BYTES)return {ok:false,reason:'draft_too_large'};
    localStorage.setItem(KEY,payload);
    return {ok:true};
  }catch{return {ok:false,reason:'save_failed'}}
}
export function loadInvoiceDraft(){
  if(!storageAvailable())return {ok:false,reason:'storage_unavailable',draft:null};
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw)return {ok:true,draft:null};
    if(new Blob([raw]).size>MAX_BYTES){localStorage.removeItem(KEY);return {ok:false,reason:'invalid_draft',draft:null}}
    const parsed=JSON.parse(raw);
    if(parsed?.version!==VERSION||!parsed.draft||typeof parsed.draft!=='object')return {ok:false,reason:'invalid_draft',draft:null};
    return {ok:true,draft:parsed.draft,savedAt:parsed.savedAt||''};
  }catch{return {ok:false,reason:'invalid_draft',draft:null}}
}
export function clearInvoiceDraft(){
  if(!storageAvailable())return {ok:false,reason:'storage_unavailable'};
  try{localStorage.removeItem(KEY);return {ok:true}}catch{return {ok:false,reason:'clear_failed'}}
}
export function hasInvoiceDraft(){
  const loaded=loadInvoiceDraft();
  return Boolean(loaded.ok&&loaded.draft);
}
