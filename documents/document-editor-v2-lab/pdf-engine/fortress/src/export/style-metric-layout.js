import { PDFDocument, StandardFonts } from '../core/pdf-lib.js';

function standardFontForChoice(family,bold=false,italic=false){
  if(family==='mono'){
    if(bold&&italic)return StandardFonts.CourierBoldOblique;
    if(bold)return StandardFonts.CourierBold;
    if(italic)return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if(family==='sans'){
    if(bold&&italic)return StandardFonts.HelveticaBoldOblique;
    if(bold)return StandardFonts.HelveticaBold;
    if(italic)return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
  }
  if(bold&&italic)return StandardFonts.TimesRomanBoldItalic;
  if(bold)return StandardFonts.TimesRomanBold;
  if(italic)return StandardFonts.TimesRomanItalic;
  return StandardFonts.TimesRoman;
}

function splitLongWord(word,font,size,maxWidth){
  const out=[];let current='';
  for(const ch of Array.from(word)){
    const next=current+ch;
    if(current&&font.widthOfTextAtSize(next,size)>maxWidth){out.push(current);current=ch;}
    else current=next;
  }
  if(current)out.push(current);
  return out;
}

function wrappedLineCount(text,font,size,maxWidth){
  const source=String(text||'').trim();
  if(!source)return 1;
  const words=source.split(/\s+/);
  let count=0,line='';
  for(const originalWord of words){
    const pieces=font.widthOfTextAtSize(originalWord,size)>maxWidth?splitLongWord(originalWord,font,size,maxWidth):[originalWord];
    for(const word of pieces){
      const candidate=line?`${line} ${word}`:word;
      if(line&&font.widthOfTextAtSize(candidate,size)>maxWidth){count++;line=word;}
      else line=candidate;
    }
  }
  if(line)count++;
  return Math.max(1,count);
}

export async function createStyleMetricLayout(){
  const doc=await PDFDocument.create();
  const cache=new Map();
  async function fontFor(style={}){
    const name=standardFontForChoice(style.fontFamily||'serif',!!style.bold,!!style.italic);
    if(!cache.has(name))cache.set(name,await doc.embedFont(name));
    return cache.get(name);
  }
  return {
    async lineCount(text,style={},maxWidth=300){
      const size=Math.max(6,Math.min(72,Number(style.fontSize)||12));
      const font=await fontFor(style);
      try{font.encodeText(String(text||''));}catch{return 1;}
      return wrappedLineCount(text,font,size,Math.max(20,Number(maxWidth)||300));
    },
  };
}
