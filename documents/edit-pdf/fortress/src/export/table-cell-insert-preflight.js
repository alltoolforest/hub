import { PDFDocument, StandardFonts } from '../core/pdf-lib.js';
import { tableCellInsertionLimits } from './table-cell-geometry.js';

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

function wrapParagraph(text,font,size,maxWidth){
  const wrapped=[];
  for(const source of String(text||'').replace(/\r\n?/g,'\n').split('\n')){
    if(!source.trim()){wrapped.push('');continue;}
    const words=source.trim().split(/\s+/);let line='';
    for(const originalWord of words){
      const pieces=font.widthOfTextAtSize(originalWord,size)>maxWidth?splitLongWord(originalWord,font,size,maxWidth):[originalWord];
      for(const word of pieces){
        const candidate=line?`${line} ${word}`:word;
        if(line&&font.widthOfTextAtSize(candidate,size)>maxWidth){wrapped.push(line);line=word;}
        else line=candidate;
      }
    }
    if(line)wrapped.push(line);
  }
  return wrapped.length?wrapped:[''];
}

export async function preflightTableCellInsertions(originalBytes,transactions=[]){
  const candidates=(transactions||[]).filter(tx=>tx?.kind==='INSERT_TEXT'&&tx?.tableCell&&String(tx?.replacementUnicode||'').trim());
  if(!candidates.length)return transactions;

  const doc=await PDFDocument.load(originalBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  const fontCache=new Map(),prepared=new Map();
  try{
    for(const tx of candidates){
      const page=doc.getPage(Number(tx.pageIndex));
      if(!page)throw Object.assign(new Error('Table-cell insertion target page is unavailable.'),{code:'TABLE_CELL_INSERT_PAGE_MISSING'});
      const pageSize=page.getSize(),x=Number(tx.x),y=Number(tx.y);
      if(!Number.isFinite(x)||!Number.isFinite(y))throw Object.assign(new Error('Table-cell insertion coordinates are invalid.'),{code:'TABLE_CELL_INSERT_POSITION_INVALID'});

      const fontName=standardFontForChoice(tx.fontFamily||'serif',!!tx.bold,!!tx.italic);
      if(!fontCache.has(fontName))fontCache.set(fontName,await doc.embedFont(fontName));
      const font=fontCache.get(fontName);
      const size=Math.max(6,Math.min(72,Number(tx.fontSize)||12));
      const lineHeight=Math.max(size,Number(tx.lineHeight)||size*1.2);
      const padding=Math.max(1,Number(tx.tableCell?.padding)||2.5);
      const cellWidth=Math.max(0,Number(tx.tableCell.right)-padding-x);
      const availableWidth=Math.min(Number(tx.maxWidth)||300,pageSize.width-x-8,cellWidth);
      if(!Number.isFinite(availableWidth)||availableWidth<40){
        throw Object.assign(new Error('There is not enough safe horizontal space inside this table cell.'),{code:'TABLE_CELL_INSERT_WIDTH_UNSAFE',transactionId:tx.id});
      }

      const lines=wrapParagraph(tx.replacementUnicode,font,size,availableWidth);
      for(const text of lines){
        if(!text)continue;
        try{font.encodeText(text);}catch(error){
          throw Object.assign(new Error('Inserted table-cell text contains characters unavailable in the selected PDF font.'),{code:'INSERT_FONT_UNSUPPORTED',transactionId:tx.id,cause:error});
        }
      }
      const limits=tableCellInsertionLimits(tx.tableCell,{x,y,fontSize:size,lineHeight,lineCount:lines.length,minWidth:40});
      if(!limits.ok){
        throw Object.assign(new Error('This text cannot fit completely inside the detected table cell.'),{code:limits.reason||'TABLE_CELL_INSERT_UNSAFE',transactionId:tx.id,limits});
      }
      prepared.set(tx.id,{maxWidth:Math.min(availableWidth,limits.availableWidth),tableCellInsertPreflight:{lineCount:lines.length,fontName,limits}});
    }
  }finally{
    try{doc?.context?.flush?.();}catch{}
  }

  return (transactions||[]).map(tx=>{
    const safe=prepared.get(tx?.id);if(!safe)return tx;
    return {
      ...tx,
      maxWidth:safe.maxWidth,
      tableCellInsertPreflight:safe.tableCellInsertPreflight,
      reflowPlan:{...(tx.reflowPlan||{}),enabled:false,reason:'TABLE_CELL_LOCAL_INSERT'},
    };
  });
}
