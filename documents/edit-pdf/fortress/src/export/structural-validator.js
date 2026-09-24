import { PDFDocument } from '../core/pdf-lib.js';
export async function validateStructure(bytes,expectedPages){
  try{const doc=await PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false});const pageCount=doc.getPageCount();return {ok:pageCount===expectedPages,pageCount};}catch(err){return {ok:false,error:String(err)};}
}
