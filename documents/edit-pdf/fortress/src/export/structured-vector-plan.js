import { loadPdfjs } from '../rendering/pdfjs.js';

const VECTOR_CLEARANCE=1.6;

function overlap(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}

async function structuredShapes(bytes,pageIndex,{bandLeft,bandRight}){
  const p=await loadPdfjs();
  const task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  try{
    const page=await pdf.getPage(pageIndex+1);
    const operators=await page.getOperatorList();
    const shapes=[];
    const bandWidth=Math.max(1,bandRight-bandLeft);
    for(let i=0;i<operators.fnArray.length;i++){
      if(operators.fnArray[i]!==p.OPS.constructPath)continue;
      const raw=operators.argsArray[i]?.[2];
      if(!raw)continue;
      const a=Number(raw[0]),b=Number(raw[1]),c=Number(raw[2]),d=Number(raw[3]);
      if(![a,b,c,d].every(Number.isFinite))continue;
      const left=Math.min(a,c),right=Math.max(a,c),bottom=Math.min(b,d),top=Math.max(b,d);
      const width=right-left,height=top-bottom;
      const hOverlap=overlap(left,right,bandLeft,bandRight);
      const vertical=width<=2.5&&height>=10&&((left+right)/2)>=bandLeft-1&&((left+right)/2)<=bandRight+1;
      const horizontal=height<=2.5&&width>=12&&hOverlap>=8;
      const cell=width>=8&&height>=6&&width<=bandWidth*.92&&height<=180&&hOverlap>=Math.min(8,width*.20);
      if(vertical||horizontal||cell)shapes.push({left,right,bottom,top,kind:vertical?'VERTICAL':(horizontal?'HORIZONTAL':'CELL')});
    }
    return shapes;
  }finally{try{await pdf.destroy?.();}catch{}}
}

function unsafeAt(boundary,shape,clearance=VECTOR_CLEARANCE){
  if(!Number.isFinite(boundary))return false;
  if(shape.kind==='HORIZONTAL'){
    const center=(shape.bottom+shape.top)/2;
    return Math.abs(boundary-center)<=clearance;
  }
  return boundary>shape.bottom+1&&boundary<shape.top-1;
}

function resolveCut(cutY,shapes,maxCutY){
  let current=cutY;
  for(let i=0;i<16;i++){
    const crossing=shapes.filter(shape=>unsafeAt(current,shape));
    if(!crossing.length)return {ok:true,cutY:current,snapDelta:current-cutY};
    const candidate=Math.max(...crossing.map(shape=>shape.top+VECTOR_CLEARANCE));
    if(candidate-current<.05||candidate>maxCutY||candidate-cutY>24)return {ok:false};
    current=candidate;
  }
  return {ok:false};
}

function structuredFlowGuards(shapes,{cutY,footerTop,safetyGap}){
  const pad=Math.max(.65,Math.min(2,Number(safetyGap||4)*.18));
  const candidates=[];
  for(const shape of shapes){
    if(shape.top>=cutY-.25||shape.top<=footerTop+.25)continue;
    const safeBoundary=shape.top+VECTOR_CLEARANCE;
    if(safeBoundary>=cutY-.1)continue;
    candidates.push({...shape,safeBoundary});
  }
  if(!candidates.length)return [];

  // A table row is commonly represented by several rectangles and vertical
  // segments ending on the same Y coordinate. Collapse those endpoints into
  // one guard so the normal line-aware overflow planner sees one structural
  // boundary per row instead of many duplicate vector fragments.
  candidates.sort((a,b)=>a.safeBoundary-b.safeBoundary);
  const groups=[];
  for(const shape of candidates){
    let group=groups.at(-1);
    if(!group||Math.abs(group.safeBoundary-shape.safeBoundary)>.75){
      group={safeBoundary:shape.safeBoundary,left:shape.left,right:shape.right,bottom:shape.bottom};
      groups.push(group);
    }else{
      group.safeBoundary=Math.max(group.safeBoundary,shape.safeBoundary);
      group.left=Math.min(group.left,shape.left);
      group.right=Math.max(group.right,shape.right);
      group.bottom=Math.min(group.bottom,shape.bottom);
    }
  }

  return groups.map(group=>{
    const top=group.safeBoundary-pad;
    const bottom=Math.max(footerTop+.3,Math.min(top-.1,group.bottom));
    if(!(top>bottom))return null;
    return {
      id:null,blockId:null,lineId:null,lineIndex:0,blockLineCount:1,
      left:group.left,right:group.right,bottom,top,width:group.right-group.left,height:top-bottom,
      structuredVectorGuard:true,
    };
  }).filter(Boolean);
}

async function prepareOne(bytes,tx){
  const plan=tx?.reflowPlan;
  if(tx?.kind!=='INSERT_TEXT'||!plan?.enabled)return tx;
  const pageIndex=Number(tx.pageIndex);
  const bandLeft=Number(plan?.contentBand?.left),bandRight=Number(plan?.contentBand?.right);
  const cutY=Number(plan.cutY),pageHeight=Number(plan.pageHeight)||842;
  if(!Number.isInteger(pageIndex)||pageIndex<0||![bandLeft,bandRight,cutY].every(Number.isFinite)||bandRight<=bandLeft)return tx;
  let shapes;
  try{shapes=await structuredShapes(bytes,pageIndex,{bandLeft,bandRight});}catch{return tx;}
  if(!shapes.length)return tx;
  const requestedTop=Number(tx.y);
  const maxCutY=Math.min(pageHeight-2,Number.isFinite(requestedTop)?Math.max(cutY,requestedTop-.5):cutY+24);
  const resolved=resolveCut(cutY,shapes,maxCutY);
  if(!resolved.ok)return tx; // Leave the current core validator fail-closed.
  const footerTop=Number(plan?.footerGuard?.top);
  const guards=structuredFlowGuards(shapes,{cutY:resolved.cutY,footerTop:Number.isFinite(footerTop)?footerTop:(Number(plan.bottomMargin)||12),safetyGap:plan.safetyGap});
  if(Math.abs(resolved.snapDelta)<.05&&!guards.length)return tx;
  const flowLines=[...(Array.isArray(plan.flowLines)?plan.flowLines:[]),...guards];
  return {...tx,reflowPlan:{...plan,cutY:resolved.cutY,flowLines,flowBlocks:flowLines,structuredVectorPlan:true,structuredCutSnapDelta:resolved.snapDelta||0,structuredGuardCount:guards.length}};
}

export async function prepareStructuredVectorTransactions(originalBytes,transactions=[]){
  const seenPages=new Set();
  const out=[];
  for(const tx of transactions){
    if(tx?.kind!=='INSERT_TEXT'||seenPages.has(Number(tx.pageIndex))){out.push(tx);continue;}
    seenPages.add(Number(tx.pageIndex));
    out.push(await prepareOne(originalBytes,tx));
  }
  return out;
}
