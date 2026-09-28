export function isSemanticDeletion(tx){
  return tx?.kind==='REPLACE_TEXT'&&!!tx?.block&&String(tx?.originalUnicode??tx?.block?.text??'').trim().length>0&&String(tx?.replacementUnicode??'').trim().length===0;
}

export function deletedVisualLineCount(tx){
  if(!isSemanticDeletion(tx))return 0;
  const lines=Array.isArray(tx?.block?.lines)?tx.block.lines:[];
  const visible=lines.filter(line=>{
    if(String(line?.text||'').trim())return true;
    if(Array.isArray(line?.runs)&&line.runs.some(run=>String(run?.text||'').trim()))return true;
    return Number.isFinite(Number(line?.y));
  }).length;
  return Math.max(1,Math.min(64,visible||1));
}

export function planDeletionCompaction(tx,{pitch,maxSafeShift,fontSize=12}={}){
  const lineCount=deletedVisualLineCount(tx);
  if(!lineCount)return {ok:false,reason:'NOT_A_SEMANTIC_DELETION',lineCount:0,desiredShift:0,shiftY:0};
  const p=Number(pitch),max=Number(maxSafeShift),size=Math.max(1,Number(fontSize)||12);
  if(!Number.isFinite(p)||p<=0||!Number.isFinite(max)||max<=0)return {ok:false,reason:'COMPACTION_GEOMETRY_INVALID',lineCount,desiredShift:0,shiftY:0};
  const desiredShift=p*lineCount;
  const tolerance=Math.max(1,size*.35);
  if(max+tolerance<desiredShift){
    return {ok:false,reason:'COMPACTION_RELEASE_GEOMETRY_MISMATCH',lineCount,desiredShift,maxSafeShift:max,tolerance,shiftY:0};
  }
  return {ok:true,lineCount,desiredShift,shiftY:Math.min(desiredShift,max),maxSafeShift:max,tolerance};
}
