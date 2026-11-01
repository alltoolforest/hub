import {sliceParagraphContents} from './word-paragraph-slice.js';
import {createParagraphMeasurer,planParagraphFlow} from './word-paragraph-flow.js';
// Visual fragments remain inside one logical editable field. Model offsets,
// event listeners and export paragraph boundaries therefore remain unchanged.
export function fragmentWordParagraph(block,{columns,height,remaining,advance,place}){
 const field=block.matches('[data-word-source][data-word-part]')?block:block.children.length===1?block.firstElementChild:null;
 if(!field?.matches('[data-word-source][data-word-part]')||!field.textContent||field.style.breakInside==='avoid'||field.querySelector('img,table,br,input,svg,canvas'))return null;
 const doc=field.ownerDocument,css=doc.defaultView.getComputedStyle(field),left=parseFloat(css.marginLeft)||0,right=parseFloat(css.marginRight)||0,before=parseFloat(css.marginTop)||0,after=parseFloat(css.marginBottom)||0,length=field.textContent.length;let measure,plan;
 try{measure=createParagraphMeasurer(field);plan=planParagraphFlow(field.textContent,{columns,height,firstRemaining:remaining,measure:(start,end,width)=>measure.measure(start,end,Math.max(1,width-(left+right)*.75))+(start===0?before:0)+(end===length?after:0)});}catch{return null;}finally{measure?.dispose();}
 if(!plan.complete||plan.fragments.length<2)return null;
 const fragments=plan.fragments.map(part=>{const span=doc.createElement('span');span.className=field.className;span.style.cssText=field.style.cssText;span.dataset.wordLayoutFragment='';span.style.display='block';span.style.marginTop=part.start?'0':before+'px';span.style.marginBottom=part.end===length?after+'px':'0';if(part.start)span.style.textIndent='0';span.append(sliceParagraphContents(field,part.start,part.end));return span;});
 const fieldStyles=Object.fromEntries(['display','position','height','minHeight','margin'].map(key=>[key,field.style[key]])),blockDisplay=block.style.display;
 field.replaceChildren(...fragments);block.style.display='contents';Object.assign(field.style,{display:'block',position:'static',height:'0',minHeight:'0',margin:'0'});
 let track=0;
 for(const [index,part] of plan.fragments.entries()){const target=part.page*columns.length+part.column;while(track<target){advance();track++;}place(fragments[index]);}
 let restored=false;
 return {restore(){if(restored)return;restored=true;for(const fragment of [...field.children])if(fragment.hasAttribute('data-word-layout-fragment'))fragment.replaceWith(...fragment.childNodes);Object.assign(field.style,fieldStyles);if(block!==field)block.style.display=blockDisplay;}};
}
