import { validateStructure } from './structural-validator.js';
import { validateExtraction } from './extraction-validator.js';
import { validateRenderable } from './render-validator.js';
import { validateVisualRoundTrip } from './visual-roundtrip-validator.js';

export async function validateRoundTrip(bytes,{expectedPages,checks,baselineBytes=null}={}){
  const structural=await validateStructure(bytes,expectedPages);
  if(!structural.ok)return {ok:false,structural,extraction:null,render:null,visual:null,textVerified:false};
  const safeChecks=checks||[];
  const extraction=await validateExtraction(bytes,safeChecks);
  const pageIndexes=safeChecks.map(c=>c.pageIndex);
  const render=await validateRenderable(bytes,pageIndexes);
  let visual={ok:true,pages:[],failures:[]};
  if(render.ok&&baselineBytes){
    const pagePairs=safeChecks.map(check=>({
      outputPageIndex:check.pageIndex,
      baselinePageIndex:Number.isInteger(Number(check.sourcePageIndex))?Number(check.sourcePageIndex):Number(check.pageIndex),
    }));
    visual=await validateVisualRoundTrip(bytes,{baselineBytes,pagePairs});
  }
  return {
    ok:structural.ok&&render.ok&&extraction.ok&&visual.ok,
    structural,
    extraction,
    render,
    visual,
    textVerified:extraction.ok,
    warning:!extraction.ok?'TEXT_EXTRACTION_VERIFICATION_FAILED':(!visual.ok?'VISUAL_GEOMETRY_VALIDATION_FAILED':null),
  };
}
