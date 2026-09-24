import { parseContentStream } from '../parser/content-stream-parser.js';
import { interpretTextRuns } from '../text/text-state.js';
import { mappingConfidence, DIRECT_EDIT_THRESHOLD } from './confidence.js';
import { inspectFontResource } from '../fonts/font-inspector.js';
import { classifyFontSupport } from '../fonts/font-support.js';

const norm=(s)=>String(s||'').replace(/\s+/g,' ').trim();

export function extractSourceRunsFromStreams(pdfDoc,pageIndex,streams){
  const fontCache=new Map(); const fontResolver=(name)=>{if(!name)return null;if(!fontCache.has(name))fontCache.set(name,inspectFontResource(pdfDoc,pageIndex,name));return fontCache.get(name);};
  const sourceRuns=[];
  for(const stream of streams){
    const {instructions}=parseContentStream(stream.bytes);
    const runs=interpretTextRuns(instructions,{fontResolver,streamRef:stream.refKey,streamIndex:stream.streamIndex});
    sourceRuns.push(...runs.map((r)=>({...r,x:r.trm[4],y:r.trm[5]})));
  }
  sourceRuns.sort((a,b)=>Math.abs(b.y-a.y)>1?(b.y-a.y):(a.x-b.x));
  return {sourceRuns,fontResolver};
}

function candidateSequences(runs,targetLine){
  const target=norm(targetLine.text); const out=[]; const yTol=Math.max(1.5,(targetLine.fontSize||12)*0.28);
  for(let i=0;i<runs.length;i++){
    const first=runs[i]; if(Math.abs(first.y-targetLine.y)>yTol) continue;
    let text=''; let seq=[];
    for(let j=i;j<runs.length && j<i+8;j++){
      const r=runs[j];
      if(Math.abs(r.y-targetLine.y)>yTol) { if(seq.length) break; else continue; }
      if(seq.length && (r.streamIndex!==seq[0].streamIndex || r.textObjectIndex!==seq[0].textObjectIndex)) break;
      if(seq.length && r.x < seq.at(-1).x-2) break;
      seq.push(r); text += r.text;
      const n=norm(text);
      if(n===target){out.push(seq.slice());break;}
      if(n.length>target.length+6 && !target.startsWith(n.slice(0,target.length))) break;
    }
  }
  return out;
}

function scoreSequence(seq,line){
  const first=seq[0]; const baselineDelta=Math.abs(first.y-line.y); const xDelta=Math.abs(first.x-line.minX); const textMatch=norm(seq.map(r=>r.text).join(''))===norm(line.text);
  const visualFont=line.fontName; const sourceFont=first.fontName; const fontMatch=!visualFont||!sourceFont||visualFont.includes(sourceFont)||sourceFont.includes(visualFont);
  return mappingConfidence({textMatch,baselineDelta,xDelta,fontMatch,sequenceLength:seq.length,ambiguous:false});
}

export function mapBlocksToSources(pdfDoc,pageIndex,streams,blocks){
  const {sourceRuns,fontResolver}=extractSourceRunsFromStreams(pdfDoc,pageIndex,streams); const claimed=new Set();
  const mapped=blocks.map((block)=>{
    const matches=[]; const sourceLines=[]; let minConfidence=1; let reason=null; let fontTier='DIRECT_EDIT';
    for(const line of block.lines){
      const candidates=candidateSequences(sourceRuns,line).filter(seq=>seq.every(r=>!claimed.has(`${r.streamIndex}:${r.operatorIndex}`)));
      if(candidates.length===0){reason='SOURCE_NOT_MAPPED';minConfidence=0;continue;}
      const scored=candidates.map(seq=>({seq,score:scoreSequence(seq,line)})).sort((a,b)=>b.score-a.score);
      if(scored.length>1 && Math.abs(scored[0].score-scored[1].score)<0.08){reason='AMBIGUOUS_SOURCE_MAPPING';minConfidence=Math.min(minConfidence,0.4);continue;}
      const best=scored[0];
      const safeSequence=best.seq.every((r,idx)=>idx===0 || (r.streamIndex===best.seq[0].streamIndex && r.textObjectIndex===best.seq[0].textObjectIndex && r.fontName===best.seq[0].fontName && r.operatorIndex===best.seq[idx-1].operatorIndex+1));
      if(!safeSequence){reason='NONCONTIGUOUS_SOURCE_SEQUENCE';minConfidence=Math.min(minConfidence,0.6);continue;}
      minConfidence=Math.min(minConfidence,best.score); matches.push(...best.seq); sourceLines.push(best.seq.slice());
      for(const r of best.seq) claimed.add(`${r.streamIndex}:${r.operatorIndex}`);
      for(const r of best.seq){const s=classifyFontSupport(r.fontContext);if(s.tier!=='DIRECT_EDIT'){fontTier=s.tier;reason=s.reason;}}
    }
    const allLinesMapped=matches.length>0 && !reason && block.lines.every(line=>candidateSequences(matches,line).length>0 || norm(matches.map(r=>r.text).join('')).includes(norm(line.text)));
    const confidence=allLinesMapped?minConfidence:Math.min(minConfidence,0.6);
    const tier=allLinesMapped && confidence>=DIRECT_EDIT_THRESHOLD && fontTier==='DIRECT_EDIT'?'DIRECT_EDIT':'LIMITED_EDIT';
    return {...block,sourceRuns:matches,sourceLines,confidence,tier,reason:tier==='DIRECT_EDIT'?null:(reason||'LOW_MAPPING_CONFIDENCE')};
  });
  return {blocks:mapped,sourceRuns,fontResolver};
}
