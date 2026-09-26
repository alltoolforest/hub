import { loadPdfjs } from '../fortress/src/rendering/pdfjs.js';

function meaningfulChars(items){
  return (items||[]).reduce((sum,item)=>sum+String(item?.str||'').replace(/\s+/g,'').length,0);
}

function imageOpCount(pdfjs,operatorList){
  const imageOps=new Set([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintJpegXObject,
    pdfjs.OPS.paintImageMaskXObject,
    pdfjs.OPS.paintInlineImageXObject,
  ].filter(Number.isFinite));
  return (operatorList?.fnArray||[]).reduce((sum,op)=>sum+(imageOps.has(op)?1:0),0);
}

function adaptiveSampleLimit(pageCount){
  if(pageCount<=6)return pageCount;
  return Math.min(24,Math.max(6,Math.ceil(pageCount/8)));
}

function classifyEvidence({chars,textItems,imageOps}){
  // Per-page OCR ownership is intentionally strict. Only pages with image
  // evidence and no selectable text are routed automatically to OCR. A native
  // title/signature page with a logo plus even sparse real text remains mixed
  // and therefore stays on the conservative Fortress/native path.
  if(imageOps>0&&chars===0&&textItems===0){
    return {kind:'scanned',confidence:1,reason:'IMAGE_ONLY_PAGE'};
  }
  if(chars>=80||textItems>=12){
    if(imageOps>0&&chars<180)return {kind:'mixed',confidence:.78,reason:'SELECTABLE_TEXT_WITH_IMAGES'};
    return {kind:'native',confidence:.92,reason:'SUBSTANTIAL_SELECTABLE_TEXT'};
  }
  if(imageOps>0&&chars>0)return {kind:'mixed',confidence:.72,reason:'SPARSE_SELECTABLE_TEXT_WITH_IMAGES'};
  if(chars>0)return {kind:'native',confidence:.74,reason:'SPARSE_SELECTABLE_TEXT'};
  return {kind:'unknown',confidence:.25,reason:'NO_TEXT_OR_IMAGE_EVIDENCE'};
}

export async function createPdfPageClassifier(source){
  const bytes=source instanceof Uint8Array?new Uint8Array(source):new Uint8Array(await source.arrayBuffer());
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  const pageCount=pdf.numPages;
  const cache=new Map();
  let destroyed=false;

  async function classifyPage(pageIndex){
    if(destroyed)throw new Error('PDF page classifier has been destroyed.');
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=pageCount)throw new RangeError('PDF page index is out of range.');
    if(cache.has(pageIndex))return cache.get(pageIndex);
    const page=await pdf.getPage(pageIndex+1);
    const [textContent,ops]=await Promise.all([page.getTextContent(),page.getOperatorList()]);
    const chars=meaningfulChars(textContent.items);
    const imageOps=imageOpCount(pdfjs,ops);
    const textItems=(textContent.items||[]).filter(item=>String(item?.str||'').trim()).length;
    const decision=classifyEvidence({chars,textItems,imageOps});
    const result={pageIndex,...decision,chars,textItems,imageOps};
    cache.set(pageIndex,result);
    return result;
  }

  async function classifyAll({onProgress=()=>{}}={}){
    const pages=[];
    for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
      pages.push(await classifyPage(pageIndex));
      onProgress({pageIndex,pageCount,progress:(pageIndex+1)/Math.max(1,pageCount)});
    }
    return pages;
  }

  async function destroy(){
    if(destroyed)return;
    destroyed=true;
    cache.clear();
    try{await pdf.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }

  return {pageCount,classifyPage,classifyAll,destroy};
}

export async function classifyPdfForEditing(source,{sampleLimit=null}={}){
  const classifier=await createPdfPageClassifier(source);
  try{
    const pageCount=classifier.pageCount;
    const sampled=[];
    const sampleIndexes=[];
    const requested=Number.isInteger(sampleLimit)&&sampleLimit>0?sampleLimit:adaptiveSampleLimit(pageCount);
    const limit=Math.max(1,Math.min(pageCount,requested));

    for(let i=0;i<limit;i++)sampleIndexes.push(Math.floor(i*(pageCount-1)/Math.max(1,limit-1)));
    for(const pageIndex of [...new Set(sampleIndexes)])sampled.push(await classifier.classifyPage(pageIndex));

    const counts=sampled.reduce((m,p)=>(m[p.kind]=(m[p.kind]||0)+1,m),{});
    const n=sampled.length||1;
    let kind='native';
    if((counts.scanned||0)/n>=0.6)kind='scanned';
    else if((counts.scanned||0)||(counts.mixed||0))kind='mixed';
    else if((counts.native||0)===0)kind='unknown';

    const confidence=kind==='scanned'?(counts.scanned||0)/n:
      kind==='native'?(counts.native||0)/n:
      kind==='mixed'?Math.min(.9,((counts.mixed||0)+(counts.scanned||0))/n):.25;

    return {kind,pageCount,sampled,counts,confidence,sampleLimit:limit};
  }finally{
    await classifier.destroy();
  }
}
