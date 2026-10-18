export const LIST_MARKER_RE=/^(?:[•●◦▪‣⁃·]|(?:\d{1,3}|[A-Za-z])[.)])$/u;

export function compactListText(value){return String(value||'').replace(/\s+/g,'').trim();}
export function isListMarkerRun(run){return LIST_MARKER_RE.test(compactListText(run?.text));}
export function listRunKey(run){return `${run?.sourceContainerKey||`page:${run?.streamRef||run?.streamIndex}`}:${run?.operatorIndex}`;}

function markerRight(run,size){
  const x=Number(run?.x),advance=Math.abs(Number(run?.advance));
  if(!Number.isFinite(x))return null;
  return x+(Number.isFinite(advance)&&advance>.1?advance:Math.max(3,size*.6));
}
function baselineTolerance(size){return Math.max(3.2,size*.40);}
function fontSizeOf(run,fallback){return Math.max(1,Number(run?.fontSize)||fallback);}

function lineGroups(runs,size){
  const groups=[];
  const tolerance=baselineTolerance(size);
  for(const run of runs||[]){
    if(!String(run?.text||'').trim())continue;
    const y=Number(run?.y),x=Number(run?.x);
    if(!Number.isFinite(y)||!Number.isFinite(x))continue;
    let group=groups.find(item=>Math.abs(item.baseline-y)<=tolerance);
    if(!group){group={baseline:y,runs:[],left:x};groups.push(group);}
    group.runs.push(run);group.left=Math.min(group.left,x);
  }
  return groups.sort((a,b)=>b.baseline-a.baseline);
}

export function findOwnedListMarker({runs=[],claimed=new Set(),baseline,left,size=12}={}){
  const candidates=[];
  for(const run of runs){
    if(!isListMarkerRun(run)||claimed.has(listRunKey(run)))continue;
    const y=Number(run?.y),x=Number(run?.x),right=markerRight(run,size);
    if(!Number.isFinite(y)||!Number.isFinite(x)||!Number.isFinite(right))continue;
    const vertical=Math.abs(y-baseline);
    if(vertical>baselineTolerance(size))continue;
    if(x>=left-.5)continue;
    const gap=left-right;
    if(gap<-.5||gap>Math.max(52,size*4.8))continue;
    candidates.push({run,vertical,gap,score:vertical*4+gap});
  }
  candidates.sort((a,b)=>a.score-b.score||a.gap-b.gap);
  if(!candidates.length)return {ok:false,reason:'LIST_MARKER_NOT_FOUND',marker:null};
  if(candidates.length>1){
    const first=candidates[0],second=candidates[1];
    if(Math.abs(first.score-second.score)<=Math.max(1.5,size*.18))return {ok:false,reason:'LIST_MARKER_OWNERSHIP_AMBIGUOUS',marker:null,candidates:candidates.slice(0,3)};
  }
  return {ok:true,reason:null,marker:candidates[0].run};
}

export function findListContinuationRuns({runs=[],claimed=new Set(),baseline,left,size=12,maxLines=8}={}){
  const groups=lineGroups(runs,size);
  const below=groups.filter(group=>group.baseline<baseline-Math.max(3,size*.35));
  const out=[];let previousBaseline=baseline;let lineCount=0;
  for(const group of below){
    const gap=previousBaseline-group.baseline;
    if(gap<Math.max(3,size*.45))continue;
    if(gap>Math.max(12,size*1.95))break;
    if(group.runs.some(isListMarkerRun))break;
    const eligible=group.runs.filter(run=>{
      if(claimed.has(listRunKey(run))||isListMarkerRun(run))return false;
      const x=Number(run?.x),runSize=fontSizeOf(run,size);
      if(!Number.isFinite(x))return false;
      if(Math.abs(x-left)>Math.max(22,size*2.05))return false;
      if(Math.abs(runSize-size)>Math.max(1.8,size*.24))return false;
      return true;
    });
    const textual=group.runs.filter(run=>!isListMarkerRun(run));
    if(!eligible.length||eligible.length!==textual.filter(run=>!claimed.has(listRunKey(run))).length)break;
    out.push(...eligible);previousBaseline=group.baseline;lineCount++;
    if(lineCount>=maxLines)break;
  }
  return out;
}

export function resolveListSemanticUnit({runs=[],claimed=new Set(),baseline,left,size=12}={}){
  const markerResult=findOwnedListMarker({runs,claimed,baseline,left,size});
  if(!markerResult.ok)return {...markerResult,continuationRuns:[]};
  const localClaimed=new Set(claimed);localClaimed.add(listRunKey(markerResult.marker));
  const continuationRuns=findListContinuationRuns({runs,claimed:localClaimed,baseline,left,size});
  return {ok:true,reason:null,marker:markerResult.marker,continuationRuns};
}
