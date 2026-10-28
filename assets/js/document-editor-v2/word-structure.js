import {readWordClipboard} from './word-clipboard.js';
import {replaceWordRange} from './word-range.js';
import {paintLayout} from './word-layout.js';
import {validateWordFormat,styleWordNode,writeWordFormat,hasWordPageBreakBefore} from './word-format.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',XML='http://www.w3.org/XML/1998/namespace';
const nodes=model=>[...model.xml.getElementsByTagNameNS(W,'p')];
export function canStructure(model,index){
  const p=nodes(model)[index];
  return !!p&&!model.protected[index]&&![...p.getElementsByTagNameNS(W,'sectPr'),...p.getElementsByTagNameNS(W,'numPr')].length&&[...p.children].every(n=>n.namespaceURI===W&&(n.localName==='pPr'||n.localName==='r'&&[...n.children].every(c=>c.namespaceURI===W&&['rPr','t'].includes(c.localName))));
}
export function structureParts(model,index){
  return model.structures?.[index]||[{runs:model.runs[index].map((text,source)=>({text,source,format:model.overrides[index]||null}))}];
}
const textOf=part=>part.runs.map(run=>run.text).join('');
export function sliceRuns(runs,start,end){let at=0;const result=[];for(const run of runs){const from=at;at+=run.text.length;const text=run.text.slice(Math.max(0,start-from),Math.max(0,Math.min(run.text.length,end-from)));if(text)result.push({...run,text});}return result;}
export function formatAt(model,index,runs,offset){let at=0;const run=runs.find(r=>(at+=r.text.length)>=offset)||runs.at(-1);return run?.format||model.formatting.formats[run?.origin??index].runs[run?.source]||model.formatting.formats[index].base;}
export function replaceStructure(model,index,partIndex,start,end,value){
  const parts=structuredClone(structureParts(model,index)),part=parts[partIndex],length=part&&textOf(part).length;
  if(!part||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>length)throw new Error('Invalid paragraph selection.');
  let at=0;const nearby=part.runs.find(run=>(at+=run.text.length)>=start)||part.runs.at(-1)||{source:0,format:null};
  part.runs=[...sliceRuns(part.runs,0,start),{...nearby,text:value},...sliceRuns(part.runs,end,length)];
  model.structures[index]=parts;
}
export function restoreStructures(model,value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid paragraph structure draft.');
  const result={};let total=0;
  for(const [key,parts] of Object.entries(value)){
    const index=Number(key);if(!Number.isInteger(index)||!canStructure(model,index)||!Array.isArray(parts)||parts.length>10000)throw new Error('Invalid paragraph structure target.');
    result[index]=parts.map(part=>{if(!Array.isArray(part.runs)||part.runs.length>10000)throw new Error('Invalid paragraph runs.');return {runs:part.runs.map(run=>{
      if(typeof run.text!=='string'||!Number.isInteger(run.source)||run.source<0||!Number.isInteger(run.origin??index)||!canStructure(model,run.origin??index)||nodes(model)[run.origin??index].parentNode!==nodes(model)[index].parentNode||run.source>=Math.max(1,model.runs[run.origin??index].length)||(total+=run.text.length)>10_000_000)throw new Error('Invalid paragraph run.');
      return {text:run.text,source:run.source,...(run.origin===undefined?{}:{origin:run.origin}),format:run.format?validateWordFormat(run.format):null};
    })};});
  }
  return result;
}
export function writeStructures(model,xml,all){
  for(const [key,parts] of Object.entries(model.structures||{})){
    const index=Number(key),original=all[index],templates=[...nodes(model)[index].getElementsByTagNameNS(W,'t')].map(t=>t.parentNode);
    for(const [partIndex,part] of parts.entries()){
      const paragraph=original.cloneNode(false),pPr=[...original.children].find(n=>n.localName==='pPr');
      if(pPr){const properties=pPr.cloneNode(true);if(partIndex)for(const br of [...properties.getElementsByTagNameNS(W,'pageBreakBefore')])br.remove();paragraph.append(properties);}
      for(const item of part.runs){
        const sourceTemplates=item.origin===undefined?templates:[...nodes(model)[item.origin].getElementsByTagNameNS(W,'t')].map(t=>t.parentNode);
        const run=sourceTemplates[item.source]?.cloneNode(true)||xml.createElementNS(W,'w:r');for(const child of [...run.children])if(child.localName!=='rPr')child.remove();
        if(item.format)writeWordFormat(xml,run,item.format);
        for(const piece of item.text.split(/([\n\t])/)){const node=xml.createElementNS(W,piece==='\n'?'w:br':piece==='\t'?'w:tab':'w:t');if(node.localName==='t'){node.textContent=piece;node.setAttributeNS(XML,'xml:space','preserve');}run.append(node);}paragraph.append(run);
      }
      original.parentNode.insertBefore(paragraph,original);
    }
    original.remove();
  }
}
export function mountStructure({model,index,container,formatting,onChange,register,onBoundary=()=>{},onStatus=()=>{}}){
  const fields=[];
  function selection(field){const s=window.getSelection();if(!s?.rangeCount)return null;const r=s.getRangeAt(0);if(!field.contains(r.startContainer)||!field.contains(r.endContainer))return null;const prefix=r.cloneRange();prefix.selectNodeContents(field);prefix.setEnd(r.startContainer,r.startOffset);return {start:prefix.toString().length,end:prefix.toString().length+r.toString().length};}
  function focus(part,offset){const field=fields[part];if(!field)return;field.focus();const walker=document.createTreeWalker(field,4),range=document.createRange();let node;while((node=walker.nextNode())){if(offset<=node.length){range.setStart(node,offset);break;}offset-=node.length;}if(!node){range.selectNodeContents(field);range.collapse(false);}else range.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(range);}
  function save(parts,part,offset){model.structures[index]=parts;render();onChange();focus(part,offset);}
  function render(){
    container.replaceChildren();fields.length=0;
    structureParts(model,index).forEach((part,partIndex)=>{
      const field=document.createElement('div');field.className='document-v2-paragraph';field.contentEditable='true';field.setAttribute('role','textbox');field.setAttribute('aria-multiline','true');field.setAttribute('aria-label',`Paragraph ${index+1}, part ${partIndex+1}`);
      field.dataset.wordSource=String(index);field.dataset.wordPart=String(partIndex);field.tabIndex=0;
      const paint=()=>{field.replaceChildren();const current=structureParts(model,index)[partIndex];if(!current)return;styleWordNode(field,formatAt(model,index,current.runs,0));paintLayout(field,model.layouts[index]||model.formatting.formats[index].layout);for(const run of current.runs){const span=document.createElement('span');span.textContent=run.text;styleWordNode(span,run.format||model.formatting.formats[run.origin??index].runs[run.source]||model.formatting.formats[index].base);field.append(span);}};paint();
      function activate(){
        const selected=window.getSelection();
        if(selected?.rangeCount&&!selected.isCollapsed){const range=selected.getRangeAt(0);if(!field.contains(range.startContainer)||!field.contains(range.endContainer))return;}
        const range=selection(field)||{start:0,end:0};const current=structureParts(model,index)[partIndex];formatting.activate({apply:format=>{
        const parts=structuredClone(structureParts(model,index)),p=parts[partIndex],length=textOf(p).length;
        const start=range.start===range.end?0:range.start,end=range.start===range.end?length:range.end;
        p.runs=[...sliceRuns(p.runs,0,start),...sliceRuns(p.runs,start,end).map(run=>({...run,format})),...sliceRuns(p.runs,end,length)];if(!p.runs.length)p.runs=[{text:'',source:0,format}];model.structures[index]=parts;paint();
      }},formatAt(model,index,current.runs,range.start));}
      for(const event of ['focus','mouseup','keyup'])field.addEventListener(event,activate);
      field.addEventListener('beforeinput',event=>{
        const range=selection(field);if(!range)return;const parts=structuredClone(structureParts(model,index)),p=parts[partIndex],length=textOf(p).length;
        if(event.inputType==='insertParagraph'){
          event.preventDefault();const inherited={text:'',source:0,format:formatAt(model,index,p.runs,range.start)};
          const left=sliceRuns(p.runs,0,range.start),right=sliceRuns(p.runs,range.end,length);parts.splice(partIndex,1,{runs:left.length?left:[inherited]},{runs:right.length?right:[inherited]});save(parts,partIndex+1,0);
        }else if(range.start===range.end&&event.inputType==='deleteContentBackward'&&range.start===0&&partIndex>0){
          event.preventDefault();const before=textOf(parts[partIndex-1]).length;parts[partIndex-1].runs.push(...p.runs);parts.splice(partIndex,1);save(parts,partIndex-1,before);
        }else if(range.start===range.end&&event.inputType==='deleteContentForward'&&range.end===length&&partIndex<parts.length-1){
          event.preventDefault();p.runs.push(...parts[partIndex+1].runs);parts.splice(partIndex+1,1);save(parts,partIndex,length);
        }else if(range.start===range.end&&((event.inputType==='deleteContentBackward'&&range.start===0&&partIndex===0)||(event.inputType==='deleteContentForward'&&range.end===length&&partIndex===parts.length-1))){event.preventDefault();onBoundary(index,event.inputType==='deleteContentBackward'?-1:1);
        }else if(event.inputType==='insertLineBreak'){event.preventDefault();replaceStructure(model,index,partIndex,range.start,range.end,'\n');render();onChange();focus(partIndex,range.start+1);}
      });
      field.addEventListener('input',()=>{
        const old=textOf(structureParts(model,index)[partIndex]),next=field.textContent;let start=0,end=old.length,nextEnd=next.length;while(start<end&&start<nextEnd&&old[start]===next[start])start++;while(end>start&&nextEnd>start&&old[end-1]===next[nextEnd-1]){end--;nextEnd--;}
        replaceStructure(model,index,partIndex,start,end,next.slice(start,nextEnd));onChange();
      });
      field.addEventListener('paste',event=>{event.preventDefault();const range=selection(field);if(!range)return;let rich;try{rich=readWordClipboard(event.clipboardData.getData('text/html')||'',event.clipboardData.getData('text/plain'),formatAt(model,index,structureParts(model,index)[partIndex].runs,range.start));}catch(error){onStatus(error.message);return;}
        if(rich){const text=rich.map(p=>p.runs.map(r=>r.text).join('')).join('\n');const result=replaceWordRange(model,{index,part:partIndex,offset:range.start},{index,part:partIndex,offset:range.end},text,{richParts:rich});render();onChange();focus(result.part,result.offset);return;}
        const text=event.clipboardData.getData('text/plain').replace(/\r\n?/g,'\n'),lines=text.split('\n');
        if(lines.length===1){replaceStructure(model,index,partIndex,range.start,range.end,text);render();onChange();focus(partIndex,range.start+text.length);}
        else{const parts=structuredClone(structureParts(model,index)),current=parts[partIndex],format=formatAt(model,index,current.runs,range.start),prefix=sliceRuns(current.runs,0,range.start),suffix=sliceRuns(current.runs,range.end,textOf(current).length);const inserted=lines.map(line=>({runs:[{text:line,source:0,format}]}));inserted[0].runs.unshift(...prefix);inserted.at(-1).runs.push(...suffix);parts.splice(partIndex,1,...inserted);save(parts,partIndex+lines.length-1,lines.at(-1).length);}});field.addEventListener('drop',event=>event.preventDefault());field.addEventListener('blur',()=>{
        const selection=window.getSelection();
        // Focusing the shared host during typing must not replace caret nodes.
        if(selection?.rangeCount){
          if(field.closest('[contenteditable=""]')&&(field.contains(selection.anchorNode)||field.contains(selection.focusNode)))return;
          const range=selection.getRangeAt(0);
          if(!selection.isCollapsed&&(!field.contains(range.startContainer)||!field.contains(range.endContainer)))return;
        }
        paint();
      });
      fields.push(field);container.append(field);register(`${index}:${partIndex}`,field);
    });
  }
  render();return {refresh:render,focus};
}
export const structureText=textOf;

// Merge only ordinary adjacent paragraphs within the same body or table cell.
export function mergeSourceParagraph(model,index,direction){
  const all=nodes(model),p=all[index];if(!canStructure(model,index))return null;
  let sibling=direction<0?p.previousElementSibling:p.nextElementSibling;
  while(sibling && sibling.localName==='p' && model.structures[all.indexOf(sibling)]?.length===0)sibling=direction<0?sibling.previousElementSibling:sibling.nextElementSibling;
  const other=all.indexOf(sibling);if(other<0||!canStructure(model,other))return null;
  const left=direction<0?other:index,right=direction<0?index:other;
  if(hasWordPageBreakBefore(all[right]))return null;
  const a=structuredClone(structureParts(model,left)),b=structuredClone(structureParts(model,right));if(!a.length||!b.length)return null;
  const part=a.length-1,offset=textOf(a[part]).length;
  for(const p of b)for(const run of p.runs){run.origin??=right;run.format??=model.formatting.formats[run.origin].runs[run.source]||model.formatting.formats[run.origin].base;}
  a[part].runs.push(...b[0].runs);a.push(...b.slice(1));model.structures[left]=a;model.structures[right]=[];
  return {left,right,part,offset};
}
