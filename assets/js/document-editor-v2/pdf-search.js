import {findMatches} from './find-replace.js';
export function pdfSearch(editor){
  const panel=document.createElement('details'),summary=document.createElement('summary'),fields=document.createElement('div'),status=document.createElement('p');
  panel.className='document-v2-search document-v2-pdf-search';summary.textContent='Find and replace PDF text';fields.className='document-v2-replace-fields';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  function input(label,type='text',parent=fields){const wrapper=document.createElement('label'),field=document.createElement(type==='multiline'?'textarea':'input');if(type==='multiline')field.rows=2;else field.type=type;wrapper.append(label+' ',field);parent.append(wrapper);return field;}
  const query=input('Find'),replacement=input('Replace with','multiline');
  query.placeholder='Text to find';replacement.placeholder='New text (leave empty to delete)';
  const actions=document.createElement('div');actions.className='document-v2-replace-actions';
  const preview=document.createElement('p');preview.className='document-v2-match-preview';preview.hidden=true;
  const options=document.createElement('details'),optionsSummary=document.createElement('summary'),optionsFields=document.createElement('div');optionsSummary.textContent='Options';options.append(optionsSummary,optionsFields);
  const matchCase=input('Match case','checkbox',optionsFields),wholeWord=input('Whole word','checkbox',optionsFields);
  let results=[],cursor=-1,busy=false,dirty=true;
  const buttons=[];
  function sync(){for(const field of [query,replacement,matchCase,wholeWord])field.disabled=busy;for(const button of buttons)button.disabled=busy||!query.value||(button.dataset.needsMatch==='true'&&(dirty||!results.length));prev.hidden=next.hidden=results.length<2||dirty;}
  function invalidate(){results=[];cursor=-1;dirty=true;preview.hidden=true;status.textContent=query.value?'Tap Search to find matching text.':'Enter text to find. Leave Replace with empty to delete it.';sync();}
  async function run(action){if(busy)return;busy=true;sync();try{await action();}catch(error){status.textContent=error.code==='LAYOUT_COLLISION'||error.code==='TEXT_OVERFLOW'?'This PDF region could not be reflowed safely. No replacements were applied. Try editing this paragraph directly.':error.message;}finally{busy=false;sync();}}
  function showMatch(){const match=results[cursor];preview.hidden=!match;if(!match)return;preview.textContent=`Page ${match.pageIndex+1}: ${match.text}`;}
  async function search(reveal=true){
    const entries=await editor.textEntries(),byId=new Map(entries.map(entry=>[entry.id,entry]));
    results=findMatches(entries,query.value,{matchCase:matchCase.checked,wholeWord:wholeWord.checked}).map(match=>({...match,text:byId.get(match.id).text,pageIndex:byId.get(match.id).pageIndex}));
    dirty=false;cursor=results.length?0:-1;
    if(reveal&&results.length)await editor.revealText(results[0].id,results[0].pageIndex);
    showMatch();status.textContent=results.length?`${results.length} matches. Match 1 of ${results.length}.`:'No matches in editable PDF text. For scanned text, run OCR and use scanned-page search.';
  }
  function button(label,action,parent,needsMatch=false){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.needsMatch=String(needsMatch);button.addEventListener('click',()=>run(action));parent.append(button);buttons.push(button);return button;}
  const searchButton=button('Search',()=>search(),actions);
  async function navigate(direction){if(dirty||!results.length){await search();return;}cursor=(cursor+direction+results.length)%results.length;const match=results[cursor];await editor.revealText(match.id,match.pageIndex);showMatch();status.textContent=`Match ${cursor+1} of ${results.length}, page ${match.pageIndex+1}.`;}
  async function replace(all){if(dirty)await search(false);if(!results.length)return;const matches=all?results:[results[Math.max(0,cursor)]],count=await editor.replaceTextRanges(matches,replacement.value);await search(false);status.textContent=`${count} replacements applied. ${results.length} matches remain. You can Undo or Download copy.`;}
  const replaceButton=button('Replace',()=>replace(false),actions,true);replaceButton.className='primary';
  const navigation=document.createElement('div');navigation.className='document-v2-replace-actions';
  const prev=button('Previous match',()=>navigate(-1),navigation,true),next=button('Next match',()=>navigate(1),navigation,true);
  button('Replace all',()=>replace(true),optionsFields,true);
  query.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();searchButton.click();}});
  replacement.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();replaceButton.click();}});
  for(const field of [query,matchCase,wholeWord])field.addEventListener('input',invalidate);
  panel.append(summary,fields,actions,status,preview,navigation,options);invalidate();return panel;
}
