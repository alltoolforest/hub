import { withPdfDocument } from '../rendering/with-document.js';
export async function validateRenderable(bytes,pageIndexes){
  try{
    return await withPdfDocument(bytes,async doc=>{
      for(const i of new Set(pageIndexes)){
        const page=await doc.getPage(i+1);
        try{await page.getOperatorList();}finally{page.cleanup();}
      }
      return {ok:true};
    });
  }catch(err){return {ok:false,error:String(err)};}
}
