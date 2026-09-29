export function isSemanticDeletion(tx){
  return tx?.kind==='REPLACE_TEXT'&&!!tx?.block&&String(tx?.originalUnicode??tx?.block?.text??'').trim().length>0&&String(tx?.replacementUnicode??'').trim().length===0;
}

function visibleLines(tx){
  const lines=Array.isArray(tx?.block?.lines)?tx.block.lines:[];
  return lines.filter(line=>{
    if(String(line?.text||'').trim())return true;
    if(Array.isArray(line?.runs)&&line.runs.some(run=>String(run?.text||'').trim()))return true;
    return Number.isFinite(Number(line?.y));
  });
}

export function deletedVisualLineCount(tx){
  if(!isSemanticDeletion(tx))return 0;
  return Math.max(1,Math.min(64,visibleLines(tx).length||1));
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

function lineBounds(block,line){
  const size=Math.max(6,Number(line?.fontSize||block?.fontSize)||12);
  const baseline=Number(line?.y);
  const x=Number.isFinite(Number(line?.minX))?Number(line.minX):Number(block?.bounds?.x)||0;
  const maxX=Number.isFinite(Number(line?.maxX))?Number(line.maxX):x+Math.max(1,Number(block?.bounds?.width)||1);
  const width=Math.max(1,maxX-x);
  if(line?.bounds&&[line.bounds.x,line.bounds.y,line.bounds.width,line.bounds.height].every(v=>Number.isFinite(Number(v)))){
    return {x:Number(line.bounds.x),y:Number(line.bounds.y),width:Number(line.bounds.width),height:Number(line.bounds.height)};
  }
  const y=Number.isFinite(baseline)?baseline-size*.24:Number(block?.bounds?.y)||0;
  return {x,y,width,height:Math.max(size*1.10,1)};
}

export function expandDeletionCompactionTransactions(transactions=[]){
  const out=[];
  for(const tx of transactions||[]){
    if(!isSemanticDeletion(tx)){out.push(tx);continue;}
    const lines=visibleLines(tx);
    if(lines.length<=1){out.push(tx);continue;}
    for(let index=0;index<lines.length;index++){
      const line=lines[index];
      const bounds=lineBounds(tx.block,line);
      const block={...tx.block,id:`${tx.block?.id||tx.blockId||tx.id}__compact_line_${index}`,text:String(line?.text||tx.originalUnicode||''),lines:[{...line,bounds}],bounds};
      out.push({...tx,id:`${tx.id}__compact_line_${index}`,blockId:block.id,block,originalUnicode:String(line?.text||tx.originalUnicode||''),replacementUnicode:'',compactionOnly:true,compactionOf:tx.id,compactionLineIndex:index});
    }
  }
  return out;
}
