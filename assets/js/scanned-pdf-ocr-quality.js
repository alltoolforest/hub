export function nativeText(items){
 let out='',prev=null;
 for(const item of items||[]){if(typeof item.str!=='string'||!item.str.trim()){if(item.hasEOL&&out&&!out.endsWith('\n'))out+='\n';continue}
 const t=item.transform||[],y=t[5],x=t[4],height=Math.abs(item.height||t[3]||10);
 if(prev&&!out.endsWith('\n')){if(Number.isFinite(y)&&Number.isFinite(prev.y)&&(Math.abs(y-prev.y)>Math.max(height,prev.height)*.6||x<prev.x-2))out+='\n';else if(!/\s$/.test(out)&&!/^\s/.test(item.str))out+=' ';}
 out+=item.str;if(item.hasEOL)out+='\n';prev={x,y,height};
 }return out.trim();
}

export function classifyPage(text,operators,OPS){
 const names=['paintImageXObject','paintInlineImageXObject','paintImageMaskXObject','paintImageXObjectRepeat','paintInlineImageXObjectGroup','paintImageMaskXObjectGroup','paintImageMaskXObjectRepeat','paintSolidColorImageMask','paintJpegXObject'];
 const ids=new Set(names.map(n=>OPS[n]).filter(Number.isFinite));
 const image=operators.some(v=>ids.has(v));
 return text.trim()?(image?'mixed':'digital'):'scan';
}

export function renderPlan(width,height,mobile){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid page dimensions.');
 const budget=mobile?1.5e6:3e6;
 return Math.min(300/72,Math.sqrt(budget/(width*height)),8192/Math.max(width,height));
}

export function normalizeLine(s){return s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()}

export function mergeMixed(native,ocr){
 // Retain exact native text, add unmatched OCR lines, never silently claim exact mixed layout.
 const lines=native.split(/\n/).filter(x=>x.trim()), keys=new Set(lines.map(normalizeLine));
 const extra=[];
 for(const line of ocr.split(/\n/)){const key=normalizeLine(line);if(!key||keys.has(key))continue;extra.push(line);keys.add(key)}
 return {text:[native,extra.length?'[Additional OCR text — review reading order]\n'+extra.join('\n'):''].filter(Boolean).join('\n\n'),review:true};
}

export function candidate(data){return {text:typeof data?.text==='string'?data.text.trim():'',confidence:typeof data?.confidence==='number'&&Number.isFinite(data.confidence)?Math.max(0,Math.min(100,data.confidence)):null}}

export function chooseCandidate(a,b){if(!a.text)return b.text?b:a;if(!b.text)return a;if(b.confidence!==null&&a.confidence!==null&&b.confidence>=a.confidence+5&&b.text.length>=a.text.length*.85)return b;return a}

export function summarize(records){
 const counts={completed:0,blank:0,failed:0,cancelled:0,skipped:0,review:0};let actual=0;
 for(const r of records){if(!(r.state in counts)||r.state==='review')throw Error('Invalid page state');counts[r.state]++;if(r.review)counts.review++;if(r.state==='completed'&&r.text.trim())actual++}
 return {counts,actual,text:records.map(r=>'Page '+r.page+'\n'+(r.state==='completed'?r.text:'['+r.state+': '+(r.note||'No text')+']')).join('\n\n')};
}
