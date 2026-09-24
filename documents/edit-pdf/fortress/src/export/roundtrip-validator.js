import { validateStructure } from './structural-validator.js';
import { validateExtraction } from './extraction-validator.js';
import { validateRenderable } from './render-validator.js';
export async function validateRoundTrip(bytes,{expectedPages,checks}){
  const structural=await validateStructure(bytes,expectedPages);if(!structural.ok)return {ok:false,structural};
  const extraction=await validateExtraction(bytes,checks);const render=await validateRenderable(bytes,checks.map(c=>c.pageIndex));return {ok:structural.ok&&extraction.ok&&render.ok,structural,extraction,render};
}
