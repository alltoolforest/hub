import {findMatches} from './find-replace.js';

export function pdfOcrSearch(editor){
  const panel=document.createElement('details'),summary=document.createElement('summary'),fields=document.createElement('div'),status=document.createElement('p');
  panel.className='document-v2-search';summary.textContent='Find and replace across scanned pages';fields.className='document-v2-actions';status.setAttribute('role','status');
  function input(label,type='text'){
    const wrap=document.createElement('label'),field=document.createElement('input');field.type=type;wrap.append(label+' ',field);fields.append(wrap);return field;
  }
  const query=input('Find'),replacement=input('Replace with'),matchCase=input('Match case','checkbox'),wholeWord=input('Whole word','checkbox');
  const buttons=[];let results=[],cursor=-1,busy=false,controller=null,disposed=false;
  const stop=document.createElement('button');stop.type='button';stop.textContent='Stop after current page';stop.hidden=true;
  stop.addEventListener('click',()=>{controller?.abort();stop.disabled=true;status.textContent='Stopping after the current OCR page finishes. Completed recognition will be retained.';});
  function invalidate(){results=[];cursor=-1;status.textContent='Search recognized OCR words, or run OCR on remaining scanned pages. Phrase matches spanning separate OCR word boxes are not included.';}
  async function run(action){
    if(busy||disposed)return;busy=true;
    for(const control of [...buttons,query,replacement,matchCase,wholeWord])control.disabled=true;
    try{await action();}catch(error){if(!disposed){results=[];cursor=-1;status.textContent=error.message;}}
    finally{busy=false;stop.hidden=true;controller=null;for(const control of [...buttons,query,replacement,matchCase,wholeWord])control.disabled=false;}
  }
  async function search(recognizeMissing=false){
    if(!query.value){invalidate();return;}
    controller=new AbortController();stop.hidden=!recognizeMissing;stop.disabled=false;
    const coverage=await editor.ocrTextEntries({recognizeMissing,signal:controller.signal,onProgress:({completed,total,pageIndex})=>{
      if(!controller.signal.aborted&&!disposed)status.textContent=`OCR indexing: ${completed} of ${total} scanned pages ready; page ${pageIndex+1}.`;
    }});
    if(disposed)return;
    const entries=coverage.entries.map(entry=>({...entry,localId:entry.id,id:JSON.stringify([entry.pageIndex,entry.id])})),byId=new Map(entries.map(entry=>[entry.id,entry]));
    results=findMatches(entries,query.value,{matchCase:matchCase.checked,wholeWord:wholeWord.checked}).map(match=>({...match,id:byId.get(match.id).localId,text:byId.get(match.id).text,pageIndex:byId.get(match.id).pageIndex}));
    cursor=-1;status.textContent=`${results.length} matches; ${coverage.completed} of ${coverage.total} scanned pages recognized.${coverage.cancelled?' Indexing stopped.':''}`;
  }
  function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>run(action));buttons.push(b);fields.append(b);}
  button('Search recognized pages',()=>search(false));button('Run remaining OCR and search',()=>search(true));
  async function navigate(direction){
    if(!results.length)await search(false);if(!results.length||disposed)return;
    cursor=cursor<0?(direction<0?results.length-1:0):(cursor+direction+results.length)%results.length;
    const match=results[cursor];await editor.revealOcrText(match);
    status.textContent=`Match ${cursor+1} of ${results.length}, page ${match.pageIndex+1}. OCR word highlighted.`;
  }
  button('Previous OCR match',()=>navigate(-1));button('Next OCR match',()=>navigate(1));
  async function replace(all){
    if(!results.length)await search(false);if(!results.length||disposed)return;
    const count=await editor.replaceOcrTextRanges(all?results:[results[Math.max(0,cursor)]],replacement.value);
    await search(false);if(!disposed)status.textContent=`${count} OCR replacements applied. ${results.length} matches remain in recognized pages.`;
  }
  button('Replace OCR match',()=>replace(false));button('Replace all OCR matches',()=>replace(true));
  for(const field of [query,matchCase,wholeWord])field.addEventListener('input',invalidate);
  fields.append(stop);panel.append(summary,fields,status);invalidate();
  panel.dispose=()=>{disposed=true;controller?.abort();};return panel;
}
