import { parseContentStream } from '../parser/content-stream-parser.js';
import { interpretTextRuns } from '../text/text-state.js';
import { mappingConfidence, DIRECT_EDIT_THRESHOLD } from './confidence.js';
import { inspectFontResource } from '../fonts/font-inspector.js';
import { classifyFontSupport } from '../fonts/font-support.js';

const norm=(s)=>String(s||'').replace(/\s+/g,' ').trim();
const compact=(s)=>norm(s).replace(/\s+/g,'');
const RECONSTRUCT_THRESHOLD=0.70;
const MAX_SEQUENCE_RUNS=128;

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
    sourceRuns.push(...runs.map((r)=>({
      ...r,
      operator:instructions[r.operatorIndex]?.op||r.kind,
      x:r.trm[4],
      y:r.trm[5],
    })));
  }
  sourceRuns.sort((a,b)=>Math.abs(b.y-a.y)>1?(b.y-a.y):(a.x-b.x));
  return {sourceRuns,fontResolver};
}

function sameText(a,b){
  const na=norm(a),nb=norm(b);
  return na===nb||compact(na)===compact(nb);
}

function possiblePrefix(value,target){
  const v=compact(value),t=compact(target);
  return !v||t.startsWith(v)||v.startsWith(t);
}

function trimWhitespaceEdges(seq){
  let start=0,end=seq.length;
  while(start<end&&!String(seq[start]?.text||'').trim())start++;
  while(end>start&&!String(seq[end-1]?.text||'').trim())end--;
  return seq.slice(start,end);
}

function candidateSequences(runs,targetLine){
  const target=norm(targetLine.text);
  if(!target)return [];
  const out=[];
  const yTol=Math.max(2,(targetLine.fontSize||12)*0.48);
  const xBackTol=Math.max(3,(targetLine.fontSize||12)*0.8);

  for(let i=0;i<runs.length;i++){
    const first=runs[i];
    if(!String(first.text||'').trim())continue;
    if(Math.abs(first.y-targetLine.y)>yTol)continue;
    if(Math.abs(first.x-targetLine.minX)>Math.max(8,(targetLine.fontSize||12)*1.8))continue;

    let text='';
    const seq=[];
    for(let j=i;j<runs.length&&j<i+MAX_SEQUENCE_RUNS;j++){
      const r=runs[j];
      if(Math.abs(r.y-targetLine.y)>yTol){
        if(seq.length)break;
        continue;
      }
      if(seq.length&&r.streamIndex!==seq[0].streamIndex)break;
      if(seq.length&&r.x<seq.at(-1).x-xBackTol)break;

      seq.push(r);
      text+=r.text||'';
      const cleaned=trimWhitespaceEdges(seq);
      const cleanedText=cleaned.map(x=>x.text||'').join('');
      if(cleaned.length&&sameText(cleanedText,target)){
        out.push(cleaned);
        break;
      }
      if(!possiblePrefix(cleanedText,target)&&compact(cleanedText).length>compact(target).length+8)break;
    }
  }

  const seen=new Set();
  return out.filter(seq=>{
    const key=seq.map(r=>`${r.streamIndex}:${r.operatorIndex}`).join('|');
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function scoreSequence(seq,line){
  const first=seq[0];
  const last=seq.at(-1);
  const baselineDelta=Math.abs(first.y-line.y);
  const xDelta=Math.abs(first.x-line.minX);
  const textMatch=sameText(seq.map(r=>r.text).join(''),line.text);
  const visualFont=line.fontName;
  const sourceFont=first.fontName;
  const fontMatch=!visualFont||!sourceFont||visualFont.includes(sourceFont)||sourceFont.includes(visualFont);
  let score=mappingConfidence({textMatch,baselineDelta,xDelta,fontMatch,sequenceLength:Math.min(seq.length,5),ambiguous:false});
  const sourceEnd=(last?.x||0)+Math.max(0,last?.advance||0);
  const visualWidth=Math.max(1,(line.maxX||line.minX||0)-(line.minX||0));
  const endDelta=Math.abs(sourceEnd-(line.maxX||sourceEnd));
  if(endDelta<=Math.max(6,visualWidth*0.08))score+=0.04;
  return Math.max(0,Math.min(1,score));
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
    const pendingClaims=new Set();
    let minConfidence=1;
    let mappingReason=null;
    let fontReason=null;
    let directSafe=true;
    let allFontsDirect=true;

    for(const line of block.lines){
      const candidates=candidateSequences(sourceRuns,line).filter(seq=>seq.every(r=>{
        const key=`${r.streamIndex}:${r.operatorIndex}`;
        return !claimed.has(key)&&!pendingClaims.has(key);
      }));
      if(candidates.length===0){mappingReason='SOURCE_NOT_MAPPED';minConfidence=0;continue;}
      const scored=candidates.map(seq=>({seq,score:scoreSequence(seq,line)})).sort((a,b)=>b.score-a.score);
      if(scored.length>1&&Math.abs(scored[0].score-scored[1].score)<0.035){
        mappingReason='AMBIGUOUS_SOURCE_MAPPING';
        minConfidence=Math.min(minConfidence,0.4);
        continue;
      }
      const best=scored[0];
      minConfidence=Math.min(minConfidence,best.score);
      matches.push(...best.seq);
      sourceLines.push(best.seq.slice());
      directSafe&&=isDirectSafeSequence(best.seq);
      for(const r of best.seq){
        pendingClaims.add(`${r.streamIndex}:${r.operatorIndex}`);
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

    if(allLinesMapped)for(const key of pendingClaims)claimed.add(key);
    return {...block,sourceRuns:matches,sourceLines,confidence,tier,reason};
  });
  return {blocks:mapped,sourceRuns,fontResolver};
}
