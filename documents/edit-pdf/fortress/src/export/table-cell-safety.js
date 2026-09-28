import { loadPdfjs } from '../rendering/pdfjs.js';

function finite(value){return Number.isFinite(Number(value));}
function contains(value,min,max,tolerance=0){return value>=min-tolerance&&value<=max+tolerance;}
function rectOfBlock(block){
  const b=block?.bounds;if(!b)return null;
  const x=Number(b.x),y=Number(b.y),width=Number(b.width),height=Number(b.height);
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
  return {left:x,right:x+width,bottom:y,top:y+height,width,height,cx:x+width/2,cy:y+height/2};
}

export function inferContainingTableCell(shapes=[],rect,{pageWidth=595,pageHeight=842,padding=2.5}={}){
  if(!rect)return null;
  const pw=Math.max(1,Number(pageWidth)||595),ph=Math.max(1,Number(pageHeight)||842);
  const candidates=[];
  for(const shape of shapes||[]){
    const left=Number(shape?.left),right=Number(shape?.right),bottom=Number(shape?.bottom),top=Number(shape?.top);
    if(![left,right,bottom,top].every(Number.isFinite)||right<=left||top<=bottom)continue;
    const width=right-left,height=top-bottom;
    if(width<18||height<10||width>pw*.92||height>Math.min(200,ph*.30))continue;
    if(!contains(rect.cx,left,right,2)||!contains(rect.cy,bottom,top,2))continue;
    if(rect.left<left-3||rect.right>right+3||rect.bottom<bottom-3||rect.top>top+3)continue;
    if(shape.kind==='CELL'||(width>=18&&height>=10))candidates.push({left,right,bottom,top,width,height,area:width*height,confidence:'RECTANGULAR_CELL'});
  }
  if(candidates.length){
    candidates.sort((a,b)=>a.area-b.area);
    const cell=candidates[0];return {...cell,padding};
  }

  const vertical=(shapes||[]).filter(shape=>{
    const width=Number(shape?.right)-Number(shape?.left),height=Number(shape?.top)-Number(shape?.bottom);
    const x=(Number(shape?.left)+Number(shape?.right))/2;
    return finite(x)&&width<=3&&height>=Math.max(10,rect.height*.8)&&contains(rect.cy,Number(shape.bottom),Number(shape.top),3);
  });
  const horizontal=(shapes||[]).filter(shape=>{
    const width=Number(shape?.right)-Number(shape?.left),height=Number(shape?.top)-Number(shape?.bottom);
    const y=(Number(shape?.bottom)+Number(shape?.top))/2;
    return finite(y)&&height<=3&&width>=Math.max(14,rect.width*.8)&&contains(rect.cx,Number(shape.left),Number(shape.right),3);
  });
  const xs=vertical.map(shape=>(Number(shape.left)+Number(shape.right))/2).filter(Number.isFinite);
  const ys=horizontal.map(shape=>(Number(shape.bottom)+Number(shape.top))/2).filter(Number.isFinite);
  const left=Math.max(-Infinity,...xs.filter(x=>x<rect.cx-1));
  const right=Math.min(Infinity,...xs.filter(x=>x>rect.cx+1));
  const bottom=Math.max(-Infinity,...ys.filter(y=>y<rect.cy-1));
  const top=Math.min(Infinity,...ys.filter(y=>y>rect.cy+1));
  if(![left,right,bottom,top].every(Number.isFinite)||right<=left||top<=bottom)return null;
  const width=right-left,height=top-bottom;
  if(width<18||height<10||width>pw*.92||height>Math.min(200,ph*.30))return null;
  if(rect.left<left-3||rect.right>right+3||rect.bottom<bottom-3||rect.top>top+3)return null;
  return {left,right,bottom,top,width,height,area:width*height,padding,confidence:'GRID_BOUNDARIES'};
}

export function replacementWidthLimit(block,lineIndex,visualWidth,{maxVisualOverflow=1.12}={}){
  const line=block?.lines?.[lineIndex]||block?.lines?.at?.(-1);
  const lineX=Number.isFinite(Number(line?.minX))?Number(line.minX):Number(block?.bounds?.x);
  const cell=block?.tableCell;
  if(cell&&Number.isFinite(lineX)&&Number.isFinite(Number(cell.right))){
    const padding=Math.max(1,Number(cell.padding)||2.5);
    const available=Math.max(0,Number(cell.right)-padding-lineX);
    return {limit:available,reason:'TABLE_CELL_WIDTH_OVERFLOW',cellAware:true,cell};
  }
  return {limit:Math.max(0,Number(visualWidth)||0)*maxVisualOverflow,reason:'LAYOUT_COLLISION',cellAware:false,cell:null};
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
