import { loadPdfjs } from '../rendering/pdfjs.js';
import { assessVisualGeometry, compareVisualGeometry } from './visual-geometry-validator.js';

function uniquePageMappings(mappings=[]){
  const out=[],seen=new Set();
  for(const raw of mappings||[]){
    const outputPageIndex=Number(raw?.outputPageIndex??raw?.pageIndex);
    const baselinePageIndex=Number(raw?.baselinePageIndex??raw?.sourcePageIndex??outputPageIndex);
    if(!Number.isInteger(outputPageIndex)||outputPageIndex<0||seen.has(outputPageIndex))continue;
    seen.add(outputPageIndex);out.push({outputPageIndex,baselinePageIndex:Number.isInteger(baselinePageIndex)&&baselinePageIndex>=0?baselinePageIndex:outputPageIndex});
  }
  return out;
}

function rectangleFromTextItem(pdfjs,viewport,item,index){
  const tr=item?.transform;
  if(!Array.isArray(tr)||tr.length<6||!String(item?.str||'').trim())return null;
  const m=pdfjs.Util.transform(viewport.transform,tr);
  const baselineX=Number(m[4]),baselineY=Number(m[5]);
  const xScale=Math.hypot(Number(m[0])||0,Number(m[1])||0);
  const yScale=Math.hypot(Number(m[2])||0,Number(m[3])||0);
  if(!Number.isFinite(baselineX)||!Number.isFinite(baselineY)||xScale<=0)return null;
  const ux=(Number(m[0])||0)/xScale,uy=(Number(m[1])||0)/xScale;
  const vx=-uy,vy=ux;
  const width=Math.max(1,Math.abs(Number(item?.width)||0)*Number(viewport.scale||1));
  const height=Math.max(1,yScale||Math.abs(Number(item?.height)||0)*Number(viewport.scale||1)||xScale);
  const ascent=height*.82,descent=height*.22;
  const points=[];
  for(const along of [0,width])for(const vertical of [-descent,ascent])points.push({x:baselineX+ux*along+vx*vertical,y:baselineY+uy*along+vy*vertical});
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {index,text:String(item.str),left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys),baseline:baselineY,angle:Math.atan2(uy,ux)};
}

async function analyzePdfPages(bytes,pageIndexes){
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const doc=await task.promise;const pages=new Map();
  try{
    for(const pageIndex of [...new Set(pageIndexes||[])] ){
      if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.numPages)continue;
      const page=await doc.getPage(pageIndex+1),viewport=page.getViewport({scale:1}),content=await page.getTextContent({disableNormalization:false});
      const rectangles=(content.items||[]).map((item,index)=>rectangleFromTextItem(pdfjs,viewport,item,index)).filter(Boolean);
      pages.set(pageIndex,{pageIndex,width:viewport.width,height:viewport.height,geometry:assessVisualGeometry(rectangles,{width:viewport.width,height:viewport.height}),rectangles});
    }
    return {pageCount:doc.numPages,pages};
  }finally{
    try{await doc.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }
}

export async function validateVisualLayout(bytes,mappings,{baselineBytes=null}={}){
  const normalized=uniquePageMappings(mappings);
  if(!normalized.length)return {ok:true,pages:[],failures:[],skipped:true};
  try{
    const output=await analyzePdfPages(bytes,normalized.map(item=>item.outputPageIndex));
    const baseline=baselineBytes?await analyzePdfPages(baselineBytes,normalized.map(item=>item.baselinePageIndex)):null;
    const pages=[],failures=[];
    for(const mapping of normalized){
      const current=output.pages.get(mapping.outputPageIndex);
      if(!current){failures.push({code:'VISUAL_PAGE_MISSING',pageIndex:mapping.outputPageIndex});continue;}
      const before=baseline?.pages.get(mapping.baselinePageIndex)?.geometry||null;
      const comparison=compareVisualGeometry(current.geometry,before);
      pages.push({outputPageIndex:mapping.outputPageIndex,baselinePageIndex:mapping.baselinePageIndex,comparison});
      for(const failure of comparison.failures)failures.push({...failure,pageIndex:mapping.outputPageIndex,baselinePageIndex:mapping.baselinePageIndex});
    }
    return {ok:failures.length===0,pages,failures,outputPageCount:output.pageCount,baselinePageCount:baseline?.pageCount??null};
  }catch(error){
    return {ok:false,pages:[],failures:[{code:'VISUAL_VALIDATOR_FAILED',error:String(error?.stack||error)}],error:String(error?.stack||error)};
  }
}
