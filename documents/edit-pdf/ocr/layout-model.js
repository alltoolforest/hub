function unionBBox(words){
  return words.reduce((b,w)=>({
    x0:Math.min(b.x0,w.bbox.x0),y0:Math.min(b.y0,w.bbox.y0),
    x1:Math.max(b.x1,w.bbox.x1),y1:Math.max(b.y1,w.bbox.y1),
  }),{x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity});
}
function avgConfidence(words){return words.reduce((n,w)=>n+(Number(w.confidence)||0),0)/Math.max(1,words.length);}
function makeGroup(type,key,words){
  const ordered=[...words].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
  return {type,key,text:ordered.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim(),bbox:unionBBox(ordered),confidence:avgConfidence(ordered),words:ordered};
}
function bucket(words,keyFn){
  const map=new Map();
  for(const word of words){const key=keyFn(word);if(!map.has(key))map.set(key,[]);map.get(key).push(word);}
  return map;
}
function geometryLines(words){
  const lines=[];
  for(const word of [...words].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){
    const cy=(word.bbox.y0+word.bbox.y1)/2,h=Math.max(1,word.bbox.y1-word.bbox.y0);
    let line=lines.find(l=>Math.abs(l.cy-cy)<=Math.max(h,l.h)*.55);
    if(!line){line={cy,h,words:[]};lines.push(line);}line.words.push(word);line.cy=(line.cy*(line.words.length-1)+cy)/line.words.length;line.h=Math.max(line.h,h);
  }
  return lines;
}
export function groupOcrWords(words=[]){
  const clean=words.filter(w=>w?.text&&w?.bbox);
  const haveHierarchy=clean.some(w=>Number.isFinite(w.blockNum)&&Number.isFinite(w.lineNum));
  let lines=[];
  if(haveHierarchy){
    for(const [key,list] of bucket(clean,w=>`${w.pageNum||1}:${w.blockNum||0}:${w.parNum||0}:${w.lineNum||0}`))lines.push(makeGroup('line',key,list));
  }else{
    lines=geometryLines(clean).map((l,i)=>makeGroup('line',`geom:${i}`,l.words));
  }
  const paragraphs=[];
  if(haveHierarchy){
    for(const [key,list] of bucket(clean,w=>`${w.pageNum||1}:${w.blockNum||0}:${w.parNum||0}`))paragraphs.push(makeGroup('paragraph',key,list));
  }else{
    const sorted=[...lines].sort((a,b)=>a.bbox.y0-b.bbox.y0);
    let current=[];
    for(const line of sorted){
      const prev=current[current.length-1];
      const gap=prev?line.bbox.y0-prev.bbox.y1:0;
      const h=Math.max(1,line.bbox.y1-line.bbox.y0);
      if(prev&&gap>h*1.4){paragraphs.push(makeGroup('paragraph',`geom-p:${paragraphs.length}`,current.flatMap(x=>x.words)));current=[];}
      current.push(line);
    }
    if(current.length)paragraphs.push(makeGroup('paragraph',`geom-p:${paragraphs.length}`,current.flatMap(x=>x.words)));
  }
  return {words:clean.map((w,i)=>({...w,type:'word',key:w.key||`word:${i}`,words:[w]})),lines,paragraphs};
}

export function targetsForGranularity(layout,granularity='word'){
  if(granularity==='paragraph')return layout?.paragraphs||[];
  if(granularity==='line')return layout?.lines||[];
  return layout?.words||[];
}
