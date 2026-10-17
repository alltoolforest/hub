export function mappingConfidence({textMatch,baselineDelta,xDelta,fontMatch,sequenceLength,ambiguous}){
  if(ambiguous) return 0.25;
  let score=0;
  score += textMatch?0.5:0;
  score += Math.max(0,0.2-baselineDelta*0.04);
  score += Math.max(0,0.15-xDelta*0.015);
  score += fontMatch?0.1:0.04;
  if(sequenceLength>4) score-=0.05;
  return Math.max(0,Math.min(1,score));
}
export const DIRECT_EDIT_THRESHOLD=0.82;
