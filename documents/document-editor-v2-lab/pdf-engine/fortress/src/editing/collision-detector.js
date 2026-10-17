import { buildReplacementForSourceLine } from '../mutation/text-operator-rewriter.js';

function visualLineWidth(block,lineIndex){
  const line=block?.lines?.[lineIndex]||block?.lines?.at?.(-1);
  const minX=Number(line?.minX),maxX=Number(line?.maxX);
  if(Number.isFinite(minX)&&Number.isFinite(maxX)&&maxX>minX)return maxX-minX;
  const width=Number(line?.bounds?.width??block?.bounds?.width);
  return Number.isFinite(width)&&width>0?width:0;
}

function fallbackGrowth(original,replacement){
  const oldLength=Math.max(1,Array.from(String(original||'')).length);
  return Array.from(String(replacement||'')).length/oldLength;
}

/**
 * Refuse direct replacements whose rendered glyph advance is wider than the
 * visual source line. The previous character-count-only guard skipped blocks
 * wider than 200pt, which allowed wide table/cell text to collide visually.
 *
 * When source font metrics are available, buildReplacementForSourceLine gives
 * us the real replacement advance in that PDF font. We normalize that advance
 * to the visual line width so PDF text-space scaling does not create false
 * comparisons. Character growth is retained only as a conservative fallback.
 */
export function validateReplacementLayout(block,newText,{maxGrowth=1.45,maxVisualOverflow=1.12}={}){
  const lines=String(newText).split('\n');
  const sourceLineCount=Math.max(1,block?.sourceLines?.length||block?.lines?.length||1);
  if(lines.length>sourceLineCount){
    return {ok:false,reason:'TEXT_OVERFLOW',message:'Replacement needs more lines than the safely mapped source region.'};
  }

  const originalLines=String(block?.text||'').split('\n');
  for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
    const replacement=lines[lineIndex];
    const sourceLine=block?.sourceLines?.[lineIndex];
    const visualWidth=visualLineWidth(block,lineIndex);
    let estimatedWidth=null;

    if(sourceLine?.length&&visualWidth>0){
      const built=buildReplacementForSourceLine(sourceLine,replacement);
      const originalAdvance=Math.abs(Number(built?.originalAdvance));
      const newAdvance=Math.abs(Number(built?.newAdvance));
      if(built?.success&&Number.isFinite(originalAdvance)&&originalAdvance>.01&&Number.isFinite(newAdvance)){
        estimatedWidth=newAdvance*(visualWidth/originalAdvance);
      }
    }

    if(Number.isFinite(estimatedWidth)){
      if(estimatedWidth>visualWidth*maxVisualOverflow){
        return {
          ok:false,
          reason:'LAYOUT_COLLISION',
          message:'Replacement is wider than the safely mapped visual text region.',
          visualWidth,
          estimatedWidth,
          lineIndex,
        };
      }
      continue;
    }

    const growth=fallbackGrowth(originalLines[lineIndex]??originalLines.at(-1)??'',replacement);
    if(growth>maxGrowth){
      return {
        ok:false,
        reason:'LAYOUT_COLLISION',
        message:'Replacement is substantially wider than the original mapped region.',
        growth,
        lineIndex,
      };
    }
  }
  return {ok:true,reason:null};
}
