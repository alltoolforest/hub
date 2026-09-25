import { getDocument } from '../vendor/pdf.mjs';
import { configureCascadePageGeometry } from './layout/reflow-planner.js';
import { attachSmartLineInsertion as attachV4 } from './smart-line-insertion-v4.js';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function median(values,fallback=12){
  const list=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!list.length)return fallback;
  const m=Math.floor(list.length/2);
  return list.length%2?list[m]:(list[m-1]+list[m])/2;
}

function geometryFromTextItems(pageIndex,width,height,rotation,items){
  const rects=[];
  const sizes=[];
  for(const item of items||[]){
    if(!item?.str||!String(item.str).trim())continue;
    const t=item.transform||[];
    const x=Number(t[4]),y=Number(t[5]);
    const size=Math.max(1,Math.hypot(Number(t[0])||0,Number(t[1])||0));
    const w=Math.max(1,Number(item.width)||Array.from(String(item.str)).length*size*.5);
    if(![x,y,size,w].every(Number.isFinite))continue;
    rects.push({left:x,right:x+w,bottom:y-size*.30,top:y+size*.90});
    sizes.push(size);
  }
  if(!rects.length){
    return {pageIndex,width,height,rotation,textTopY:null,textBottomY:null,bodyTopY:null,footerGuardTop:null,contentBand:null,confidence:'NO_TEXT'};
  }

  const size=clamp(median(sizes,12),6,72);
  const textTopY=Math.max(...rects.map(r=>r.top));
  const textBottomY=Math.min(...rects.map(r=>r.bottom));
  const minX=Math.min(...rects.map(r=>r.left));
  const maxX=Math.max(...rects.map(r=>r.right));
  const padding=Math.max(12,size);
  const minStaticMargin=Math.max(10,size*.65);
  let left=clamp(minX-padding,0,width),right=clamp(maxX+padding,0,width);
  if(left<minStaticMargin)left=0;
  if(width-right<minStaticMargin)right=width;
  if(right-left<Math.max(120,width*.30)){left=0;right=width;}

  const safetyGap=Math.max(4,size*.35);
  const bottomMargin=Math.max(12,size*.8);
  const topMargin=Math.max(24,size*1.6);
  const clearance=Math.max(6,size*.60);
  const maxGuardHeight=Math.max(36,Math.min(72,height*.085));
  const candidate=Math.min(maxGuardHeight,textBottomY-clearance);
  const footerGuardTop=Number.isFinite(candidate)&&candidate>bottomMargin+2
    ?clamp(candidate,bottomMargin,Math.min(height*.18,textBottomY-clearance))
    :bottomMargin;
  const bodyTopY=clamp(textTopY+safetyGap,footerGuardTop+40,height-topMargin);

  return {
    pageIndex,width,height,rotation,textTopY,textBottomY,bodyTopY,footerGuardTop,
    topMargin,bottomMargin,safetyGap,contentBand:{left,right,width:right-left},
    confidence:'PDFJS_TEXT_BOUNDS',
  };
}

async function measureDocument(fileOrBytes){
  let bytes;
  if(fileOrBytes instanceof Uint8Array)bytes=fileOrBytes.slice();
  else if(fileOrBytes instanceof ArrayBuffer)bytes=new Uint8Array(fileOrBytes.slice(0));
  else bytes=new Uint8Array(await fileOrBytes.arrayBuffer());

  const task=getDocument({data:bytes});
  const pdf=await task.promise;
  const pages=[];
  try{
    for(let index=0;index<pdf.numPages;index++){
      const page=await pdf.getPage(index+1);
      const viewport=page.getViewport({scale:1});
      const content=await page.getTextContent();
      pages.push(geometryFromTextItems(index,viewport.width,viewport.height,viewport.rotation||0,content.items||[]));
      page.cleanup?.();
    }
  }finally{
    try{await pdf.destroy();}catch{}
  }
  return pages;
}

export function attachSmartLineInsertion(options){
  const v4=attachV4(options);
  let preparedPages=[];
  return {
    async prepareDocument(fileOrBytes){
      try{
        preparedPages=await measureDocument(fileOrBytes);
        configureCascadePageGeometry(preparedPages);
        return preparedPages;
      }catch(error){
        preparedPages=[];
        configureCascadePageGeometry([]);
        console.warn('Cascade geometry unavailable; conservative page flow remains active.',error);
        return [];
      }
    },
    getPreparedPages(){return preparedPages.map(page=>({...page}));},
    destroy(){
      preparedPages=[];
      configureCascadePageGeometry([]);
      v4?.destroy?.();
    },
  };
}
