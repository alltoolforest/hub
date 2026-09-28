function finite(value){return Number.isFinite(Number(value));}
function contains(value,min,max,tolerance=0){return value>=min-tolerance&&value<=max+tolerance;}

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

export function inferContainingTableCellAtPoint(shapes=[],point,{pageWidth=595,pageHeight=842,padding=2.5}={}){
  const x=Number(point?.x),y=Number(point?.y);
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const rect={left:x-.5,right:x+.5,bottom:y-.5,top:y+.5,width:1,height:1,cx:x,cy:y};
  return inferContainingTableCell(shapes,rect,{pageWidth,pageHeight,padding});
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

export function tableCellInsertionLimits(cell,{x,y,fontSize=12,lineHeight=null,lineCount=1,minWidth=8}={}){
  if(!cell)return {ok:true,cellAware:false,availableWidth:Infinity,reason:null};
  const left=Number(cell.left),right=Number(cell.right),bottom=Number(cell.bottom),top=Number(cell.top);
  const px=Number(x),py=Number(y),size=Math.max(1,Number(fontSize)||12);
  const leading=Math.max(size,Number(lineHeight)||size*1.2),count=Math.max(1,Math.floor(Number(lineCount)||1));
  if(![left,right,bottom,top,px,py].every(Number.isFinite)||right<=left||top<=bottom){
    return {ok:false,cellAware:true,availableWidth:0,reason:'TABLE_CELL_GEOMETRY_INVALID'};
  }
  const padding=Math.max(1,Number(cell.padding)||2.5);
  const innerLeft=left+padding,innerRight=right-padding,innerBottom=bottom+padding,innerTop=top-padding;
  const availableWidth=Math.max(0,innerRight-px);
  const textTop=py+size*.90;
  const textBottom=py-(count-1)*leading-size*.28;
  if(px<innerLeft-.5||px>innerRight+.5||availableWidth<Math.max(1,Number(minWidth)||8)){
    return {ok:false,cellAware:true,availableWidth,reason:'TABLE_CELL_INSERT_WIDTH_UNSAFE',innerLeft,innerRight,innerBottom,innerTop,textTop,textBottom};
  }
  if(textTop>innerTop+.5){
    return {ok:false,cellAware:true,availableWidth,reason:'TABLE_CELL_INSERT_TOP_OVERFLOW',innerLeft,innerRight,innerBottom,innerTop,textTop,textBottom};
  }
  if(textBottom<innerBottom-.5){
    return {ok:false,cellAware:true,availableWidth,reason:'TABLE_CELL_INSERT_BOTTOM_OVERFLOW',innerLeft,innerRight,innerBottom,innerTop,textTop,textBottom};
  }
  return {ok:true,cellAware:true,availableWidth,reason:null,innerLeft,innerRight,innerBottom,innerTop,textTop,textBottom};
}
