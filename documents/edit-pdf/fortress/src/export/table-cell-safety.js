import { loadPdfjs } from '../rendering/pdfjs.js';
import { inferContainingTableCell, replacementWidthLimit } from './table-cell-geometry.js';
export { inferContainingTableCell, replacementWidthLimit } from './table-cell-geometry.js';

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

export async function prepareTableCellReplacementTransactions(originalBytes,transactions=[]){
  const candidates=(transactions||[]).filter(tx=>tx?.kind==='REPLACE_TEXT'&&tx?.block?.bounds&&Number(tx?.block?.pageRotation||0)===0);
  if(!candidates.length)return transactions;
  let pdf=null,task=null;
  try{
    const pdfjs=await loadPdfjs();
    task=pdfjs.getDocument({data:originalBytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});pdf=await task.promise;
    const cache=new Map(),cellById=new Map();
    for(const tx of candidates){
      const pageIndex=Number(tx.pageIndex);if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=pdf.numPages)continue;
      if(!cache.has(pageIndex))cache.set(pageIndex,await pageShapes(pdfjs,pdf,pageIndex));
      const page=cache.get(pageIndex),rect=rectOfBlock(tx.block);if(!rect)continue;
      const cell=inferContainingTableCell(page.shapes,rect,{pageWidth:page.pageWidth,pageHeight:page.pageHeight});
      if(cell)cellById.set(tx.id,cell);
    }
    if(!cellById.size)return transactions;
    return (transactions||[]).map(tx=>{
      const cell=cellById.get(tx?.id);if(!cell)return tx;
      return {...tx,tableCell:cell,block:{...tx.block,tableCell:cell}};
    });
  }catch{return transactions;}
  finally{try{await pdf?.destroy?.();}catch{}try{await task?.destroy?.();}catch{}}
}
