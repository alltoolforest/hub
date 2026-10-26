import { PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef, decodePDFRawStream } from '../core/pdf-lib.js';
import { parseContentStream } from '../parser/content-stream-parser.js';
import { interpretTextRuns } from '../text/text-state.js';
import { inspectFontResourceFromResources } from '../fonts/font-inspector.js';
import { rewriteByteRanges } from '../mutation/content-stream-editor.js';
import { IDENTITY, multiply, applyToPoint, invert } from '../utils/matrices.js';

const EMBEDDED_PREFIX='EmbeddedPdfPage-';
const MAX_DEPTH=12;
let cloneCounter=0;

function nameOf(value){
  if(!value)return null;
  try{return (typeof value.asString==='function'?value.asString():value.toString()).replace(/^\//,'');}catch{return null;}
}
function numberOf(value){
  try{const n=typeof value?.asNumber==='function'?value.asNumber():Number(value?.toString?.());return Number.isFinite(n)?n:null;}catch{return null;}
}
function lookup(ctx,value){
  if(!value)return null;
  if(value instanceof PDFDict||value instanceof PDFRawStream||value instanceof PDFArray)return value;
  try{return ctx.lookup(value);}catch{return null;}
}
function arrayNumbers(ctx,value,count){
  const arr=lookup(ctx,value);
  if(!(arr instanceof PDFArray)||arr.size()<count)return null;
  const out=[];
  for(let i=0;i<count;i++){const n=numberOf(arr.get(i));if(!Number.isFinite(n))return null;out.push(n);}
  return out;
}
function formBBox(ctx,raw){
  const v=arrayNumbers(ctx,raw?.dict?.get?.(PDFName.of('BBox')),4);
  if(!v)return null;
  return {left:Math.min(v[0],v[2]),bottom:Math.min(v[1],v[3]),right:Math.max(v[0],v[2]),top:Math.max(v[1],v[3])};
}
function formMatrix(ctx,raw){return arrayNumbers(ctx,raw?.dict?.get?.(PDFName.of('Matrix')),6)||IDENTITY.slice();}
function rectIntersection(a,b){
  const r={left:Math.max(a.left,b.left),bottom:Math.max(a.bottom,b.bottom),right:Math.min(a.right,b.right),top:Math.min(a.top,b.top)};
  return r.right>r.left+.01&&r.top>r.bottom+.01?r:null;
}
function rectContains(outer,inner,t=.25){return inner.left>=outer.left-t&&inner.right<=outer.right+t&&inner.bottom>=outer.bottom-t&&inner.top<=outer.top+t;}
function transformRect(rect,m){
  const pts=[applyToPoint(m,rect.left,rect.bottom),applyToPoint(m,rect.left,rect.top),applyToPoint(m,rect.right,rect.bottom),applyToPoint(m,rect.right,rect.top)];
  return {left:Math.min(...pts.map(p=>p.x)),bottom:Math.min(...pts.map(p=>p.y)),right:Math.max(...pts.map(p=>p.x)),top:Math.max(...pts.map(p=>p.y))};
}
function untransformRect(rect,m){
  let inv;try{inv=invert(m);}catch{return null;}
  return transformRect(rect,inv);
}
function textOutsideVisibleCrop(a,b){
  const left=Math.max(a.left,b.left),right=Math.min(a.right,b.right);
  const bottom=Math.max(a.bottom,b.bottom),top=Math.min(a.top,b.top);
  const overlapW=right-left,overlapH=top-bottom;
  if(overlapW<=.08||overlapH<=.08)return true;
  const ownW=Math.max(.01,a.right-a.left),ownH=Math.max(.01,a.top-a.bottom);
  return overlapW/ownW<.01||overlapH/ownH<.01;
}
function rawDecoded(ctx,ref){
  const raw=ref instanceof PDFRawStream?ref:lookup(ctx,ref);
  if(!(raw instanceof PDFRawStream))return null;
  try{return {raw,bytes:new Uint8Array(decodePDFRawStream(raw).getBytes())};}catch{return null;}
}
function cleanStreamDict(ctx,raw,crop,resourcesOverride=null){
  const dict=raw.dict.clone(ctx);
  for(const k of ['Length','Filter','DecodeParms','DL','F','FFilter','FDecodeParms'])dict.delete(PDFName.of(k));
  dict.set(PDFName.of('BBox'),ctx.obj([crop.left,crop.bottom,crop.right,crop.top]));
  if(resourcesOverride)dict.set(PDFName.of('Resources'),resourcesOverride);
  return dict;
}
function runBounds(run){
  const trm=run?.trm;
  const fs=Math.abs(Number(run?.fontSize)||0);
  const hz=Math.abs((Number(run?.horizontalScale)||100)/100);
  const adv=Number(run?.advance)||0;
  if(!trm||trm.length<6||fs<.01||hz<.01)return null;
  const xScale=fs*hz;
  const ux={x:trm[0]/xScale,y:trm[1]/xScale};
  const start={x:trm[4],y:trm[5]};
  const end={x:start.x+ux.x*adv,y:start.y+ux.y*adv};
  const vy={x:trm[2],y:trm[3]};
  const pts=[];
  for(const p of [start,end]){
    pts.push({x:p.x-vy.x*.30,y:p.y-vy.y*.30});
    pts.push({x:p.x+vy.x*.92,y:p.y+vy.y*.92});
  }
  return {left:Math.min(...pts.map(p=>p.x)),bottom:Math.min(...pts.map(p=>p.y)),right:Math.max(...pts.map(p=>p.x)),top:Math.max(...pts.map(p=>p.y))};
}
function neutralTextInstruction(instr,run){
  const fs=Number(run?.fontSize)||0;
  const hz=(Number(run?.horizontalScale)||100)/100;
  if(Math.abs(fs*hz)<1e-8)return null;
  const tj=-(Number(run?.advance)||0)*1000/(fs*hz);
  const n=Number.isFinite(tj)?String(Math.round(tj*1e6)/1e6):null;
  if(n==null)return null;
  if(instr.op==="'")return `T* [${n}] TJ`;
  if(instr.op==='"'){
    const a=instr.values||[];
    const tw=Number(a[0])||0,tc=Number(a[1])||0;
    return `${tw} Tw ${tc} Tc T* [${n}] TJ`;
  }
  return `[${n}] TJ`;
}
function childForm(ctx,resources,resourceName){
  if(!(resources instanceof PDFDict))return null;
  const xobjects=resources.lookup(PDFName.of('XObject'));
  if(!(xobjects instanceof PDFDict))return null;
  const ref=xobjects.get(PDFName.of(resourceName));
  if(!ref)return null;
  const raw=lookup(ctx,ref);
  if(!(raw instanceof PDFRawStream))return null;
  const subtype=nameOf(raw.dict.lookup(PDFName.of('Subtype')));
  if(subtype!=='Form')return null;
  return {xobjects,ref,raw};
}
function nextResourceName(xobjects){
  for(let i=0;i<10000;i++){
    const name=`ATFSlice${++cloneCounter}`;
    if(!xobjects.get(PDFName.of(name)))return name;
  }
  throw new Error('SLICE_RESOURCE_NAME_EXHAUSTED');
}

async function cloneSanitizedForm(doc,sourceRef,crop,{depth=0,cache,warnings,metrics}={}){
  const ctx=doc.context;
  if(depth>MAX_DEPTH){warnings.push({code:'EXTRACTION_CLEANUP_DEPTH_LIMIT'});return sourceRef;}
  const decoded=rawDecoded(ctx,sourceRef);
  if(!decoded){warnings.push({code:'EXTRACTION_CLEANUP_STREAM_UNREADABLE'});return sourceRef;}
  const ownBBox=formBBox(ctx,decoded.raw);
  if(!ownBBox)return sourceRef;
  const safeCrop=rectIntersection(ownBBox,crop);
  if(!safeCrop)return null;
  const key=`${sourceRef?.toString?.()||String(sourceRef)}:${[safeCrop.left,safeCrop.bottom,safeCrop.right,safeCrop.top].map(v=>v.toFixed(3)).join(',')}`;
  if(cache?.has(key))return cache.get(key);

  let parsed;
  try{parsed=parseContentStream(decoded.bytes);}catch{
    warnings.push({code:'EXTRACTION_CLEANUP_PARSE_SKIPPED'});
    return sourceRef;
  }
  const instructions=parsed.instructions;
  const resources=decoded.raw.dict.lookup(PDFName.of('Resources'));
  const fontCache=new Map();
  const fontResolver=(name)=>{
    if(!name||!(resources instanceof PDFDict))return null;
    if(!fontCache.has(name))fontCache.set(name,inspectFontResourceFromResources(doc,resources,name));
    return fontCache.get(name);
  };
  let runs=[];
  try{runs=interpretTextRuns(instructions,{fontResolver});}catch{}
  const runByOperator=new Map(runs.map(r=>[r.operatorIndex,r]));
  const edits=[];
  let ctm=IDENTITY.slice();
  const gs=[];
  let resourcesClone=null,xobjectsClone=null;

  for(let i=0;i<instructions.length;i++){
    const instr=instructions[i],a=instr.values||[];
    if(instr.op==='q'){gs.push(ctm.slice());continue;}
    if(instr.op==='Q'){const saved=gs.pop();if(saved)ctm=saved;continue;}
    if(instr.op==='cm'&&a.length>=6){ctm=multiply([a[0],a[1],a[2],a[3],a[4],a[5]],ctm);continue;}

    const run=runByOperator.get(i);
    if(run){
      const bounds=runBounds(run);
      if(bounds&&textOutsideVisibleCrop(bounds,safeCrop)){
        const replacement=neutralTextInstruction(instr,run);
        if(replacement!=null){edits.push({start:instr.start,end:instr.end,replacement});metrics.neutralizedTextRuns++;}
      }
      continue;
    }

    if(instr.op!=='Do'||!a[0])continue;
    const resourceName=String(a[0]);
    const child=childForm(ctx,resources,resourceName);
    if(!child)continue;
    const childBBox=formBBox(ctx,child.raw);
    if(!childBBox)continue;
    const childToParent=multiply(formMatrix(ctx,child.raw),ctm);
    const parentBounds=transformRect(childBBox,childToParent);
    const visible=rectIntersection(parentBounds,safeCrop);
    if(!visible){edits.push({start:instr.start,end:instr.end,replacement:''});metrics.removedFormInvocations++;continue;}
    if(rectContains(safeCrop,parentBounds,.35))continue;
    const childCropRaw=untransformRect(visible,childToParent);
    if(!childCropRaw)continue;
    const childCrop=rectIntersection(childBBox,childCropRaw);
    if(!childCrop)continue;
    const childRef=await cloneSanitizedForm(doc,child.ref,childCrop,{depth:depth+1,cache,warnings,metrics});
    if(!childRef){edits.push({start:instr.start,end:instr.end,replacement:''});metrics.removedFormInvocations++;continue;}
    if(childRef===child.ref)continue;
    if(!resourcesClone){
      resourcesClone=resources instanceof PDFDict?resources.clone(ctx):ctx.obj({});
      const base=resources instanceof PDFDict?resources.lookup(PDFName.of('XObject')):null;
      xobjectsClone=base instanceof PDFDict?base.clone(ctx):ctx.obj({});
      resourcesClone.set(PDFName.of('XObject'),xobjectsClone);
    }
    const newName=nextResourceName(xobjectsClone);
    xobjectsClone.set(PDFName.of(newName),childRef);
    edits.push({start:instr.start,end:instr.end,replacement:`/${newName} Do`});
    metrics.croppedFormInvocations++;
  }

  let bytes=decoded.bytes;
  if(edits.length){
    try{bytes=rewriteByteRanges(decoded.bytes,edits);}catch{
      warnings.push({code:'EXTRACTION_CLEANUP_REWRITE_SKIPPED'});
      return sourceRef;
    }
  }
  const dict=cleanStreamDict(ctx,decoded.raw,safeCrop,resourcesClone);
  let stream;
  if(typeof ctx.flateStream==='function'){
    const options={};
    for(const [key,value] of dict.entries())options[nameOf(key)]=value;
    stream=ctx.flateStream(bytes,options);
  }else stream=PDFRawStream.of(dict,bytes);
  const newRef=ctx.register(stream);
  cache?.set(key,newRef);
  metrics.clonedForms++;
  return newRef;
}

export async function embedExtractionCleanPageSlice(doc,page,{left=0,bottom=0,right,top}={}){
  if(!(top>bottom)||!(right>left))return null;
  const embedded=await doc.embedPage(page,{left,bottom,right,top});
  // Force the Form XObject into the current context now. pdf-lib otherwise
  // defers embedding until save(), which is too late to remove clipped text
  // from the generated Form stream.
  await embedded.embed();
  const ctx=doc.context;
  const sourceRef=embedded.ref;
  const raw=lookup(ctx,sourceRef);
  if(!(raw instanceof PDFRawStream))return embedded;
  const crop=formBBox(ctx,raw);
  if(!crop)return embedded;
  const warnings=[];
  const metrics={pages:0,rootForms:1,clonedForms:0,neutralizedTextRuns:0,removedFormInvocations:0,croppedFormInvocations:0};
  const cleanedRef=await cloneSanitizedForm(doc,sourceRef,crop,{depth:0,cache:new Map(),warnings,metrics});
  if(cleanedRef&&cleanedRef!==sourceRef){
    const cleanedRaw=lookup(ctx,cleanedRef);
    if(cleanedRaw instanceof PDFRawStream)ctx.assign(sourceRef,cleanedRaw);
  }
  return embedded;
}

export async function sanitizeEmbeddedPageSlices(doc){
  const warnings=[];
  const metrics={pages:0,rootForms:0,clonedForms:0,neutralizedTextRuns:0,removedFormInvocations:0,croppedFormInvocations:0};
  const cache=new Map();
  const ctx=doc.context;
  for(let pageIndex=0;pageIndex<doc.getPageCount();pageIndex++){
    const page=doc.getPage(pageIndex);
    const resources=page.node.Resources();
    if(!(resources instanceof PDFDict))continue;
    const xobjects=resources.lookup(PDFName.of('XObject'));
    if(!(xobjects instanceof PDFDict))continue;
    const replacements=[];
    for(const [nameObj,ref] of xobjects.entries()){
      const resourceName=nameOf(nameObj);
      if(!resourceName?.startsWith(EMBEDDED_PREFIX))continue;
      const raw=lookup(ctx,ref);
      if(!(raw instanceof PDFRawStream)||nameOf(raw.dict.lookup(PDFName.of('Subtype')))!=='Form')continue;
      const crop=formBBox(ctx,raw);if(!crop)continue;
      const newRef=await cloneSanitizedForm(doc,ref,crop,{depth:0,cache,warnings,metrics});
      if(newRef&&newRef!==ref)replacements.push({nameObj,newRef});
      metrics.rootForms++;
    }
    if(!replacements.length)continue;
    const xobjectsClone=xobjects.clone(ctx);
    for(const r of replacements)xobjectsClone.set(r.nameObj,r.newRef);
    const resourcesClone=resources.clone(ctx);resourcesClone.set(PDFName.of('XObject'),xobjectsClone);
    page.node.set(PDFName.of('Resources'),resourcesClone);
    metrics.pages++;
  }
  return {warnings,metrics};
}
