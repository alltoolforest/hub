import {PDFName,PDFDict} from '../fortress/src/core/pdf-lib.js';

// Invisible OCR glyphs have no visible outline. ToUnicode carries the original
// Unicode scalar (including surrogate pairs), independent of installed fonts.
function utf16Hex(text){
  let hex='';for(let i=0;i<text.length;i++)hex+=text.charCodeAt(i).toString(16).padStart(4,'0');return hex.toUpperCase();
}
const byteHex=value=>value.toString(16).padStart(2,'0').toUpperCase();
export function createUnicodeSearchFonts(doc,page,texts){
  if(texts.some(text=>!text.isWellFormed()))throw new Error('Searchable OCR text contains malformed Unicode.');
  const characters=[...new Set(texts.flatMap(text=>Array.from(text)))];
  const context=doc.context,lookup=new Map();
  const resources=page.node.Resources()?.clone(context)||context.obj({});
  const fonts=resources.lookupMaybe(PDFName.of('Font'),PDFDict)?.clone(context)||context.obj({});
  // One empty Type3 glyph procedure is shared; character mappings are per font.
  const glyph=context.register(context.flateStream('1000 0 0 0 1000 1000 d1\n'));
  for(let offset=0;offset<characters.length;offset+=255){
    const chunk=characters.slice(offset,offset+255),charProcs=context.obj({}),differences=[1];
    for(let i=0;i<chunk.length;i++){
      const name=`g${i+1}`;charProcs.set(PDFName.of(name),glyph);differences.push(PDFName.of(name));
    }
    const mappings=chunk.map((char,i)=>`<${byteHex(i+1)}> <${utf16Hex(char)}>`);
    let cmap='/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /ATFUnicodeOCR def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n';
    for(let i=0;i<mappings.length;i+=100){const group=mappings.slice(i,i+100);cmap+=`${group.length} beginbfchar\n${group.join('\n')}\nendbfchar\n`;}
    cmap+='endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
    const font=context.register(context.obj({Type:'Font',Subtype:'Type3',FontBBox:[0,0,1000,1000],FontMatrix:[.001,0,0,.001,0,0],CharProcs:charProcs,Encoding:context.obj({Type:'Encoding',Differences:differences}),FirstChar:1,LastChar:chunk.length,Widths:chunk.map(()=>1000),Resources:context.obj({}),ToUnicode:context.register(context.flateStream(cmap))}));
    let name;do{name=PDFName.of(`ATFOCR${crypto.randomUUID().replaceAll('-','')}`);}while(fonts.has(name));
    fonts.set(name,font);chunk.forEach((char,i)=>lookup.set(char,{name:name.toString(),code:byteHex(i+1)}));
  }
  resources.set(PDFName.of('Font'),fonts);page.node.set(PDFName.of('Resources'),resources);
  return lookup;
}
export function drawUnicodeSearchText(doc,page,lookup,text,placement){
  const chars=Array.from(text);if(!chars.length)return;
  if(![placement.x,placement.y,placement.width,placement.height,placement.angle].every(Number.isFinite)||placement.width<=0||placement.height<=0)throw new Error('Invalid searchable text geometry.');
  const size=Math.max(.1,placement.height*.8),advance=placement.width/chars.length,angle=placement.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const number=value=>Number(value.toFixed(8)).toString();
  const commands=['q','BT','3 Tr',`${number(advance/size*100)} Tz`,`${number(c)} ${number(s)} ${number(-s)} ${number(c)} ${number(placement.x)} ${number(placement.y)} Tm`];
  // Emit contiguous mapped text in one show operation, including across
  // character sets; flush only when the 255-character font chunk changes.
  let previous=null,codes='';
  const flush=()=>{if(codes){commands.push(`<${codes}> Tj`);codes='';}};
  for(const char of chars){
    const glyph=lookup.get(char);if(!glyph)throw new Error('Missing Unicode OCR mapping.');
    if(glyph.name!==previous){flush();commands.push(`${glyph.name} ${number(size)} Tf`);previous=glyph.name;}
    codes+=glyph.code;
  }
  flush();
  commands.push('ET','Q');page.node.addContentStream(doc.context.register(doc.context.flateStream(commands.join('\n')+'\n')));
}
