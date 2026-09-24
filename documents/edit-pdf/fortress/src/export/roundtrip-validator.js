import { validateStructure } from './structural-validator.js';
import { validateExtraction } from './extraction-validator.js';
import { validateRenderable } from './render-validator.js';

export async function validateRoundTrip(bytes,{expectedPages,checks}){
  const structural=await validateStructure(bytes,expectedPages);
  if(!structural.ok)return {ok:false,structural,extraction:null,render:null,textVerified:false};
  const extraction=await validateExtraction(bytes,checks||[]);
  const pageIndexes=(checks||[]).map(c=>c.pageIndex);
  const render=await validateRenderable(bytes,pageIndexes);
  return {
    ok:structural.ok&&render.ok,
    structural,
    extraction,
    render,
    textVerified:extraction.ok,
    warning:extraction.ok?null:'TEXT_EXTRACTION_VERIFICATION_DIFFERED',
  };
}
