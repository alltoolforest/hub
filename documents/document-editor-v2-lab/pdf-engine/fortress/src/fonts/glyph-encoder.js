import { encodeSimple } from './simple-encoding.js';
import { encodeCompositeString } from './tounicode-parser.js';
export function encodeReplacementText(fontContext, unicodeText) {
  if (/\p{Script=Telugu}|\p{Script=Devanagari}|\p{Script=Tamil}/u.test(unicodeText)) {
    return { success:false, bytes:new Uint8Array(), codes:[], glyphs:[], widths:[], encodingStrategy:null, reason:'SHAPING_REQUIRED', unsupportedCharacters:Array.from(unicodeText) };
  }
  if(fontContext?.isComposite){
    const r=encodeCompositeString(unicodeText,fontContext.toUnicode);
    return { ...r, codes:r.success ? splitCodes(r.bytes,fontContext.codeWidth||2):[], glyphs:[], widths:[], encodingStrategy:r.success?'TOUNICODE_REVERSE':null };
  }
  const r=encodeSimple(unicodeText,fontContext.encodingTable,fontContext.toUnicode);
  return { ...r, codes:r.success ? Array.from(r.bytes):[], glyphs:[], widths:[], encodingStrategy:r.success?'SIMPLE_ENCODING':null, reason:r.success?null:'CHARACTER_NOT_AVAILABLE_IN_FONT' };
}
function splitCodes(bytes,w){const out=[];for(let i=0;i<bytes.length;i+=w){let n=0;for(let j=0;j<w&&i+j<bytes.length;j++)n=n*256+bytes[i+j];out.push(n);}return out;}
