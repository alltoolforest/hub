import { decodeSimple } from './simple-encoding.js';
import { decodeCompositeString } from './tounicode-parser.js';
export function decodePdfString(bytes,fontContext){
  if(!fontContext) return {success:false,text:'',reason:'FONT_NOT_RESOLVED'};
  if(fontContext.isComposite) return decodeCompositeString(bytes,fontContext.toUnicode);
  return {success:true,text:decodeSimple(bytes,fontContext.encodingTable,fontContext.toUnicode)};
}
