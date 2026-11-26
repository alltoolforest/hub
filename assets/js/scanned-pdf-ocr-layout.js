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
export function recognitionEvidence(data){
 const raw=typeof data?.text==='string'?data.text.trim():'';
 const words=parseRecognitionWords(data?.tsv);
 const layout=recognitionLayout(words);
 // Keep raw OCR as authoritative: TSV may omit words or alter punctuation.
 return {text:raw||layout.text,confidence:typeof data?.confidence==='number'&&Number.isFinite(data.confidence)?Math.max(0,Math.min(100,data.confidence)):null,uncertain:layout.uncertain,wordCount:layout.wordCount,layoutText:layout.text,layoutFallback:!raw&&!!layout.text};
}
export function safeRenderPlan(width,height,mobile){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid page dimensions.');
 const maxPixels=mobile?1500000:3000000,maxLongSide=8192;
 const scale=Math.min(300/72,maxLongSide/Math.max(width,height),Math.sqrt(maxPixels/width/height))*(1-1e-12);
 const pixelWidth=Math.max(1,Math.floor(width*scale)),pixelHeight=Math.max(1,Math.floor(height*scale));
 if(!(scale>0)||pixelWidth>maxLongSide||pixelHeight>maxLongSide||pixelWidth*pixelHeight>maxPixels)throw Error('Page cannot be rendered within the OCR budget.');
 return {scale,pixelWidth,pixelHeight,estimatedWorkingBytes:pixelWidth*pixelHeight*8};
}
