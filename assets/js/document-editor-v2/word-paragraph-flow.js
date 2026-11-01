import {sliceParagraphContents} from './word-paragraph-slice.js';
// A view-only plan. Offsets always address the original UTF-16 paragraph;
// whitespace and formatting boundaries must never be rewritten for pagination.
export function planParagraphFlow(text,{columns,height,firstRemaining=height,measure,maxFragments=4096}){
 if(typeof text!=='string'||text.length>1_000_000||!Array.isArray(columns)||!columns.length||columns.length>6||columns.some(w=>!Number.isFinite(w)||w<=0)||!Number.isFinite(height)||height<=0||!Number.isFinite(firstRemaining)||firstRemaining<0||firstRemaining>height||typeof measure!=='function'||!Number.isInteger(maxFragments)||maxFragments<1||maxFragments>4096)throw new Error('Invalid paragraph flow geometry.');
 const boundaries=[0];if(typeof Intl.Segmenter==='function'){for(const part of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text))boundaries.push(part.index+part.segment.length);}else{for(let i=0;i<text.length;){const code=text.codePointAt(i);i+=code>65535?2:1;boundaries.push(i);}}
 const fragments=[];let start=0,startIndex=0,track=0,available=firstRemaining;
 while(start<text.length){
  if(fragments.length>=maxFragments||track>=maxFragments*2)throw new Error('Paragraph flow exceeds the fragment budget.');
  const width=columns[track%columns.length];let lo=startIndex+1,hi=boundaries.length-1,best=start,bestIndex=startIndex,bestHeight=0;
  while(lo<=hi){const mid=Math.floor((lo+hi)/2),end=boundaries[mid],h=measure(start,end,width);if(!Number.isFinite(h)||h<0)throw new Error('Paragraph measurement failed.');if(h<=available+.01){best=end;bestIndex=mid;bestHeight=h;lo=mid+1;}else hi=mid-1;}
  if(best===start){if(available<height){track++;available=height;continue;}return {fragments,complete:false,reason:'LINE_EXCEEDS_COLUMN_HEIGHT',remainingStart:start};}
  // Prefer a word boundary without discarding spaces. A long word still flows
  // at a grapheme boundary rather than looping or dropping its tail.
  if(best<text.length){let preferred=best;for(let i=bestIndex;i>startIndex;i--){const end=boundaries[i];if(/\s$/u.test(text.slice(boundaries[i-1],end))){preferred=end;bestIndex=i;break;}}if(preferred!==best){best=preferred;bestHeight=measure(start,best,width);}}
  fragments.push({start,end:best,column:track%columns.length,page:Math.floor(track/columns.length),width,height:bestHeight,available});start=best;startIndex=bestIndex;track++;available=height;
 }
 return {fragments,complete:true};
}

// Measure formatted source ranges in an inert offscreen surface. No editable
// nodes are moved, and the original paragraph and selection remain untouched.
export function createParagraphMeasurer(field){
 const doc=field.ownerDocument,textNodes=[],walker=doc.createTreeWalker(field,4);let node,length=0;
 while((node=walker.nextNode())){textNodes.push({node,start:length,end:length+node.length});length+=node.length;}
 if(textNodes.length>20000||field.querySelector('img,table,input,textarea,svg,canvas'))throw new Error('Paragraph contains objects requiring grouped layout.');
 const probe=field.cloneNode(false);probe.removeAttribute('id');for(const attr of [...probe.attributes])if(attr.name.startsWith('data-word-')||attr.name==='contenteditable')probe.removeAttribute(attr.name);probe.inert=true;probe.setAttribute('aria-hidden','true');Object.assign(probe.style,{position:'fixed',left:'-100000px',top:'0',visibility:'hidden',pointerEvents:'none',maxWidth:'none',height:'auto',minHeight:'0',margin:'0'});const computed=doc.defaultView.getComputedStyle(field);for(const property of ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','white-space','overflow-wrap','word-break','text-align','text-indent','box-sizing','padding-top','padding-bottom','padding-left','padding-right'])probe.style.setProperty(property,computed.getPropertyValue(property));doc.body.append(probe);let disposed=false;

 return {measure(start,end,width){if(disposed||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>length||!Number.isFinite(width)||width<=0)throw new Error('Invalid paragraph measurement range.');if(start===end)return 0;probe.replaceChildren(sliceParagraphContents(field,start,end));probe.style.width=width+'pt';if(start)probe.style.textIndent='0';else probe.style.textIndent=computed.textIndent;return probe.getBoundingClientRect().height;},dispose(){disposed=true;probe.remove();}};
}
