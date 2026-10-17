import { withPdfDocument } from '../rendering/with-document.js';

function normalizeText(value){
  return String(value||'')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

function compactWhitespace(value){return normalizeText(value).replace(/\s+/g,'');}

export async function extractPageText(bytes,pageIndex){
  return withPdfDocument(bytes,doc=>readPageText(doc,pageIndex));
}

async function readPageText(doc,pageIndex){
  const page=await doc.getPage(pageIndex+1);
  try{
    const tc=await page.getTextContent();
    return tc.items.map(x=>x.str).join(' ');
  }finally{page.cleanup();}
}

export async function validateExtraction(bytes,checks){
  if(!checks?.length)return {ok:true,results:[]};
  return withPdfDocument(bytes,async doc=>{
  const byPage=new Map();
  const results=[];
  for(const c of checks||[]){
    if(!byPage.has(c.pageIndex))byPage.set(c.pageIndex,await readPageText(doc,c.pageIndex));
    const text=byPage.get(c.pageIndex);
    const normalizedPage=normalizeText(text);
    const normalizedNew=normalizeText(c.newText);
    const replacementPresent=!normalizedNew||normalizedPage.includes(normalizedNew)||compactWhitespace(text).includes(compactWhitespace(c.newText));
    const normalizedOld=normalizeText(c.oldText);
    const oldTextStillPresent=!!normalizedOld&&(normalizedPage.includes(normalizedOld)||compactWhitespace(text).includes(compactWhitespace(c.oldText)));
    const deletionRequested=(c.kind||'replace')==='replace'&&!normalizedNew&&!!normalizedOld;
    const deletionVerified=!deletionRequested||!oldTextStillPresent;
    results.push({
      kind:c.kind||'replace',
      pageIndex:c.pageIndex,
      replacementPresent,
      oldTextStillPresent,
      deletionRequested,
      deletionVerified,
      text,
    });
  }
  return {ok:results.every(r=>r.replacementPresent&&r.deletionVerified),results};
  });
}
