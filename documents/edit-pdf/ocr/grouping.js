function unionBbox(words){
  const xs0=words.map(w=>w.bbox.x0),ys0=words.map(w=>w.bbox.y0),xs1=words.map(w=>w.bbox.x1),ys1=words.map(w=>w.bbox.y1);
  return {x0:Math.min(...xs0),y0:Math.min(...ys0),x1:Math.max(...xs1),y1:Math.max(...ys1)};
}
function avgConfidence(words){return words.reduce((s,w)=>s+(Number(w.confidence)||0),0)/Math.max(1,words.length);}
function wordKey(w,index){return w.id||`${w.pageNum||1}:${w.blockNum||0}:${w.paragraphNum||0}:${w.lineNum||0}:${w.wordNum||index+1}`;}
function sortWords(a,b){return (a.bbox.y0-b.bbox.y0)||(a.bbox.x0-b.bbox.x0);}
function groupBy(words,keyFn){const m=new Map();for(const w of words){const k=keyFn(w);if(!m.has(k))m.set(k,[]);m.get(k).push(w);}return m;}
function makeRegion(type,id,words,text,lines=null){
  const sorted=[...words].sort(sortWords);
  return {type,id,text,bbox:unionBbox(sorted),confidence:avgConfidence(sorted),words:sorted,wordIds:sorted.map((w,i)=>wordKey(w,i)),lines:lines||null};
}

export function groupOcrWords(words){
  const normalized=(words||[]).filter(w=>w?.text&&w?.bbox).map((w,i)=>({...w,id:wordKey(w,i)}));
  const wordRegions=normalized.map(w=>makeRegion('word',`word:${w.id}`,[w],w.text));
  const lineMap=groupBy(normalized,w=>`${w.pageNum||1}:${w.blockNum||0}:${w.paragraphNum||0}:${w.lineNum||0}`);
  const lines=[];
  for(const [key,lineWords] of lineMap){
    const sorted=[...lineWords].sort((a,b)=>a.bbox.x0-b.bbox.x0);
    lines.push(makeRegion('line',`line:${key}`,sorted,sorted.map(w=>w.text).join(' ')));
  }
  lines.sort(sortWords);
  const paragraphMap=groupBy(normalized,w=>`${w.pageNum||1}:${w.blockNum||0}:${w.paragraphNum||0}`);
  const paragraphs=[];
  for(const [key,parWords] of paragraphMap){
    const parLineMap=groupBy(parWords,w=>`${w.pageNum||1}:${w.blockNum||0}:${w.paragraphNum||0}:${w.lineNum||0}`);
    const parLines=[...parLineMap.values()].map(ws=>[...ws].sort((a,b)=>a.bbox.x0-b.bbox.x0));
    parLines.sort((a,b)=>Math.min(...a.map(w=>w.bbox.y0))-Math.min(...b.map(w=>w.bbox.y0)));
    const text=parLines.map(ws=>ws.map(w=>w.text).join(' ')).join('\n');
    const lineRegions=parLines.map((ws,i)=>makeRegion('line',`paragraph-line:${key}:${i}`,ws,ws.map(w=>w.text).join(' ')));
    paragraphs.push(makeRegion('paragraph',`paragraph:${key}`,parWords,text,lineRegions));
  }
  paragraphs.sort(sortWords);
  return {word:wordRegions,line:lines,paragraph:paragraphs};
}

export function regionsOverlapWords(a,b){
  const set=new Set(a?.wordIds||[]);
  return (b?.wordIds||[]).some(id=>set.has(id));
}
