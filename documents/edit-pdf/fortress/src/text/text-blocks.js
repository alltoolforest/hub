import { clusterVisualRuns } from './spatial-clusterer.js';
import { blockId } from '../utils/ids.js';

function inferJoin(prev,cur){
  const right=prev.x+prev.width;
  const gap=cur.x-right;
  const size=Math.max(prev.fontSize,cur.fontSize,1);
  if(/^\s/.test(cur.text)||/\s$/.test(prev.text))return '';
  return gap>size*0.23?' ':'';
}

function finalizeLine(line){
  let text='';
  for(let i=0;i<line.runs.length;i++){
    if(i)text+=inferJoin(line.runs[i-1],line.runs[i]);
    text+=line.runs[i].text;
  }
  const minX=Math.min(...line.runs.map(r=>r.x));
  const maxX=Math.max(...line.runs.map(r=>r.x+r.width));
  const size=Math.max(...line.runs.map(r=>r.fontSize));
  const descent=Math.max(size*0.24,1.5);
  const ascent=Math.max(size*0.86,2);
  return {
    text,
    y:line.y,
    minX,
    maxX,
    fontSize:size,
    fontName:line.runs[0]?.fontName,
    runs:line.runs,
    bounds:{x:minX,y:line.y-descent,width:Math.max(maxX-minX,1),height:ascent+descent},
  };
}

/**
 * The editor intentionally uses one visual line/cell per logical block.
 * Word-generated PDFs frequently split one visible paragraph across many
 * independently positioned PDF text objects. Treating the whole paragraph as
 * one atomic mapping makes an otherwise editable paragraph fail when only one
 * line uses a different font/encoding. Line granularity lets users click the
 * exact visible text they want, while keeping each export transaction bounded.
 */
export function buildLogicalBlocks(items,{pageIndex=0,pageRotation=0}={}){
  const lines=clusterVisualRuns(items).map(finalizeLine).filter(line=>line.text.trim().length>0);
  return lines.map((line,i)=>({
    id:blockId(pageIndex,i),
    pageIndex,
    pageRotation,
    text:line.text,
    lines:[line],
    fontSize:line.fontSize,
    fontName:line.fontName,
    bounds:line.bounds,
    tier:'LIMITED_EDIT',
    confidence:0,
    reason:'SOURCE_NOT_MAPPED',
    sourceRuns:[],
    sourceLines:[],
  }));
}
