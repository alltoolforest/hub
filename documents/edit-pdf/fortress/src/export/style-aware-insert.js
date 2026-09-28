import { loadPdfjs } from '../rendering/pdfjs.js';

const STRUCTURE_WORDS=/\b(experience|education|qualification|certification|project|interest|profile|skills?|summary|objective|employment|career)\b/i;
const BULLET_RE=/^\s*([•●▪◦\-*])\s+(.+)$/u;
const NUMBERED_RE=/^\s*(\d{1,2}[.)])\s+(.+)$/u;

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function clean(text){return String(text||'').replace(/\s+/g,' ').trim();}
function familyFromCss(value){const v=String(value||'').toLowerCase();return /mono|courier/.test(v)?'mono':(/serif|times|roman|book/.test(v)?'serif':'sans');}
function isAllCaps(text){const letters=text.replace(/[^A-Za-z]/g,'');return letters.length>=4&&letters===letters.toUpperCase();}
function hasExplicitInsertStyle(tx){
  const family=tx?.fontFamily||'serif',size=Number(tx?.fontSize)||12;
  return !!tx?.bold||!!tx?.italic||family!=='serif'||Math.abs(size-12)>.15;
}
function looksHeading(text,index,lines){
  const t=clean(text);
  if(!t||t.length>72||BULLET_RE.test(t)||NUMBERED_RE.test(t)||/:$/.test(t))return false;
  if(isAllCaps(t))return true;
  if(STRUCTURE_WORDS.test(t)&&(index===0||isAllCaps(t)||/\bexperience\b/i.test(t)))return true;
  const next=clean(lines[index+1]||'');
  return index===0&&next&&/:$/.test(next)&&t.split(/\s+/).length<=7;
}
function roleOf(text,index,lines){
  const t=clean(text);
  if(!t)return 'blank';
  if(BULLET_RE.test(t)||NUMBERED_RE.test(t))return 'bullet';
  if(/:$/.test(t)&&t.length<=72)return 'subheading';
  if(looksHeading(t,index,lines))return 'heading';
  return 'body';
}
function structuredLines(text){
  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
  const roles=lines.map((line,i)=>roleOf(line,i,lines));
  const meaningful=roles.filter(r=>r!=='blank');
  const hasStructure=meaningful.some(r=>r==='heading'||r==='subheading'||r==='bullet');
  return {lines,roles,hasStructure:hasStructure&&meaningful.length>=2};
}

async function pageHints(bytes,pageIndex){
  const p=await loadPdfjs();
  const task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  try{
    const page=await pdf.getPage(pageIndex+1);
    const content=await page.getTextContent({disableNormalization:false});
    const styles=content.styles||{};
    return (content.items||[]).map(item=>{
      const text=clean(item?.str);const t=item?.transform||[];
      const x=Number(t[4]),y=Number(t[5]);
      const size=Math.max(1,Math.hypot(Number(t[0])||0,Number(t[1])||0));
      if(!text||![x,y,size].every(Number.isFinite))return null;
      const css=styles[item.fontName]?.fontFamily||'';
      return {text,x,y,size,fontFamily:familyFromCss(css),fontName:String(item.fontName||'')};
    }).filter(Boolean);
  }finally{try{await pdf.destroy?.();}catch{}}
}
function nearest(items,predicate,{x,y,maxDy=260,maxDx=120}={}){
  let best=null,bestScore=Infinity;
  for(const item of items){
    if(predicate&&!predicate(item))continue;
    const dx=Math.abs(item.x-x),dy=Math.abs(item.y-y);
    if(dx>maxDx||dy>maxDy)continue;
    const score=dy+dx*.28;
    if(score<bestScore){best=item;bestScore=score;}
  }
  return best;
}
function styleHints(items,tx){
  const x=Number(tx.x)||0,y=Number(tx.y)||0;
  const body=nearest(items,i=>!isAllCaps(i.text)&&!/:$/.test(i.text)&&i.text.length>18,{x,y,maxDy:220,maxDx:150})
    ||nearest(items,null,{x,y,maxDy:180,maxDx:140});
  const heading=nearest(items,i=>isAllCaps(i.text)&&i.text.length<=72,{x,y,maxDy:320,maxDx:160});
  const responsibilities=nearest(items,i=>/^responsibilities\s*:?$/i.test(i.text),{x,y,maxDy:360,maxDx:180});
  const baseSize=clamp(Number(tx.fontSize)||body?.size||12,6,72);
  return {
    body:{fontFamily:body?.fontFamily||tx.fontFamily||'serif',fontSize:clamp(body?.size||baseSize,6,72),bold:false,italic:false},
    heading:{fontFamily:heading?.fontFamily||tx.fontFamily||body?.fontFamily||'serif',fontSize:clamp(heading?.size||Math.max(baseSize,12),6,72),bold:true,italic:false},
    subheading:{fontFamily:responsibilities?.fontFamily||heading?.fontFamily||tx.fontFamily||'serif',fontSize:clamp(responsibilities?.size||heading?.size||baseSize,6,72),bold:true,italic:false},
  };
}
function styleForRole(role,hints){return role==='heading'?hints.heading:(role==='subheading'?hints.subheading:hints.body);}
function approxWrappedLines(text,size,width){
  const words=clean(text).split(/\s+/).filter(Boolean);if(!words.length)return 1;
  const cap=Math.max(5,width/Math.max(3,size*.58));
  let lines=1,used=0;
  for(const word of words){const n=Math.max(1,Array.from(word).length)+(used?1:0);if(used&&used+n>cap){lines++;used=Array.from(word).length;}else used+=n;}
  return Math.max(1,lines);
}
function cloneTx(tx,patch){return {...tx,...patch,reflowPlan:null,status:tx.status||'COMMITTED'};}
function expandOne(tx,hints){
  const parsed=structuredLines(tx.replacementUnicode);
  if(tx?.kind!=='INSERT_TEXT'||!parsed.hasStructure||hasExplicitInsertStyle(tx))return [tx];
  const baseX=Number(tx.x)||0,baseY=Number(tx.y)||0,maxWidth=Math.max(80,Number(tx.maxWidth)||300);
  let y=baseY;
  const components=[];
  let serial=0;
  const push=(patch)=>components.push(cloneTx(tx,{id:`${tx.id}:styled:${serial++}`,...patch}));

  for(let i=0;i<parsed.lines.length;i++){
    const raw=parsed.lines[i],text=clean(raw),role=parsed.roles[i];
    if(role==='blank'){y-=Math.max(4,(Number(tx.fontSize)||12)*.55);continue;}
    const style=styleForRole(role,hints);
    const size=clamp(Number(style.fontSize)||12,6,72);
    const lineHeight=Math.max(size*1.22,Number(tx.lineHeight)||size*1.2);
    if(role==='heading'&&i>0)y-=Math.max(3,size*.35);
    if(role==='subheading')y-=Math.max(2,size*.18);

    const bullet=BULLET_RE.exec(raw)||NUMBERED_RE.exec(raw);
    if(role==='bullet'&&bullet){
      const marker=bullet[1],body=clean(bullet[2]);
      const indent=Math.max(7,size*.72),hang=Math.max(10,size*.92);
      const bodyWidth=Math.max(60,maxWidth-indent-hang);
      push({replacementUnicode:marker,x:baseX+indent,y,fontSize:size,lineHeight,maxWidth:hang*.9,fontFamily:style.fontFamily,bold:false,italic:false});
      push({replacementUnicode:body,x:baseX+indent+hang,y,fontSize:size,lineHeight,maxWidth:bodyWidth,fontFamily:style.fontFamily,bold:false,italic:false});
      y-=approxWrappedLines(body,size,bodyWidth)*lineHeight+Math.max(1,size*.08);
      continue;
    }

    const width=Math.max(70,maxWidth-(role==='body'?0:2));
    push({replacementUnicode:text,x:baseX,y,fontSize:size,lineHeight,maxWidth:width,fontFamily:style.fontFamily,bold:style.bold,italic:style.italic});
    y-=approxWrappedLines(text,size,width)*lineHeight;
    if(role==='heading')y-=Math.max(3,size*.35);
    else if(role==='subheading')y-=Math.max(2,size*.16);
  }

  const carrier=[...components].reverse().find(c=>!/^\s*[•●▪◦\-*]\s*$/u.test(c.replacementUnicode)&&!/^\d{1,2}[.)]$/.test(c.replacementUnicode))||components.at(-1);
  if(!carrier)return [tx];
  carrier.id=tx.id;
  carrier.reflowPlan=tx.reflowPlan;
  carrier._styleAwareCarrier=true;
  carrier._styleAwareOriginalText=tx.replacementUnicode;
  return [carrier,...components.filter(c=>c!==carrier)];
}

export async function expandStyleAwareInsertTransactions(originalBytes,transactions=[]){
  const pageCache=new Map();
  const out=[];
  for(const tx of transactions){
    if(tx?.kind!=='INSERT_TEXT'||hasExplicitInsertStyle(tx)){out.push(tx);continue;}
    const parsed=structuredLines(tx.replacementUnicode);
    if(!parsed.hasStructure){out.push(tx);continue;}
    const pageIndex=Number(tx.pageIndex);
    let items=[];
    if(Number.isInteger(pageIndex)&&pageIndex>=0){
      if(!pageCache.has(pageIndex)){
        try{pageCache.set(pageIndex,await pageHints(originalBytes,pageIndex));}catch{pageCache.set(pageIndex,[]);}
      }
      items=pageCache.get(pageIndex)||[];
    }
    out.push(...expandOne(tx,styleHints(items,tx)));
  }
  return out;
}
