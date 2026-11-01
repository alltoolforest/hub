import {fragmentWordParagraph} from './word-paragraph-fragments.js';
import {captureLayoutSelection} from './word-layout-selection.js';
import {fragmentWordTable} from './word-table-fragments.js';
// Preserve editing nodes/listeners; position whole paragraphs/tables in authored
// unequal tracks. Oversized blocks remain visible rather than being clipped.
export function paginateUnequalWord(host,page,geometry){
 const columns=geometry.columnWidths,width=geometry.width-geometry.left-geometry.right,height=geometry.height-geometry.top-geometry.bottom,scale=96/72,gap=32,stride=(width+gap)*scale;
 const viewport=document.createElement('div'),controls=document.createElement('div'),label=document.createElement('span');viewport.className='document-v2-word-pages';viewport.style.cssText='overflow-x:auto;padding:16px';controls.className='document-v2-actions';label.setAttribute('role','status');const previous=document.createElement('button'),next=document.createElement('button');previous.textContent='Previous page';next.textContent='Next page';previous.type=next.type='button';controls.append(previous,next,label);page.style.cssText=`position:relative;width:${width}pt;max-width:none;height:${height}pt;min-height:0;padding:0;margin:0`;viewport.append(page);host.append(controls,viewport);
 let frame=0,disposed=false,count=1,painting=false,composing=false,tableFragments=[];const slots=[];let x=0;for(const col of columns){slots.push({x,width:col.width});x+=col.width+col.gap;}
 function blocks(parent){return [...parent.children].flatMap(n=>{if(n.classList.contains('document-v2-word-flow')||n.classList.contains('document-v2-continuous-section')){n.style.display='block';return blocks(n);}if(n.children.length&&[...n.children].every(child=>child.matches('[data-word-source][data-word-part]'))){n.style.display='contents';return [...n.children];}return [n];});}
 function update(){
  frame=0;if(disposed||composing)return;const restoreSelection=captureLayoutSelection(page);painting=true;observer.disconnect();for(const item of tableFragments)item.restore();tableFragments=[];
  let sheet=0,lastSheet=0,column=0,y=0,tall=false,maxHeight=height*scale;
  const advance=()=>{column++;if(column===slots.length){column=0;sheet++;}y=0;},slot=()=>slots[column];
  function size(block){block.style.position='absolute';block.style.maxWidth='none';const paragraph=block.matches('[data-word-source],[data-word-layout-fragment]');if(!paragraph)block.style.marginLeft=block.style.marginRight='0';const css=getComputedStyle(block),left=parseFloat(css.marginLeft)||0,right=parseFloat(css.marginRight)||0;block.style.width=Math.max(1,slot().width-(left+right)/scale)+'pt';return block.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);}
  function place(block,advanceTall=true){const h=size(block);lastSheet=sheet;block.style.left=(sheet*stride+slot().x*scale)+'px';block.style.top=y+'px';y+=h;if(h>height*scale){tall=true;maxHeight=Math.max(maxHeight,h);if(advanceTall)advance();}}
  for(const block of blocks(page)){
   if(block.style.display==='contents'){block.style.display='block';for(const image of block.querySelectorAll('img'))image.style.float='none';}
   let h=size(block);const forced=block.style.breakBefore==='column'||block.querySelector('[style*="break-before: column"]');
   if(forced&&y>0)advance();
   if(h>height*scale-y+.5&&block.tagName!=='TABLE'){const result=fragmentWordParagraph(block,{columns:slots.map((_,i)=>slots[(column+i)%slots.length].width),height:height*scale,remaining:Math.max(0,height*scale-y),advance,place:b=>place(b,false)});if(result){tableFragments.push(result);continue;}}
   if(block.tagName==='TABLE'&&h>height*scale-y+.5){
    if(y>0){advance();h=size(block);}
    if(h>height*scale){const result=fragmentWordTable(block,{remaining:()=>height*scale-y,advance,width:()=>slot().width,place:t=>place(t,false)});if(result){tableFragments.push(result);continue;}}
   }
   if(y>0&&y+h>height*scale+.5)advance();place(block);
  }
  count=Math.max(1,lastSheet+1);page.style.height=maxHeight+'px';page.style.width=(count*stride-gap*scale)+'px';const current=Math.min(count,Math.max(1,Math.round(viewport.scrollLeft/stride)+1));label.textContent=`Preview page ${current} of ${count} · unequal columns${tall?' · oversized indivisible block shown whole':''}`;previous.disabled=current===1;next.disabled=current===count;restoreSelection();painting=false;observer.observe(page,{childList:true,subtree:true,characterData:true,attributes:true});
 }
 function schedule(){if(!disposed&&!painting&&!composing&&!frame)frame=requestAnimationFrame(update);}const observer=new MutationObserver(schedule);observer.observe(page,{childList:true,subtree:true,characterData:true,attributes:true});const resize=new ResizeObserver(schedule);resize.observe(viewport);previous.onclick=()=>viewport.scrollBy({left:-stride,behavior:'smooth'});next.onclick=()=>viewport.scrollBy({left:stride,behavior:'smooth'});viewport.addEventListener('scroll',schedule);const compositionStart=()=>{composing=true;},compositionEnd=()=>{composing=false;schedule();};page.addEventListener('compositionstart',compositionStart);page.addEventListener('compositionend',compositionEnd);page.addEventListener('input',schedule);page.addEventListener('load',schedule,true);document.fonts?.ready.then(schedule);schedule();return()=>{disposed=true;observer.disconnect();for(const item of tableFragments)item.restore();tableFragments=[];disposed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();viewport.removeEventListener('scroll',schedule);page.removeEventListener('compositionstart',compositionStart);page.removeEventListener('compositionend',compositionEnd);page.removeEventListener('input',schedule);page.removeEventListener('load',schedule,true);};
}
export function validUnequalColumns(g){const cols=g.columnWidths,available=g.width-g.left-g.right;return g.equalWidth===false&&Array.isArray(cols)&&cols.length>=1&&cols.length<=6&&cols.every(c=>Number.isFinite(c.width)&&c.width>=36&&Number.isFinite(c.gap)&&c.gap>=0)&&Math.abs(cols.reduce((sum,c,i)=>sum+c.width+(i<cols.length-1?c.gap:0),0)-available)<1;}
