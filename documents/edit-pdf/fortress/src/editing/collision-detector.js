import { buildReplacementForSourceLine } from '../mutation/text-operator-rewriter.js';
import { replacementWidthLimit } from '../export/table-cell-safety.js';

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
 * Refuse replacements whose measured glyph advance exceeds the safe visual
 * region. When Task 14 identifies a real table cell, the right cell boundary
 * becomes authoritative instead of the looser source-line growth allowance.
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
    const widthLimit=replacementWidthLimit(block,lineIndex,visualWidth,{maxVisualOverflow});
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
      if(estimatedWidth>widthLimit.limit){
        return {
          ok:false,
          reason:widthLimit.reason,
          message:widthLimit.cellAware?'Replacement would cross the detected table-cell boundary.':'Replacement is wider than the safely mapped visual text region.',
          visualWidth,
          safeWidth:widthLimit.limit,
          estimatedWidth,
          lineIndex,
          tableCell:widthLimit.cell||null,
        };
      }
      continue;
    }

    const growth=fallbackGrowth(originalLines[lineIndex]??originalLines.at(-1)??'',replacement);
    if(widthLimit.cellAware&&visualWidth>0){
      const fallbackEstimate=visualWidth*growth;
      if(fallbackEstimate>widthLimit.limit){
        return {ok:false,reason:'TABLE_CELL_WIDTH_OVERFLOW',message:'Replacement is estimated to cross the detected table-cell boundary.',growth,visualWidth,safeWidth:widthLimit.limit,estimatedWidth:fallbackEstimate,lineIndex,tableCell:widthLimit.cell};
      }
    }else if(growth>maxGrowth){
      return {ok:false,reason:'LAYOUT_COLLISION',message:'Replacement is substantially wider than the original mapped region.',growth,lineIndex};
    }
  }
  return {ok:true,reason:null};
}
