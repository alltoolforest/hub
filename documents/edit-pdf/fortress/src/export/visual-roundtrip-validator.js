import { loadPdfjs } from '../rendering/pdfjs.js';
import { assessVisualGeometry, compareVisualGeometry } from './visual-geometry-validator.js';

function finite(value){return Number.isFinite(Number(value));}
function multiply(m1,m2){
  return [
    m1[0]*m2[0]+m1[2]*m2[1],
    m1[1]*m2[0]+m1[3]*m2[1],
    m1[0]*m2[2]+m1[2]*m2[3],
    m1[1]*m2[2]+m1[3]*m2[3],
    m1[0]*m2[4]+m1[2]*m2[5]+m1[4],
    m1[1]*m2[4]+m1[3]*m2[5]+m1[5],
  ];
}
function normalizeAngle(value){
  let angle=Number(value)||0;
  while(angle>Math.PI)angle-=Math.PI*2;
  while(angle<-Math.PI)angle+=Math.PI*2;
  return angle;
}

export function textItemToVisualRect(item,viewport){
  if(!item||!viewport||!String(item.str||'').trim())return null;
  const transform=Array.isArray(item.transform)?item.transform:null;
  if(!transform||transform.length<6)return null;
  const matrix=multiply(viewport.transform,transform);
  const x=matrix[4],baseline=matrix[5];
  const angle=normalizeAngle(Math.atan2(matrix[1],matrix[0]));
  const fontHeight=Math.max(1,Math.hypot(matrix[2],matrix[3])||Math.hypot(matrix[0],matrix[1])||Number(item.height)||1);
  const rawWidth=Math.abs(Number(item.width)||0)*Math.max(0.01,Math.hypot(viewport.transform[0],viewport.transform[1])||1);
  const width=Math.max(1,rawWidth||String(item.str).length*fontHeight*.48);
  const ascent=fontHeight*.82,descent=fontHeight*.22;
  if(![x,baseline,width,fontHeight].every(finite))return null;
  if(Math.abs(angle)>.12){
    // Rotated text is reported but collision enforcement remains conservative;
    // assessVisualGeometry already avoids rejecting rotated intersections.
    const right=x+Math.cos(angle)*width;
    const left=Math.min(x,right),maxRight=Math.max(x,right);
    return {text:item.str,left,top:baseline-ascent,right:maxRight,bottom:baseline+descent,baseline,angle};
  }
  return {text:item.str,left:x,top:baseline-ascent,right:x+width,bottom:baseline+descent,baseline,angle};
}

export async function extractVisualGeometry(bytes,pageIndexes=[]){
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const doc=await task.promise;
  const pages=new Map();
  try{
    const indexes=[...new Set((pageIndexes||[]).map(Number).filter(index=>Number.isInteger(index)&&index>=0&&index<doc.numPages))];
    for(const pageIndex of indexes){
      const page=await doc.getPage(pageIndex+1);
      const viewport=page.getViewport({scale:1});
      const tc=await page.getTextContent({disableNormalization:false});
      const rectangles=tc.items.map(item=>textItemToVisualRect(item,viewport)).filter(Boolean);
      pages.set(pageIndex,assessVisualGeometry(rectangles,{width:viewport.width,height:viewport.height}));
    }
  }finally{
    try{await doc.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }
  return pages;
}

export async function validateVisualRoundTrip(outputBytes,{baselineBytes=null,pagePairs=[]}={}){
  const pairs=[];
  const seen=new Set();
  for(const value of pagePairs||[]){
    const outputPageIndex=Number(value?.outputPageIndex);
    const baselinePageIndex=Number(value?.baselinePageIndex);
    if(!Number.isInteger(outputPageIndex)||outputPageIndex<0)continue;
    const key=`${outputPageIndex}:${Number.isInteger(baselinePageIndex)?baselinePageIndex:'none'}`;
    if(seen.has(key))continue;
    seen.add(key);pairs.push({outputPageIndex,baselinePageIndex:Number.isInteger(baselinePageIndex)&&baselinePageIndex>=0?baselinePageIndex:null});
  }
  if(!pairs.length)return {ok:true,pages:[],failures:[]};
  const outputIndexes=pairs.map(pair=>pair.outputPageIndex);
  const baselineIndexes=pairs.map(pair=>pair.baselinePageIndex).filter(Number.isInteger);
  const output=await extractVisualGeometry(outputBytes,outputIndexes);
  const baseline=baselineBytes?await extractVisualGeometry(baselineBytes,baselineIndexes):new Map();
  const pages=[],failures=[];
  for(const pair of pairs){
    const outputGeometry=output.get(pair.outputPageIndex)||assessVisualGeometry([],{width:1,height:1});
    const baselineGeometry=Number.isInteger(pair.baselinePageIndex)?baseline.get(pair.baselinePageIndex)||null:null;
    const compared=compareVisualGeometry(outputGeometry,baselineGeometry);
    const result={...pair,ok:compared.ok,failures:compared.failures,output:outputGeometry,baseline:baselineGeometry};
    pages.push(result);
    for(const failure of compared.failures)failures.push({...failure,outputPageIndex:pair.outputPageIndex,baselinePageIndex:pair.baselinePageIndex});
  }
  return {ok:failures.length===0,pages,failures};
}
