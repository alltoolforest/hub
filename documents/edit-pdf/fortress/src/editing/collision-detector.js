export function validateReplacementLayout(block,newText,{maxGrowth=1.45}={}){
  const lines=String(newText).split('\n');
  if(lines.length>Math.max(1,block.sourceLines?.length||block.lines?.length||1)) return {ok:false,reason:'TEXT_OVERFLOW',message:'Replacement needs more lines than the safely mapped source region.'};
  const longest=Math.max(...lines.map(s=>s.length),0); const originalLongest=Math.max(...String(block.text||'').split('\n').map(s=>s.length),1);
  if(longest/originalLongest>maxGrowth && (block.bounds?.width||0)<200) return {ok:false,reason:'LAYOUT_COLLISION',message:'Replacement is substantially wider than the original mapped region.'};
  return {ok:true,reason:null};
}
