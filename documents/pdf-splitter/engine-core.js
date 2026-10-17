/* PDF Splitter V3.1 task 1: DOM-free planning core. */
(function(root){
'use strict';
const transitions={
 idle:['loading'],loading:['validating','failed','idle'],validating:['ready','failed','idle'],
 ready:['preparing','loading','idle'],preparing:['splitting','cancelling','failed'],
 splitting:['verifying','cancelling','failed'],verifying:['splitting','packaging','completed','cancelling','failed'],
 packaging:['completed','cancelling','failed'],completed:['preparing','loading','idle'],
 cancelling:['cancelled','failed'],cancelled:['preparing','loading','idle'],
 failed:['preparing','loading','idle','ready']
};
const active=new Set(['preparing','splitting','verifying','packaging']);
const integer=(v,min=1)=>Number.isSafeInteger(v)&&v>=min;
function assertCount(n){if(!integer(n))throw Error('Document page count must be a positive whole number.');}
function range(a,b){if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0)throw Error('Invalid page index.');const length=Math.abs(b-a)+1;if(length>1000000)throw Error('Selection is too large to materialize.');return Array.from({length},(_,i)=>a+(a<=b?i:-i));}
function parseRanges(text,n,{allowDup=false}={}){
 assertCount(n);const src=String(text).trim();if(!src)throw Error('Enter at least one page range.');
 const pieces=src.split(/[,;\n]/);if(pieces.some(x=>!x.trim()))throw Error('Empty page range.');
 const seen=new Set(),result=[];
 for(const part of pieces){
 const p=part.toLowerCase().replace(/\s+/g,'');let a,b,m;
 const val=t=>t==='end'||t==='last'?n:Number(t);
 if((m=/^(\d+|last|end)$/.exec(p))){a=b=val(m[1]);}
 else if((m=/^(\d+|last|end)?-(\d+|last|end)?$/.exec(p))){a=m[1]?val(m[1]):1;b=m[2]?val(m[2]):n;}
 else throw Error('Invalid page range: '+part);
 if(!integer(a)||!integer(b)||a>n||b>n)throw Error('Page range outside document: '+part);
 const pages=[];for(const i of range(a-1,b-1)){if(allowDup||!seen.has(i)){pages.push(i);seen.add(i);}}
 result.push({label:a===b?String(a):a+'-'+b,pages});
 }
 return result;
}
function planEvery(n,step){assertCount(n);if(!integer(step))throw Error('Pages per file must be a positive whole number.');const out=[];for(let s=0;s<n;s+=step)out.push(range(s,Math.min(n-1,s+step-1)));return out;}
function planParts(n,parts){assertCount(n);if(!integer(parts,2)||parts>n)throw Error('Invalid equal-parts count.');const out=[];let s=0;for(let k=0;k<parts;k++){const len=Math.floor(n/parts)+(k<n%parts?1:0);out.push(range(s,s+len-1));s+=len;}return out;}
function planRemove(n,removed){assertCount(n);const set=new Set(removed);for(const p of set)if(!Number.isSafeInteger(p)||p<0||p>=n)throw Error('Invalid page removal index.');const keep=[];for(let i=0;i<n;i++)if(!set.has(i))keep.push(i);if(!keep.length)throw Error('Cannot remove every page.');return [keep];}
function planBookmarks(outline,n,level){assertCount(n);if(!integer(level)||!Array.isArray(outline))throw Error('Invalid bookmark selection.');const sorted=outline.filter(x=>Number.isSafeInteger(x.page)&&x.page>=0&&x.page<n&&integer(x.level)&&x.level<=level).slice().sort((a,b)=>a.page-b.page).filter((b,i,a)=>!i||b.page!==a[i-1].page);if(!sorted.length)throw Error('No usable bookmarks at this level.');const out=[];if(sorted[0].page>0)out.push({title:'front-matter',pages:range(0,sorted[0].page-1)});sorted.forEach((b,i)=>out.push({title:String(b.title||'Section'),pages:range(b.page,(sorted[i+1]?.page??n)-1)}));return out;}
function rotate(current,delta){if(![90,-90,180,270].includes(delta)||!Number.isSafeInteger(current)||current%90!==0)throw Error('Invalid rotation.');return ((current+delta)%360+360)%360;}
function concurrencyFor(memory,cores){const c=Number.isFinite(cores)&&cores>0?Math.floor(cores):2;return Math.max(1,Math.min(4,memory&&memory<=2?1:memory&&memory<=4?2:Math.floor(c/2)));}
function cloneFreeze(value){if(typeof structuredClone==='function')value=structuredClone(value);else value=JSON.parse(JSON.stringify(value));const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};return freeze(value);}
class JobController{
 constructor(){this.state='idle';this.id=0;this.cfg=null;this.subs=new Set();}
 on(callback){this.subs.add(callback);return ()=>this.subs.delete(callback);}
 go(next){if(!transitions[this.state]?.includes(next))throw Error('Invalid transition '+this.state+' -> '+next);this.state=next;this.emit();return next;}
 emit(){for(const cb of this.subs){try{cb(this.state);}catch{}}}
 begin(config){if(!transitions[this.state]?.includes('preparing'))throw Error('A job cannot start from '+this.state);const copy=cloneFreeze(config);this.id++;this.cfg=copy;this.go('preparing');return this.id;}
 isCurrent(id){return id===this.id&&active.has(this.state);}
 publish(id,fn){if(!this.isCurrent(id))return false;fn();return true;}
 cancel(){if(active.has(this.state))this.go('cancelling');}
 settleCancel(){if(this.state==='cancelling')this.go('cancelled');}
 reset(){this.id++;this.state='idle';this.cfg=null;this.emit();}
}
async function fitChunk(start,n,limit,measure,release=()=>{},check=()=>{}){
 assertCount(n);if(!Number.isSafeInteger(start)||start<0||start>=n||!Number.isFinite(limit)||limit<=0)throw Error('Invalid size-split parameters.');
 if(typeof measure!=='function')throw Error('Missing size measurement function.');
 const max=n-start;let best=null;
 const attempt=async k=>{
 check();let result;result=await measure(start,k);
 try{check();if(!result||!Number.isFinite(result.size)||result.size<0)throw Error('Invalid measured size.');
 if(result.size<=limit&&(!best||k>best.count)){if(best)release(best.art);best={count:k,size:result.size,art:result.art};result=null;return true;}
 return result.size<=limit;
 }finally{if(result)release(result.art);}
 };
 try{
 // A single oversized page is handled without a second serialization.
 const first=await measure(start,1);let firstKept=false;
 try{
 check();
 if(!first||!Number.isFinite(first.size)||first.size<0)throw Error('Invalid measured size.');
 if(first.size>limit){firstKept=true;return {count:1,size:first.size,art:first.art,oversize:true};}
 best={count:1,size:first.size,art:first.art};firstKept=true;
 }finally{if(!firstKept&&first)release(first.art);}

 let lo=1,hi=null;
 while(lo<max){const k=Math.min(lo*2,max);if(await attempt(k))lo=k;else{hi=k;break;}}
 while(hi!==null&&hi-lo>1){const mid=Math.floor((lo+hi)/2);if(await attempt(mid))lo=mid;else hi=mid;}
 for(let k=lo+1;k<=Math.min(lo+2,max);k++)await attempt(k);
 check();const result={...best,oversize:false};best=null;return result;
 }finally{if(best)release(best.art);}
}
const api={JobController,range,parseRanges,planEvery,planParts,planRemove,planBookmarks,rotate,concurrencyFor,fitChunk};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SplitterCore=api;
})(typeof self!=='undefined'?self:this);
