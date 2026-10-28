import {canStructure,structureParts,structureText,sliceRuns,formatAt,restoreStructures} from './word-structure.js';
import {hasWordPageBreakBefore,validateWordFormat} from './word-format.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Validate the entire selection before changing any source paragraph. Source
// indexes remain stable: consumed paragraphs export as zero structural parts.
function rangeTargets(model,start,end){
  const all=[...model.xml.getElementsByTagNameNS(W,'p')];
  for(const point of [start,end]){
    if(!point||![point.index,point.part,point.offset].every(Number.isInteger)||point.index<0||point.part<0||point.offset<0||!canStructure(model,point.index))throw new Error('Select ordinary editable paragraphs within one text section.');
    const part=structureParts(model,point.index)[point.part];
    if(!part||point.offset>structureText(part).length)throw new Error('The paragraph selection changed. Select the text again.');
  }
  if(start.index>end.index||start.index===end.index&&(start.part>end.part||start.part===end.part&&start.offset>end.offset))throw new Error('Invalid paragraph selection order.');
  const first=all[start.index],last=all[end.index],indexes=[];
  if(first.parentNode!==last.parentNode)throw new Error('Selections across table cells or document sections are protected.');
  for(let paragraph=first;;paragraph=paragraph.nextElementSibling){
    const index=all.indexOf(paragraph);
    if(!paragraph||index<0||!canStructure(model,index)||paragraph!==first&&hasWordPageBreakBefore(paragraph))throw new Error('Selections across tables, protected content or explicit page breaks are not supported.');
    indexes.push(index);if(paragraph===last)break;
  }
  return indexes;
}
export function replaceWordRange(model,start,end,replacement,{splitLines=true,richParts=null}={}){
  if(typeof replacement!=='string'||replacement.length>1_000_000)throw new Error('The replacement is too large.');
  const indexes=rangeTargets(model,start,end);
  const left=structuredClone(structureParts(model,start.index)),right=structuredClone(structureParts(model,end.index));
  const prefix=sliceRuns(left[start.part].runs,0,start.offset),suffix=sliceRuns(right[end.part].runs,end.offset,structureText(right[end.part]).length);
  const format=formatAt(model,start.index,left[start.part].runs,start.offset);
  const moved=run=>({...run,origin:run.origin??end.index,format:run.format||model.formatting.formats[run.origin??end.index].runs[run.source]||model.formatting.formats[run.origin??end.index].base});
  const lines=richParts?richParts.map(part=>part.runs.map(run=>run.text).join('')):splitLines?replacement.replace(/\r\n?/g,'\n').split('\n'):[replacement];
  if(lines.length>10000)throw new Error('The replacement contains too many paragraphs.');
  const inserted=richParts?richParts.map(part=>({runs:part.runs.map(run=>({text:run.text,source:0,format:validateWordFormat(run.format)}))})):lines.map(text=>({runs:[{text,source:0,format}]}));
  if(inserted.length!==lines.length||inserted.some((part,i)=>part.runs.map(run=>run.text).join('')!==lines[i]))throw new Error('Invalid rich clipboard paragraphs.');
  inserted[0].runs.unshift(...prefix);inserted.at(-1).runs.push(...suffix.map(moved));
  const remaining=right.slice(end.part+1).map(part=>({runs:part.runs.map(moved)}));
  const next=[...left.slice(0,start.part),...inserted,...remaining];
  const structures={...model.structures,[start.index]:next};
  for(const index of indexes.slice(1))structures[index]=[];
  model.structures=restoreStructures(model,structures);
  return {indexes,index:start.index,part:start.part+inserted.length-1,offset:(inserted.length===1?start.offset:0)+lines.at(-1).length};
}

export function formatWordRange(model,start,end,value){
  const format=validateWordFormat(value),indexes=rangeTargets(model,start,end),structures={...model.structures};
  for(const index of indexes){
    const parts=structuredClone(structureParts(model,index));
    for(const [partIndex,part] of parts.entries()){
      if(index===start.index&&partIndex<start.part||index===end.index&&partIndex>end.part)continue;
      const length=structureText(part).length,from=index===start.index&&partIndex===start.part?start.offset:0,to=index===end.index&&partIndex===end.part?end.offset:length;
      if(to===from)continue;
      part.runs=[...sliceRuns(part.runs,0,from),...sliceRuns(part.runs,from,to).map(run=>({...run,format})),...sliceRuns(part.runs,to,length)];
    }
    structures[index]=parts;
  }
  model.structures=restoreStructures(model,structures);
  return indexes;
}
