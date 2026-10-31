import {paginateUnequalWord,validUnequalColumns} from './word-unequal-columns.js';
// Browser layout is an editing preview. Word performs final layout at export.
// CSS fragmentation lets growing/shrinking paragraphs flow without duplicating
// editable nodes or rewriting the user's selection on every keystroke.
export function paginateWord(host,page,geometry){
  if(validUnequalColumns(geometry))return paginateUnequalWord(host,page,geometry);
  const width=Math.max(144,geometry.width-geometry.left-geometry.right),height=Math.max(144,geometry.height-geometry.top-geometry.bottom),gap=geometry.columns>1?Math.max(0,geometry.columnGap||0):Math.max(32,geometry.left+geometry.right),columns=Math.max(1,Math.min(6,geometry.columns||1));
  const viewport=document.createElement('div');viewport.className='document-v2-word-pages';viewport.style.overflowX='auto';viewport.style.padding='16px';viewport.setAttribute('aria-label','Word page preview');
  page.style.width=width+'pt';page.style.maxWidth='none';page.style.height=height+'pt';page.style.minHeight='0';page.style.padding='0';page.style.margin='0';page.style.columnWidth=((width-(columns-1)*gap)/columns)+'pt';page.style.columnGap=gap+'pt';page.style.columnFill='auto';page.style.overflow='visible';
  const controls=document.createElement('div');controls.className='document-v2-actions';const label=document.createElement('span');label.setAttribute('role','status');let count=1,frame=0,disposed=false;
  const stride=()=> (width+gap)*96/72;
  function update(){frame=0;if(disposed)return;count=Math.max(1,Math.ceil((page.scrollWidth+gap*96/72)/stride()));const current=Math.min(count,Math.max(1,Math.round(viewport.scrollLeft/stride())+1));label.textContent=`Preview page ${current} of ${count} · browser pagination`;previous.disabled=current<=1;next.disabled=current>=count;}
  function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(update);}
  function button(text,direction){const node=document.createElement('button');node.type='button';node.textContent=text;node.addEventListener('click',()=>viewport.scrollBy({left:stride()*direction,behavior:'smooth'}));controls.append(node);return node;}
  const previous=button('Previous page',-1),next=button('Next page',1);controls.append(label);
  viewport.append(page);host.append(controls,viewport);viewport.addEventListener('scroll',schedule);page.addEventListener('input',schedule);
  const observer=new MutationObserver(schedule);observer.observe(page,{childList:true,subtree:true,characterData:true,attributes:true});
  const resize=new ResizeObserver(schedule);resize.observe(viewport);document.fonts?.ready.then(schedule);schedule();
  return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();viewport.removeEventListener('scroll',schedule);page.removeEventListener('input',schedule);};
}
