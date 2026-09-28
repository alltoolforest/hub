import { buildReplacementForSourceLine } from '../mutation/text-operator-rewriter.js';
import { replacementWidthLimit } from '../export/table-cell-geometry.js';

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

function headingLike(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  if(text.length<4||text.length>96||text.includes('\n'))return false;
  const letters=Array.from(text).filter(ch=>/\p{L}/u.test(ch));
  if(letters.length<4)return false;
  return letters.every(ch=>ch===ch.toUpperCase()&&ch!==ch.toLowerCase());
}

function canUseHeadingExpansion(block,replacement,lineIndex){
  if(lineIndex!==0)return false;
  const sourceLineCount=Math.max(1,block?.sourceLines?.length||block?.lines?.length||1);
  if(sourceLineCount!==1)return false;
  return headingLike(block?.text)&&headingLike(replacement);
}

/**
 * Refuse replacements whose measured glyph advance exceeds the safe visual
 * region. When Task 14 identifies a real table cell, the right cell boundary
 * remains authoritative. Task 22 adds one narrow exception for a common PDF
 * editing case: a single-line ALL-CAPS heading may grow modestly beyond its
 * original glyph width when it is not inside a detected table cell. The final
 * export visual validator still rejects any real collision or clipping.
 */
export function validateReplacementLayout(block,newText,{maxGrowth=1.45,maxVisualOverflow=1.12,maxHeadingVisualOverflow=1.65}={}){
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
    const headingExpansion=!widthLimit.cellAware&&canUseHeadingExpansion(block,replacement,lineIndex);
    const effectiveLimit=headingExpansion
      ?Math.max(widthLimit.limit,Math.max(0,visualWidth)*maxHeadingVisualOverflow)
      :widthLimit.limit;
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
      if(estimatedWidth>effectiveLimit){
        return {
          ok:false,
          reason:widthLimit.reason,
          message:widthLimit.cellAware?'Replacement would cross the detected table-cell boundary.':(headingExpansion?'Replacement is wider than the safe heading expansion allowance.':'Replacement is wider than the safely mapped visual text region.'),
          visualWidth,
          safeWidth:effectiveLimit,
          estimatedWidth,
          lineIndex,
          tableCell:widthLimit.cell||null,
          headingExpansion,
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
    }else if(growth>(headingExpansion?maxHeadingVisualOverflow:maxGrowth)){
      return {ok:false,reason:'LAYOUT_COLLISION',message:headingExpansion?'Replacement is substantially wider than the safe heading expansion allowance.':'Replacement is substantially wider than the original mapped region.',growth,lineIndex,headingExpansion};
    }
  }
  return {ok:true,reason:null};
}
