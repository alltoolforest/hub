import {findMatches} from './find-replace.js';
export function pdfSearch(editor){
  const panel=document.createElement('details'),summary=document.createElement('summary'),fields=document.createElement('div'),status=document.createElement('p');
  panel.className='document-v2-search';summary.textContent='Find and replace PDF text';fields.className='document-v2-actions';status.setAttribute('role','status');
  function input(label,type='text'){const wrapper=document.createElement('label'),field=document.createElement('input');field.type=type;wrapper.append(label+' ',field);fields.append(wrapper);return field;}
  const query=input('Find'),replacement=input('Replace with'),matchCase=input('Match case','checkbox'),wholeWord=input('Whole word','checkbox');
  let results=[],cursor=-1,busy=false;
  const buttons=[];
  function invalidate(){results=[];cursor=-1;status.textContent='Search covers safely editable native PDF text and native text additions. On scanned pages, run OCR and use that page’s OCR search controls.';}
  async function run(action){if(busy)return;busy=true;buttons.forEach(button=>button.disabled=true);try{await action();}catch(error){status.textContent=error.message;}finally{busy=false;buttons.forEach(button=>button.disabled=false);}}
  async function search(){
    const entries=await editor.textEntries(),byId=new Map(entries.map(entry=>[entry.id,entry]));
    results=findMatches(entries,query.value,{matchCase:matchCase.checked,wholeWord:wholeWord.checked}).map(match=>({...match,text:byId.get(match.id).text,pageIndex:byId.get(match.id).pageIndex}));
    cursor=-1;status.textContent=`${results.length} matches in editable native text. Protected regions are excluded; scanned-page OCR search is available per OCR-processed page.`;
  }
  function button(label,action){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>run(action));fields.append(button);buttons.push(button);}
  button('Search',search);
  async function navigate(direction){if(!results.length){await search();if(!results.length)return;}cursor=cursor<0?(direction<0?results.length-1:0):(cursor+direction+results.length)%results.length;const match=results[cursor];await editor.revealText(match.id,match.pageIndex);status.textContent=`Match ${cursor+1} of ${results.length}, page ${match.pageIndex+1}. Matching text region focused.`;}
  button('Previous match',()=>navigate(-1));button('Next match',()=>navigate(1));
  async function replace(all){if(!results.length){await search();if(!results.length)return;}const matches=all?results:[results[Math.max(0,cursor)]];const count=await editor.replaceTextRanges(matches,replacement.value);await search();status.textContent=`${count} replacements applied. ${results.length} matches remain.`;}
  button('Replace',()=>replace(false));button('Replace all',()=>replace(true));
  for(const field of [query,matchCase,wholeWord])field.addEventListener('input',invalidate);
  panel.append(summary,fields,status);invalidate();return panel;
}
