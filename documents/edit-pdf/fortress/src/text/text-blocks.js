import { clusterVisualRuns } from './spatial-clusterer.js';
import { blockId } from '../utils/ids.js';

function inferJoin(prev,cur){
  const right=prev.x+prev.width; const gap=cur.x-right; const size=Math.max(prev.fontSize,cur.fontSize,1);
  if(/^\s/.test(cur.text)||/\s$/.test(prev.text)) return '';
  return gap>size*0.23?' ':'';
}
function finalizeLine(line){
  let text='';
  for(let i=0;i<line.runs.length;i++){if(i)text+=inferJoin(line.runs[i-1],line.runs[i]);text+=line.runs[i].text;}
  const minX=Math.min(...line.runs.map(r=>r.x)); const maxX=Math.max(...line.runs.map(r=>r.x+r.width)); const size=Math.max(...line.runs.map(r=>r.fontSize));
  return {text,y:line.y,minX,maxX,fontSize:size,fontName:line.runs[0]?.fontName,runs:line.runs};
}
export function buildLogicalBlocks(items,{pageIndex=0,pageRotation=0}={}){
  const lineObjs=clusterVisualRuns(items).map(finalizeLine); const groups=[]; let cur=null; let prev=null;
  for(const line of lineObjs){
    const pitch=prev?prev.y-line.y:null; const leftDelta=prev?Math.abs(prev.minX-line.minX):Infinity; const size=line.fontSize||12;
    const compatible=cur&&pitch>0&&pitch<size*1.8&&leftDelta<size*2.5&&Math.abs((prev?.fontSize||size)-size)<size*0.28;
    if(compatible) cur.lines.push(line); else {cur={lines:[line]};groups.push(cur);} prev=line;
  }
  return groups.map((g,i)=>{
    const minX=Math.min(...g.lines.map(l=>l.minX)); const maxX=Math.max(...g.lines.map(l=>l.maxX)); const maxSize=Math.max(...g.lines.map(l=>l.fontSize));
    const top=Math.max(...g.lines.map(l=>l.y))+maxSize*0.85; const bottom=Math.min(...g.lines.map(l=>l.y))-maxSize*0.3;
    return {id:blockId(pageIndex,i),pageIndex,pageRotation,text:g.lines.map(l=>l.text).join('\n'),lines:g.lines,fontSize:maxSize,bounds:{x:minX,y:bottom,width:maxX-minX,height:top-bottom},tier:'LIMITED_EDIT',confidence:0,reason:'SOURCE_NOT_MAPPED',sourceRuns:[]};
  });
}
