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

export async function classifyPdfForEditing(source,{sampleLimit=6}={}){
  const bytes=source instanceof Uint8Array?source:new Uint8Array(await source.arrayBuffer());
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  const pageCount=pdf.numPages;
  const sampled=[];
  const sampleIndexes=[];
  const limit=Math.max(1,Math.min(pageCount,sampleLimit));

  for(let i=0;i<limit;i++)sampleIndexes.push(Math.floor(i*(pageCount-1)/Math.max(1,limit-1))+1);

  for(const pageNumber of [...new Set(sampleIndexes)]){
    const page=await pdf.getPage(pageNumber);
    const [textContent,ops]=await Promise.all([page.getTextContent(),page.getOperatorList()]);
    const chars=meaningfulChars(textContent.items);
    const images=imageOpCount(pdfjs,ops);
    const textItems=(textContent.items||[]).filter(item=>String(item?.str||'').trim()).length;
    let kind='unknown';
    if(chars>=80||textItems>=12)kind=images>0&&chars<180?'mixed':'native';
    else if(images>0&&chars<=20)kind='scanned';
    else if(images>0)kind='mixed';
    else if(chars>0)kind='native';
    sampled.push({pageIndex:pageNumber-1,kind,chars,textItems,imageOps:images});
  }

  try{await pdf.destroy?.();}catch{}
  const counts=sampled.reduce((m,p)=>(m[p.kind]=(m[p.kind]||0)+1,m),{});
  const n=sampled.length||1;
  let kind='native';
  if((counts.scanned||0)/n>=0.6)kind='scanned';
  else if((counts.scanned||0)||(counts.mixed||0))kind='mixed';
  else if((counts.native||0)===0)kind='unknown';

  return {
    kind,
    pageCount,
    sampled,
    counts,
    confidence:kind==='scanned'?(counts.scanned||0)/n:kind==='native'?(counts.native||0)/n:0.6,
  };
}
