import { bytesToHex } from '../utils/bytes.js';
import { encodeReplacementText } from '../fonts/glyph-encoder.js';
import { advanceForString } from '../text/text-advance.js';

function fmt(n){return Number(n.toFixed(4)).toString();}

export function buildReplacementForSourceLine(sourceLine,newText){
  if(!sourceLine?.length) return {success:false,reason:'NO_SOURCE_LINE'};
  const first=sourceLine[0]; const last=sourceLine.at(-1); const font=first.fontContext;
  if(sourceLine.some(r=>r.fontName!==first.fontName)) return {success:false,reason:'MIXED_FONTS_IN_SOURCE_LINE'};
  const enc=encodeReplacementText(font,newText);
  if(!enc.success) return enc;
  const state={fontSize:first.fontSize,charSpacing:first.charSpacing,wordSpacing:first.wordSpace??first.wordSpacing,horizontalScale:first.hscale??first.horizontalScale};
  const newAdvance=advanceForString(enc.bytes,font,state,newText);
  const startX=first.textMatrix?.[4]??0; const endX=last.endTextMatrix?.[4]??startX; const originalAdvance=endX-startX;
  const denom=(first.fontSize||1)*((first.horizontalScale??100)/100);
  const adjust=denom?-(originalAdvance-newAdvance)/denom*1000:0;
  const hex=`<${bytesToHex(enc.bytes)}>`;
  const replacement=Math.abs(adjust)<0.01?`${hex} Tj`:`[${hex} ${fmt(adjust)}] TJ`;
  return {success:true,replacement,bytes:enc.bytes,originalAdvance,newAdvance,compensation:adjust,start:first.instrStart,end:last.instrEnd,streamIndex:first.streamIndex,streamRef:first.streamRef,fontContext:font};
}
