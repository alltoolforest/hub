import { loadPdfjs } from '../rendering/pdfjs.js';

function normalizeText(value){
  return String(value||'')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

function compactWhitespace(value){return normalizeText(value).replace(/\s+/g,'');}

export async function extractPageText(bytes,pageIndex){
  const p=await loadPdfjs();
  const task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const doc=await task.promise;
  const page=await doc.getPage(pageIndex+1);
  const tc=await page.getTextContent();
  return tc.items.map(x=>x.str).join(' ');
}

export async function validateExtraction(bytes,checks){
  const byPage=new Map();
  const results=[];
  for(const c of checks||[]){
    if(!byPage.has(c.pageIndex))byPage.set(c.pageIndex,await extractPageText(bytes,c.pageIndex));
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
}
