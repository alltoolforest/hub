const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const child=(n,name)=>[...(n?.children||[])].find(c=>c.namespaceURI===W&&c.localName===name),value=n=>n?.getAttributeNS(W,'val');
const integer=(raw,fallback=1)=>raw!=null&&/^-?\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):fallback;
function display(number,kind){
 if(kind==='upperLetter'||kind==='lowerLetter'){let label='';while(number>0){number--;label=String.fromCharCode(65+number%26)+label;number=Math.floor(number/26);}return kind==='lowerLetter'?label.toLowerCase():label;}
 if((kind==='upperRoman'||kind==='lowerRoman')&&number>0&&number<4000){let label='';for(const [n,s]of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(number>=n){label+=s;number-=n;}return kind==='lowerRoman'?label.toLowerCase():label;}
 return String(number);
}
export async function readWordNumbering(zip,xml,Parser){
 async function part(path){const file=zip.file(path);if(!file)return null;const text=await file.async('string');if(text.length>5_000_000||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Unsupported Word numbering XML.');const doc=new Parser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('Invalid Word numbering XML.');return doc;}
 const doc=await part('word/numbering.xml');if(!doc)return {};const styles=await part('word/styles.xml'),byStyle=new Map([...(styles?.getElementsByTagNameNS(W,'style')||[])].map(n=>[n.getAttributeNS(W,'styleId'),n]));
 function styleNumber(id,seen=new Set()){if(!id||seen.has(id)||seen.size>=32)return {};seen.add(id);const s=byStyle.get(id);return {...styleNumber(value(child(s,'basedOn')),seen),...properties(child(child(s,'pPr'),'numPr'))};}
 function properties(pr){const id=value(child(pr,'numId')),level=value(child(pr,'ilvl'));return {...(id!=null?{id}:{}),...(level!=null?{level:integer(level,0)}:{})};}
 const abstracts=new Map([...doc.getElementsByTagNameNS(W,'abstractNum')].map(n=>[n.getAttributeNS(W,'abstractNumId'),n])),nums=new Map([...doc.getElementsByTagNameNS(W,'num')].map(n=>[n.getAttributeNS(W,'numId'),n])),counters=new Map(),result={};
 const defaultStyle=[...byStyle.values()].find(s=>s.getAttributeNS(W,'type')==='paragraph'&&['1','true','on'].includes(s.getAttributeNS(W,'default')))?.getAttributeNS(W,'styleId');
 [...xml.getElementsByTagNameNS(W,'p')].forEach((p,index)=>{
  const pr=child(p,'pPr'),{id,level=0}={...styleNumber(value(child(pr,'pStyle'))||defaultStyle),...properties(child(pr,'numPr'))};if(id==='0'||level<0||level>8)return;
  const num=nums.get(id),abstract=abstracts.get(value(child(num,'abstractNumId')));if(!num||!abstract)return;
  const levels=Array.from({length:9},(_,i)=>{const override=[...num.children].find(n=>n.localName==='lvlOverride'&&integer(n.getAttributeNS(W,'ilvl'),-1)===i),lvl=child(override,'lvl')||[...abstract.children].find(n=>n.localName==='lvl'&&integer(n.getAttributeNS(W,'ilvl'),-1)===i);return {lvl,start:integer(value(child(override,'startOverride')),integer(value(child(lvl,'start')))),restart:integer(value(child(lvl,'lvlRestart')),i)};});
  const config=levels[level],lvl=config.lvl;if(!lvl)return;const counts=counters.get(id)||[];counts[level]=(counts[level]??(config.start-1))+1;
  for(let i=level+1;i<9;i++)if(levels[i].restart!==0&&level<levels[i].restart)counts[i]=undefined;
  counters.set(id,counts);const format=value(child(lvl,'numFmt')),template=value(child(lvl,'lvlText'))??'%1.';
  result[index]=format==='none'?'':format==='bullet'?template:template.replace(/%([1-9])/g,(_,n)=>{const i=Number(n)-1;return display(counts[i]??levels[i].start,value(child(levels[i].lvl,'numFmt')));});
 });return result;
}
