// Adapted from Edit PDF / Document Editor OCR provider and layout model.
// Unlike the editing engines, extraction retains low-confidence words.
export function parseRecognitionWords(tsv){
 const words=[];
 for(const row of String(tsv||'').split(/\r?\n/)){
  const c=row.split('\t');
  if(c.length<12||c[0]!=='5')continue;
  const [page,block,paragraph,line,word,x,y,w,h,confidence]=c.slice(1,11).map(Number);
  const text=c.slice(11).join('\t').trim();
  if(!text||![page,block,paragraph,line,word,x,y,w,h,confidence].every(Number.isFinite)||w<=0||h<=0)continue;
  words.push({page,block,paragraph,line,word,x,y,w,h,confidence,text});
 }
 return words;
}
export function recognitionLayout(words){
 const paragraphs=new Map();
 for(const w of words){
  const key=[w.page,w.block,w.paragraph].join(':');
  if(!paragraphs.has(key))paragraphs.set(key,new Map());
  const lines=paragraphs.get(key);
  if(!lines.has(w.line))lines.set(w.line,[]);
  lines.get(w.line).push(w);
 }
 const text=[...paragraphs.values()].map(lines=>[...lines.values()].map(line=>line.map(w=>w.text).join(' ')).join('\n')).join('\n\n');
 return {text,wordCount:words.length,uncertain:words.filter(w=>w.confidence<75).length};
}
// Reorder only when every OCR line has a common, wide gutter and TSV contains
// exactly the raw OCR words. A narrow table or a heading spanning the gutter
// leaves the original reading order intact.
function pairedColumns(words,raw){
 if(words.length<6||raw.split(/\s+/).join(' ')!==words.map(word=>word.text).join(' '))return '';
 const lines=new Map();
 for(const word of words){
  const key=[word.page,word.block,word.paragraph,word.line].join(':');
  if(!lines.has(key))lines.set(key,[]);
  lines.get(key).push(word);
 }
 if(lines.size<3)return '';
 const leftEdge=words.reduce((min,word)=>Math.min(min,word.x),Infinity);
 const rightEdge=words.reduce((max,word)=>Math.max(max,word.x+word.w),0);
 const splitRows=[];
 let gutterStart=leftEdge,gutterEnd=rightEdge;
 for(const row of lines.values()){
  const ordered=[...row].sort((a,b)=>a.x-b.x);
  let split=0,start=0,end=0;
  for(let i=1;i<ordered.length;i++){
   const previous=ordered[i-1],next=ordered[i];
   const left=previous.x+previous.w,right=next.x;
   if(right-left>Math.max(end-start,(rightEdge-leftEdge)*.12,3*Math.max(previous.h,next.h))){
    split=i;start=left;end=right;
   }
  }
  if(!split)return '';
  gutterStart=Math.max(gutterStart,start);
  gutterEnd=Math.min(gutterEnd,end);
  if(gutterEnd<=gutterStart)return '';
  splitRows.push([
   ordered.slice(0,split).map(word=>word.text).join(' '),
   ordered.slice(split).map(word=>word.text).join(' ')
  ]);
 }
 return [0,1].map(column=>splitRows.map(row=>row[column]).join('\n')).join('\n\n');
}

export function recognitionEvidence(data){
 const raw=typeof data?.text==='string'?data.text.trim():'';
 const words=parseRecognitionWords(data?.tsv);
 const layout=recognitionLayout(words);
 // Keep raw OCR as authoritative: TSV may omit words or alter punctuation.
 return {raw,words,text:pairedColumns(words,raw)||raw||layout.text,confidence:typeof data?.confidence==='number'&&Number.isFinite(data.confidence)?Math.max(0,Math.min(100,data.confidence)):null,uncertain:layout.uncertain,wordCount:layout.wordCount,layoutText:layout.text,layoutFallback:!raw&&!!layout.text};
}
export function safeRenderPlan(width,height,mobile){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid page dimensions.');
 const maxPixels=mobile?1500000:3000000,maxLongSide=8192;
 const scale=Math.min(300/72,maxLongSide/Math.max(width,height),Math.sqrt(maxPixels/width/height))*(1-1e-12);
 const pixelWidth=Math.max(1,Math.floor(width*scale)),pixelHeight=Math.max(1,Math.floor(height*scale));
 if(!(scale>0)||pixelWidth>maxLongSide||pixelHeight>maxLongSide||pixelWidth*pixelHeight>maxPixels)throw Error('Page cannot be rendered within the OCR budget.');
 return {scale,pixelWidth,pixelHeight,estimatedWorkingBytes:pixelWidth*pixelHeight*8};
}
