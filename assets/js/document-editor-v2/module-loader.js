// Retry transport failures only. Parsing/evaluation errors must remain visible
// to diagnostics, and no editing/export operation is replayed by this helper.
let sequence=0;
const networkFailure=error=>error?.name==='TypeError'&&/failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|load failed/i.test(String(error.message||''));
export async function importPdfModule(specifier,{load=url=>import(url),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const original=new URL(String(specifier)),run=++sequence;
  for(let attempt=0;attempt<3;attempt++){
    const url=new URL(original);
    if(attempt){url.searchParams.set('loadRetry',`${run}-${attempt}`);await pause(attempt===1?250:750);}
    try{return await load(url.href);}catch(error){
      if(!networkFailure(error))throw error;
      if(attempt===2)throw Object.assign(new Error('The PDF editor could not finish loading. Check your connection, then save your draft and reload the editor to retry. Your original file and any open document are unchanged.'),{code:'PDF_MODULE_LOAD_FAILED',cause:error});
    }
  }
}
