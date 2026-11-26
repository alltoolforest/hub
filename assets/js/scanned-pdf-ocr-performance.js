export function boundedRanges(text,count,limit){
 if(typeof text!=='string'||text.length>4096||!text.trim())throw Error('Enter valid page ranges.');
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid page limits.');
 const selected=new Set();
 for(const part of text.split(',')){
  const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if(!m)throw Error('Use ranges such as 1-3,5.');
  const a=Number(m[1]),b=m[2]?Number(m[2]):a;
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b<a||b>count)throw Error('Page range outside document.');
  if(b-a+1>limit)throw Error('Choose fewer pages for this device.');
  for(let n=a;n<=b;n++){selected.add(n-1);if(selected.size>limit)throw Error('Choose fewer pages for this device.');}
 }
 return [...selected].sort((a,b)=>a-b);
}

export function budgets(mobile){return {fileMB:mobile?15:40,pages:mobile?10:30,pixels:mobile?1500000:3000000,side:8192,sourceImagePixels:mobile?16000000:32000000,textChars:mobile?2000000:6000000};}

export function canvasDimensions(width,height,limits){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid render dimensions.');
 const w=Math.max(1,Math.floor(width)),h=Math.max(1,Math.floor(height));
 if(w>limits.side||h>limits.side||w*h>limits.pixels)throw Error('Page exceeds safe canvas dimensions.');
 return {width:w,height:h,rgbaBytes:w*h*4};
}

export function retryIndices(records){return records.filter(r=>r.state==='failed'||r.state==='cancelled'||r.state==='skipped').map(r=>r.page-1);}

export function mergeRetry(previous,next){
 const updates=new Map(next.map(r=>[r.page,r]));
 return previous.map(r=>{const n=updates.get(r.page);return n&&['failed','cancelled','skipped'].includes(r.state)?n:r;});
}

export function pageProgress(done,total){return Math.max(0,Math.min(100,Math.floor(done/Math.max(1,total)*100)));}

export function appendRecord(records,record,limit){
 const n=records.reduce((sum,r)=>sum+(r.text?.length||0),0)+(record.text?.length||0);
 if(n>limit)throw Error('Recognized text exceeds the safe output budget. Select fewer pages.');
 records.push(record);
}
