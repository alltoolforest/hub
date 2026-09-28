const BULLET=/^(\s*)([•●◦▪‣∙*-]|\d+[.)])\s+(.+)$/u;
const LABEL=/^[A-Z][A-Za-z0-9 &/+.,'-]{1,48}:$/;
const KNOWN_HEADINGS=/^(professional experience|work experience|experience|education|educational qualifications|skills|certifications?|projects?|interests?|personal profile|summary|objective|achievements?)$/i;

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function clean(line){return String(line||'').trim();}
function upperRatio(text){const letters=Array.from(text).filter(ch=>/[A-Za-z]/.test(ch));if(!letters.length)return 0;return letters.filter(ch=>ch===ch.toUpperCase()).length/letters.length;}
function titleLike(text){
  const words=clean(text).split(/\s+/).filter(Boolean);
  if(!words.length||words.length>7)return false;
  const meaningful=words.filter(w=>/[A-Za-z]/.test(w));
  return meaningful.length>0&&meaningful.filter(w=>/^[A-Z][A-Za-z0-9&/+.'-]*$/.test(w)).length/meaningful.length>=.72;
}
function isHeading(text,index,lines){
  const t=clean(text).replace(/:$/,'');
  if(!t||t.length>64)return false;
  if(KNOWN_HEADINGS.test(t))return true;
  if(upperRatio(t)>=.86&&/[A-Za-z]{3}/.test(t))return true;
  const next=clean(lines[index+1]);
  if(index===0&&titleLike(t)&&(LABEL.test(next)||/^responsibilit(?:y|ies):$/i.test(next)))return true;
  return false;
}
function isSubheading(text){const t=clean(text);return /^responsibilit(?:y|ies):$/i.test(t)||LABEL.test(t);}
function fontFamily(value){return value==='sans'||value==='mono'?value:'serif';}

export function buildInsertStylePlan(tx){
  if(tx?.kind!=='INSERT_TEXT'||tx?.insertStylePlan)return tx;
  const source=String(tx.replacementUnicode||'').replace(/\r\n?/g,'\n');
  const lines=source.split('\n');
  if(lines.length<2&&!BULLET.test(lines[0]||'')&&!isHeading(lines[0]||'',0,lines)&&!isSubheading(lines[0]||''))return tx;

  const baseSize=clamp(Number(tx.fontSize)||12,6,72);
  const family=fontFamily(tx.fontFamily);
  let hasSemantic=false;
  const planLines=lines.map((raw,index)=>{
    const text=String(raw||'');
    const trimmed=clean(text);
    if(!trimmed)return {role:'blank',fontFamily:family,fontSize:baseSize,bold:false,italic:false,leftIndent:0,hangingIndent:0,spaceBefore:0,spaceAfter:Math.max(2,baseSize*.28)};
    const bullet=BULLET.exec(text);
    if(bullet){
      hasSemantic=true;
      return {role:'bullet',fontFamily:family,fontSize:baseSize,bold:!!tx.bold,italic:!!tx.italic,leftIndent:Math.max(9,baseSize*1.35),hangingIndent:Math.max(8,baseSize*.95),spaceBefore:index?Math.max(1,baseSize*.08):0,spaceAfter:Math.max(1,baseSize*.08)};
    }
    if(isHeading(trimmed,index,lines)){
      hasSemantic=true;
      return {role:'heading',fontFamily:family,fontSize:clamp(Math.max(baseSize,baseSize*1.12),6,72),bold:true,italic:false,leftIndent:0,hangingIndent:0,spaceBefore:index?Math.max(3,baseSize*.45):0,spaceAfter:Math.max(2,baseSize*.28)};
    }
    if(isSubheading(trimmed)){
      hasSemantic=true;
      return {role:'subheading',fontFamily:family,fontSize:baseSize,bold:true,italic:false,leftIndent:0,hangingIndent:0,spaceBefore:index?Math.max(2,baseSize*.22):0,spaceAfter:Math.max(1,baseSize*.12)};
    }
    return {role:'body',fontFamily:family,fontSize:baseSize,bold:!!tx.bold,italic:!!tx.italic,leftIndent:0,hangingIndent:0,spaceBefore:0,spaceAfter:0};
  });
  if(!hasSemantic)return tx;
  return {...tx,insertStylePlan:{version:1,lines:planLines,sourceLineCount:lines.length,auto:true}};
}

export function prepareStyleAwareInsertions(transactions=[]){
  return (transactions||[]).map(tx=>buildInsertStylePlan(tx));
}
