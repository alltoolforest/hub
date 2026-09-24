import { parseContentStream } from '../parser/content-stream-parser.js';
import { interpretTextRuns } from '../text/text-state.js';
import { mappingConfidence, DIRECT_EDIT_THRESHOLD } from './confidence.js';
import { inspectFontResource } from '../fonts/font-inspector.js';
import { classifyFontSupport } from '../fonts/font-support.js';

const norm=(s)=>String(s||'').replace(/\s+/g,' ').trim();
const compact=(s)=>norm(s).replace(/\s+/g,'');
const RECONSTRUCT_THRESHOLD=0.72;

export function extractSourceRunsFromStreams(pdfDoc,pageIndex,streams){
  const fontCache=new Map();
  const fontResolver=(name)=>{
    if(!name)return null;
    if(!fontCache.has(name))fontCache.set(name,inspectFontResource(pdfDoc,pageIndex,name));
    return fontCache.get(name);
  };
  const sourceRuns=[];
  for(const stream of streams){
    const {instructions}=parseContentStream(stream.bytes);
    const runs=interpretTextRuns(instructions,{fontResolver,streamRef:stream.refKey,streamIndex:stream.streamIndex});
    sourceRuns.push(...runs.map((r)=>({...r,operator:instructions[r.operatorIndex]?.op||r.kind,x:r.trm[4],y:r.trm[5]})));
  }
  sourceRuns.sort((a,b)=>Math.abs(b.y-a.y)>1?(b.y-a.y):(a.x-b.x));
  return {sourceRuns,fontResolver};
}

function candidateSequences(runs,targetLine){
  const target=compact(targetLine.text);
  if(!target)return [];
  const out=[];
  const yTol=Math.max(1.8,(targetLine.fontSize||12)*0.42);
  for(let i=0;i<runs.length;i++){
    const first=runs[i];
    if(Math.abs(first.y-targetLine.y)>yTol)continue;
    let text='';
    const seq=[];
    for(let j=i;j<runs.length&&j<i+16;j++){
      const r=runs[j];
      if(Math.abs(r.y-targetLine.y)>yTol){if(seq.length)break;continue;}
      if(seq.length&&r.streamIndex!==seq[0].streamIndex)break;
      if(seq.length&&r.x<seq.at(-1).x-Math.max(2,(targetLine.fontSize||12)*0.75))break;
      seq.push(r);
      text+=r.text||'';
      const key=compact(text);
      if(key===target){out.push(seq.slice());break;}
      if(key.length>target.length+4&&!key.startsWith(target))break;
    }
  }
  return out;
}

function scoreSequence(seq,line){
  const first=seq[0];
  const baselineDelta=Math.abs(first.y-line.y);
  const xDelta=Math.abs(first.x-line.minX);
  const textMatch=compact(seq.map(r=>r.text).join(''))===compact(line.text);
  const visualFont=line.fontName;
  const sourceFont=first.fontName;
  const fontMatch=!visualFont||!sourceFont||visualFont.includes(sourceFont)||sourceFont.includes(visualFont);
  return mappingConfidence({textMatch,baselineDelta,xDelta,fontMatch,sequenceLength:seq.length,ambiguous:false});
}

function isDirectSafeSequence(seq){
  if(!seq?.length)return false;
  const first=seq[0];
  return seq.every((r,idx)=>idx===0||(
    r.streamIndex===first.streamIndex&&
    r.textObjectIndex===first.textObjectIndex&&
    r.fontName===first.fontName&&
    r.operatorIndex===seq[idx-1].operatorIndex+1
  ));
}

export function mapBlocksToSources(pdfDoc,pageIndex,streams,blocks){
  const {sourceRuns,fontResolver}=extractSourceRunsFromStreams(pdfDoc,pageIndex,streams);
  const claimed=new Set();
  const mapped=blocks.map((block)=>{
    const matches=[];
    const sourceLines=[];
    let minConfidence=1;
    let mappingReason=null;
    let fontReason=null;
    let directSafe=true;
    let allFontsDirect=true;

    for(const line of block.lines){
      const candidates=candidateSequences(sourceRuns,line).filter(seq=>seq.every(r=>!claimed.has(`${r.streamIndex}:${r.operatorIndex}`)));
      if(candidates.length===0){mappingReason='SOURCE_NOT_MAPPED';minConfidence=0;continue;}
      const scored=candidates.map(seq=>({seq,score:scoreSequence(seq,line)})).sort((a,b)=>b.score-a.score);
      if(scored.length>1&&Math.abs(scored[0].score-scored[1].score)<0.05){mappingReason='AMBIGUOUS_SOURCE_MAPPING';minConfidence=Math.min(minConfidence,0.4);continue;}
      const best=scored[0];
      minConfidence=Math.min(minConfidence,best.score);
      matches.push(...best.seq);
      sourceLines.push(best.seq.slice());
      directSafe&&=isDirectSafeSequence(best.seq);
      for(const r of best.seq){
        claimed.add(`${r.streamIndex}:${r.operatorIndex}`);
        const support=classifyFontSupport(r.fontContext);
        if(support.tier!=='DIRECT_EDIT'){
          allFontsDirect=false;
          fontReason ||= support.reason||'FONT_SUBSTITUTION_REQUIRED';
        }
      }
    }

    const allLinesMapped=!mappingReason&&sourceLines.length===block.lines.length&&matches.length>0;
    const confidence=allLinesMapped?minConfidence:Math.min(minConfidence,0.6);
    let tier='LIMITED_EDIT';
    let reason=mappingReason||'LOW_MAPPING_CONFIDENCE';

    if(allLinesMapped&&confidence>=DIRECT_EDIT_THRESHOLD&&directSafe&&allFontsDirect){
      tier='DIRECT_EDIT';
      reason=null;
    }else if(allLinesMapped&&confidence>=RECONSTRUCT_THRESHOLD){
      tier='FONT_SUBSTITUTION';
      reason=fontReason||(directSafe?'FONT_SUBSTITUTION_REQUIRED':'RECONSTRUCT_SOURCE_SEQUENCE');
    }

    return {...block,sourceRuns:matches,sourceLines,confidence,tier,reason};
  });
  return {blocks:mapped,sourceRuns,fontResolver};
}
