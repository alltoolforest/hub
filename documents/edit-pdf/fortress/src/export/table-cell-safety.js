import { loadPdfjs } from '../rendering/pdfjs.js';
import { inferContainingTableCell, inferContainingTableCellAtPoint, replacementWidthLimit } from './table-cell-geometry.js';
export { inferContainingTableCell, inferContainingTableCellAtPoint, replacementWidthLimit } from './table-cell-geometry.js';

function rectOfBlock(block){
  const b=block?.bounds;if(!b)return null;
  const x=Number(b.x),y=Number(b.y),width=Number(b.width),height=Number(b.height);
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
  return {left:x,right:x+width,bottom:y,top:y+height,width,height,cx:x+width/2,cy:y+height/2};
}

async function pageShapes(pdfjs,pdf,pageIndex){
  const page=await pdf.getPage(pageIndex+1),operators=await page.getOperatorList(),shapes=[];
  for(let i=0;i<operators.fnArray.length;i++){
    if(operators.fnArray[i]!==pdfjs.OPS.constructPath)continue;
    const raw=operators.argsArray[i]?.[2];if(!raw)continue;
    const a=Number(raw[0]),b=Number(raw[1]),c=Number(raw[2]),d=Number(raw[3]);if(![a,b,c,d].every(Number.isFinite))continue;
    const left=Math.min(a,c),right=Math.max(a,c),bottom=Math.min(b,d),top=Math.max(b,d),width=right-left,height=top-bottom;
    if(width<=0||height<=0)continue;
    const kind=width<=3&&height>=10?'VERTICAL':(height<=3&&width>=10?'HORIZONTAL':'CELL');
    shapes.push({left,right,bottom,top,width,height,kind});
  }
  const view=page.view||[0,0,595,842];
  return {shapes,pageWidth:Math.abs(Number(view[2])-Number(view[0]))||595,pageHeight:Math.abs(Number(view[3])-Number(view[1]))||842};
}

function analysisError(error){
  if(error?.code==='TABLE_CELL_ANALYSIS_FAILED')return error;
  return Object.assign(new Error('Table/vector geometry could not be analyzed safely, so this edit was stopped before PDF mutation.'),{
    code:'TABLE_CELL_ANALYSIS_FAILED',
    cause:error,
  });
}

export async function prepareTableCellTransactions(originalBytes,transactions=[],{
  loadRuntime=loadPdfjs,
  readPageShapes=pageShapes,
}={}){
  const candidates=(transactions||[]).filter(tx=>{
    if(Number(tx?.pageRotation||tx?.block?.pageRotation||0)!==0)return false;
    if(tx?.kind==='REPLACE_TEXT')return !!tx?.block?.bounds;
    if(tx?.kind==='INSERT_TEXT')return Number.isFinite(Number(tx?.x))&&Number.isFinite(Number(tx?.y));
    return false;
  });
  if(!candidates.length)return transactions;
  let pdf=null,task=null;
  try{
    const pdfjs=await loadRuntime();
    task=pdfjs.getDocument({data:originalBytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
    pdf=await task.promise;
    const cache=new Map(),cellById=new Map();
    for(const tx of candidates){
      const pageIndex=Number(tx.pageIndex);
      if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=pdf.numPages){
        throw Object.assign(new Error('Table/vector geometry target page is unavailable.'),{code:'TABLE_CELL_ANALYSIS_FAILED',transactionId:tx?.id,pageIndex});
      }
      if(!cache.has(pageIndex))cache.set(pageIndex,await readPageShapes(pdfjs,pdf,pageIndex));
      const page=cache.get(pageIndex);
      if(!page||!Array.isArray(page.shapes)){
        throw Object.assign(new Error('Table/vector geometry analysis returned an invalid page model.'),{code:'TABLE_CELL_ANALYSIS_FAILED',transactionId:tx?.id,pageIndex});
      }
      const cell=tx.kind==='INSERT_TEXT'
        ?inferContainingTableCellAtPoint(page.shapes,{x:Number(tx.x),y:Number(tx.y)},{pageWidth:page.pageWidth,pageHeight:page.pageHeight})
        :inferContainingTableCell(page.shapes,rectOfBlock(tx.block),{pageWidth:page.pageWidth,pageHeight:page.pageHeight});
      if(cell)cellById.set(tx.id,cell);
    }
    if(!cellById.size)return transactions;
    return (transactions||[]).map(tx=>{
      const cell=cellById.get(tx?.id);if(!cell)return tx;
      if(tx.kind==='INSERT_TEXT')return {...tx,tableCell:cell};
      return {...tx,tableCell:cell,block:{...tx.block,tableCell:cell}};
    });
  }catch(error){
    throw analysisError(error);
  }finally{
    try{await pdf?.destroy?.();}catch{}
    try{await task?.destroy?.();}catch{}
  }
}

export async function prepareTableCellReplacementTransactions(originalBytes,transactions=[],options={}){
  return prepareTableCellTransactions(originalBytes,transactions,options);
}
