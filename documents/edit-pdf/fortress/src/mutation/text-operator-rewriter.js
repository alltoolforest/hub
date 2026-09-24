import { bytesToHex } from '../utils/bytes.js';
import { encodeReplacementText } from '../fonts/glyph-encoder.js';
import { advanceForString } from '../text/text-advance.js';

function fmt(n){return Number(n.toFixed(4)).toString();}

function preserveImplicitPosition(run,showExpression){
  if(run?.operator==="'")return `T* ${showExpression}`;
  if(run?.operator==='"')return `${fmt(run.wordSpacing||0)} Tw ${fmt(run.charSpacing||0)} Tc T* ${showExpression}`;
  return showExpression;
}

export function buildReplacementForSourceLine(sourceLine,newText){
  if(!sourceLine?.length)return {success:false,reason:'NO_SOURCE_LINE'};
  const first=sourceLine[0];
  const last=sourceLine.at(-1);
  const font=first.fontContext;
  if(sourceLine.some(r=>r.fontName!==first.fontName))return {success:false,reason:'MIXED_FONTS_IN_SOURCE_LINE'};
  const enc=encodeReplacementText(font,newText);
  if(!enc.success)return enc;
  const state={fontSize:first.fontSize,charSpacing:first.charSpacing,wordSpacing:first.wordSpace??first.wordSpacing,horizontalScale:first.hscale??first.horizontalScale};
  const newAdvance=advanceForString(enc.bytes,font,state,newText);
  const startX=first.textMatrix?.[4]??0;
  const endX=last.endTextMatrix?.[4]??startX;
  const originalAdvance=endX-startX;
  const denom=(first.fontSize||1)*((first.horizontalScale??100)/100);
  const adjust=denom?-(originalAdvance-newAdvance)/denom*1000:0;
  const hex=`<${bytesToHex(enc.bytes)}>`;
  const show=Math.abs(adjust)<0.01?`${hex} Tj`:`[${hex} ${fmt(adjust)}] TJ`;
  const replacement=preserveImplicitPosition(first,show);
  return {success:true,replacement,bytes:enc.bytes,originalAdvance,newAdvance,compensation:adjust,start:first.instrStart,end:last.instrEnd,streamIndex:first.streamIndex,streamRef:first.streamRef,fontContext:font};
}

export function buildNeutralizerForSourceRun(run){
  if(!run)return {success:false,reason:'NO_SOURCE_RUN'};
  const denom=(run.fontSize||1)*((run.horizontalScale??100)/100);
  const originalAdvance=Number.isFinite(run.advance)?run.advance:((run.endTextMatrix?.[4]??0)-(run.textMatrix?.[4]??0));
  if(!Number.isFinite(originalAdvance))return {success:false,reason:'SOURCE_ADVANCE_UNKNOWN'};
  const adjust=denom?-(originalAdvance/denom)*1000:0;
  const show=`[${fmt(adjust)}] TJ`;
  const replacement=preserveImplicitPosition(run,show);
  return {success:true,replacement,originalAdvance,compensation:adjust,start:run.instrStart,end:run.instrEnd,streamIndex:run.streamIndex,streamRef:run.streamRef};
}
