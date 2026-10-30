import {readWordSections} from './word-sections.js';
import {readLayout} from './word-layout.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const child=(node,name)=>[...(node?.children||[])].find(n=>n.namespaceURI===W&&n.localName===name);
const attr=(node,name='val')=>node?.getAttributeNS(W,name)||'';
export function hasWordPageBreakBefore(paragraph){
  const setting=child(child(paragraph,'pPr'),'pageBreakBefore');
  return !!setting&&!['0','false','off'].includes(attr(setting).toLowerCase());
}
function props(node,theme){
  const out={},fonts=child(node,'rFonts'),size=Number(attr(child(node,'sz')));
  const face=attr(fonts,'ascii')||attr(fonts,'hAnsi');
  const themed=attr(fonts,'asciiTheme')||attr(fonts,'hAnsiTheme');
  if(face)out.font=face;else if(themed&&theme[themed])out.font=theme[themed];
  if(size>0&&size<=3276)out.size=size/2;
  for(const key of ['b','i']){const item=child(node,key);if(item)out[key==='b'?'bold':'italic']=!['0','false','off'].includes(attr(item));}
  const color=attr(child(node,'color'));if(/^[\da-f]{6}$/i.test(color))out.color='#'+color;
  return out;
}
export async function readWordFormatting(zip,xml,Parser){
  async function part(path){const file=zip.file(path);if(!file)return null;const text=await file.async('string');if(text.length>5_000_000||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Unsupported Word formatting XML.');const doc=new Parser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('Invalid Word formatting XML.');return doc;}
  const styles=await part('word/styles.xml'),themeXml=await part('word/theme/theme1.xml'),theme={};
  for(const kind of ['major','minor']){const node=themeXml?.getElementsByTagNameNS(A,kind+'Font')[0],face=node?.getElementsByTagNameNS(A,'latin')[0]?.getAttribute('typeface');if(face){theme[kind+'Ascii']=face;theme[kind+'HAnsi']=face;}}
  const defaults=props(styles?.getElementsByTagNameNS(W,'rPrDefault')[0]?.getElementsByTagNameNS(W,'rPr')[0],theme),byId=new Map();
  for(const style of styles?.getElementsByTagNameNS(W,'style')||[])byId.set(attr(style,'styleId'),style);
  const defaultParagraph=[...byId.values()].find(s=>attr(s,'type')==='paragraph'&&['1','true'].includes(attr(s,'default')));
  function resolve(id,seen=new Set()){
    if(!id||seen.has(id)||seen.size>32)return {};seen.add(id);const style=byId.get(id);if(!style)return {};
    return {...resolve(attr(child(style,'basedOn')),seen),...props(child(style,'rPr'),theme)};
  }
  function resolveLayout(id,seen=new Set()){if(!id||seen.has(id)||seen.size>32)return readLayout(styles?.getElementsByTagNameNS(W,'pPrDefault')[0]?.getElementsByTagNameNS(W,'pPr')[0]);seen.add(id);const style=byId.get(id);return readLayout(child(style,'pPr'),resolveLayout(attr(child(style,'basedOn')),seen));}
  const paragraphs=[...xml.getElementsByTagNameNS(W,'p')];
  const formats=paragraphs.map(p=>{
    const pPr=child(p,'pPr'),base={font:'Calibri',size:11,color:'#000000',bold:false,italic:false,...defaults,...resolve(attr(child(pPr,'pStyle'))||attr(defaultParagraph,'styleId'))};
    const runs=[...p.getElementsByTagNameNS(W,'t')].map(t=>{const rPr=child(t.parentNode,'rPr');return {...base,...resolve(attr(child(rPr,'rStyle'))),...props(rPr,theme)};});
    const spacing=child(pPr,'spacing'),alignment=attr(child(pPr,'jc'));
    return {base,runs,layout:readLayout(pPr,resolveLayout(attr(child(pPr,'pStyle'))||attr(defaultParagraph,'styleId'))),alignment:['left','right','center','both'].includes(alignment)?alignment:'left',before:Number(attr(spacing,'before'))/20||0,after:Number(attr(spacing,'after'))/20||0};
  });
  const section=xml.getElementsByTagNameNS(W,'sectPr')[0],page=child(section,'pgSz'),margins=child(section,'pgMar');
  const margin=key=>{const raw=attr(margins,key);return raw!==''&&Number.isFinite(Number(raw))?Number(raw)/20:72;};
  return {formats,sections:readWordSections(xml),page:{width:Number(attr(page,'w'))/20||612,height:Number(attr(page,'h'))/20||792,top:margin('top'),bottom:margin('bottom'),left:margin('left'),right:margin('right')}};
}
export function validateWordFormat(value){
  if(!value||typeof value.font!=='string'||!value.font.trim()||value.font.length>120||/[\x00-\x1f]/.test(value.font)||!Number.isFinite(value.size)||value.size<1||value.size>1638||typeof value.bold!=='boolean'||typeof value.italic!=='boolean'||!/^#[\da-f]{6}$/i.test(value.color))throw new Error('Invalid Word font formatting.');
  return {font:value.font,size:value.size,bold:value.bold,italic:value.italic,color:value.color};
}
export function styleWordNode(node,format){node.style.fontFamily=JSON.stringify(format.font)+', sans-serif';node.style.fontSize=format.size+'pt';node.style.fontWeight=format.bold?'700':'400';node.style.fontStyle=format.italic?'italic':'normal';node.style.color=format.color;}
export function writeWordFormat(xml,run,format){
  let pr=child(run,'rPr');if(!pr){pr=xml.createElementNS(W,'w:rPr');run.insertBefore(pr,run.firstChild);}
  function property(name,values){let el=child(pr,name);if(!el){el=xml.createElementNS(W,'w:'+name);pr.append(el);}for(const [key,value] of Object.entries(values))el.setAttributeNS(W,'w:'+key,String(value));return el;}
  const fonts=property('rFonts',{ascii:format.font,hAnsi:format.font,eastAsia:format.font,cs:format.font});for(const key of ['asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme'])fonts.removeAttributeNS(W,key);
  property('sz',{val:Math.round(format.size*2)});property('szCs',{val:Math.round(format.size*2)});property('b',{val:format.bold?'1':'0'});property('i',{val:format.italic?'1':'0'});
  const color=property('color',{val:format.color.slice(1)});for(const key of ['themeColor','themeTint','themeShade'])color.removeAttributeNS(W,key);
}
