import { PDFDocument, StandardFonts, degrees, rgb } from '../core/pdf-lib.js';
import { getPageContentStreams, replacePageContentStream } from '../core/document-model.js';
import { rewriteByteRanges } from '../mutation/content-stream-editor.js';
import { buildReplacementForSourceLine, buildNeutralizerForSourceRun } from '../mutation/text-operator-rewriter.js';
import { validateReplacementLayout } from '../editing/collision-detector.js';
import { validateRoundTrip } from './roundtrip-validator.js';

function streamBucket(map,pageIndex,streamIndex){
  const key=`${pageIndex}:${streamIndex}`;
  if(!map.has(key))map.set(key,{pageIndex,streamIndex,edits:[]});
  return map.get(key);
}

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

function standardFontForBlock(block,tx=null){
  if(tx?.styleChanged){
    return standardFontForChoice(tx.fontFamily||'serif',!!tx.bold,!!tx.italic);
  }
  const raw=[block.fontName,block.lines?.[0]?.fontName,block.sourceRuns?.[0]?.fontContext?.baseFont].filter(Boolean).join(' ').toLowerCase();
  const bold=/bold|black|semibold|demi/.test(raw);
  const italic=/italic|oblique/.test(raw);
  if(/courier|mono/.test(raw))return standardFontForChoice('mono',bold,italic);
  if(/times|serif|roman/.test(raw))return standardFontForChoice('serif',bold,italic);
  return standardFontForChoice('sans',bold,italic);
}

function standardFontForInsert(tx){
  return standardFontForChoice(tx.fontFamily||'serif',!!tx.bold,!!tx.italic);
}

async function getEmbeddedStandardFont(doc,cache,name){
  if(!cache.has(name))cache.set(name,await doc.embedFont(name));
  return cache.get(name);
}

async function drawReconstructedText(doc,item,fontCache,warnings){
  const {tx,block}=item;
  const page=doc.getPage(tx.pageIndex);
  const pageSize=page.getSize();
  const fontName=standardFontForBlock(block,tx);
  const font=await getEmbeddedStandardFont(doc,fontCache,fontName);
  const outputLines=String(tx.replacementUnicode).split('\n');
  for(let i=0;i<outputLines.length;i++){
    const text=outputLines[i];
    if(!text)continue;
    try{font.encodeText(text);}catch(error){
      throw Object.assign(new Error('Replacement contains characters unavailable in the selected PDF font.'),{code:'RECONSTRUCT_FONT_UNSUPPORTED',cause:error});
    }
    const line=block.lines?.[i]||block.lines?.at(-1);
    if(!line)throw Object.assign(new Error('Missing visual line geometry for reconstructed text.'),{code:'RECONSTRUCT_GEOMETRY_MISSING'});
    const originalSize=Math.max(1,line.fontSize||block.fontSize||12);
    const minX=Number.isFinite(line.minX)?line.minX:(block.bounds?.x??0);
    const maxX=Number.isFinite(line.maxX)?line.maxX:(minX+(block.bounds?.width??1));
    const targetWidth=Math.max(1,maxX-minX);
    let size=tx.styleChanged&&Number.isFinite(Number(tx.fontSize))?Math.max(6,Math.min(72,Number(tx.fontSize))):originalSize;
    let width=font.widthOfTextAtSize(text,size);

    if(tx.styleChanged){
      const pageAvailable=Math.max(1,pageSize.width-minX-4);
      if(width>pageAvailable){
        throw Object.assign(new Error('The selected font size makes this text extend beyond the page.'),{code:'LAYOUT_COLLISION'});
      }
      if(width>targetWidth*1.04){
        warnings.push({code:'STYLE_EXTENDS_ORIGINAL_BOUNDS',pageIndex:tx.pageIndex,blockId:block.id,message:'Formatted text is wider than the original text region.'});
      }
    }else{
      if(width>targetWidth*1.04){
        size=Math.max(6,size*(targetWidth/Math.max(width,1)));
        width=font.widthOfTextAtSize(text,size);
      }
      if(width>targetWidth*1.12)throw Object.assign(new Error('Replacement cannot fit safely in the mapped text region.'),{code:'LAYOUT_COLLISION'});
    }

    const y=Number.isFinite(line.y)?line.y:(block.bounds?.y??0);
    const angle=line.runs?.[0]?.angle||0;
    page.drawText(text,{x:minX,y,size,font,rotate:degrees(angle*180/Math.PI),color:rgb(0,0,0)});
  }
  warnings.push({code:tx.styleChanged?'STYLE_APPLIED':'STYLE_APPROXIMATED',pageIndex:tx.pageIndex,blockId:block.id,message:tx.styleChanged?'Selected font formatting was written into the PDF.':'Replacement was reconstructed with a safe standard PDF font.'});
}

function splitLongWord(word,font,size,maxWidth){
  const out=[];
  let current='';
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
  const sourceLines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
  for(const source of sourceLines){
    if(!source.trim()){wrapped.push('');continue;}
    const words=source.trim().split(/\s+/);
    let line='';
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

async function drawInsertedText(doc,tx,fontCache,warnings){
  const page=doc.getPage(tx.pageIndex);
  if(!page)throw Object.assign(new Error('Target page is unavailable.'),{code:'INSERT_PAGE_MISSING'});
  const pageSize=page.getSize();
  const x=Number(tx.x),y=Number(tx.y);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>pageSize.width||y<0||y>pageSize.height){
    throw Object.assign(new Error('New text position is outside the page.'),{code:'INSERT_POSITION_INVALID'});
  }
  const fontName=standardFontForInsert(tx);
  const font=await getEmbeddedStandardFont(doc,fontCache,fontName);
  const size=Math.max(6,Math.min(72,Number(tx.fontSize)||12));
  const lineHeight=Math.max(size,Number(tx.lineHeight)||size*1.2);
  const availableWidth=Math.max(40,Math.min(Number(tx.maxWidth)||300,pageSize.width-x-8));
  const lines=wrapParagraph(tx.replacementUnicode,font,size,availableWidth);
  const lowestY=y-(Math.max(0,lines.length-1)*lineHeight);
  if(lowestY<-size)throw Object.assign(new Error('The new paragraph extends below the page.'),{code:'INSERT_TEXT_OVERFLOW'});
  for(let i=0;i<lines.length;i++){
    const text=lines[i];
    if(!text)continue;
    try{font.encodeText(text);}catch(error){
      throw Object.assign(new Error('New text contains characters unavailable in the selected PDF font.'),{code:'INSERT_FONT_UNSUPPORTED',cause:error});
    }
    page.drawText(text,{x,y:y-i*lineHeight,size,font,color:rgb(0,0,0)});
  }
  tx._renderedLineCount=lines.length;
  tx._renderedWidth=availableWidth;
  warnings.push({code:'TEXT_INSERTED',pageIndex:tx.pageIndex,transactionId:tx.id,lineCount:lines.length});
}

function neutralizeSourceLines(byStream,tx,sourceLines){
  for(const seq of sourceLines){
    for(const run of seq||[]){
      const n=buildNeutralizerForSourceRun(run);
      if(!n.success)throw Object.assign(new Error(`Cannot neutralize source text safely: ${n.reason}`),{code:n.reason});
      streamBucket(byStream,tx.pageIndex,run.streamIndex).edits.push({start:n.start,end:n.end,replacement:n.replacement});
    }
  }
}

function planDirectReplacement(block,replacementUnicode){
  const outputLines=String(replacementUnicode).split('\n');
  const sourceLines=block.sourceLines||[];
  if(outputLines.length>sourceLines.length)return {success:false,reason:'TEXT_OVERFLOW'};
  const layout=validateReplacementLayout(block,replacementUnicode);
  if(!layout.ok)return {success:false,reason:layout.reason,layout};
  const replacements=[];
  for(let lineIndex=0;lineIndex<sourceLines.length;lineIndex++){
    const seq=sourceLines[lineIndex];
    if(!seq?.length)continue;
    if(lineIndex>=outputLines.length)return {success:false,reason:'RECONSTRUCT_EMPTY_TRAILING_LINE'};
    const r=buildReplacementForSourceLine(seq,outputLines[lineIndex]);
    if(!r.success)return {success:false,reason:r.reason,unsupportedCharacters:r.unsupportedCharacters};
    replacements.push(r);
  }
  return {success:true,replacements,layout};
}

export async function exportEditedPdf(originalBytes,transactions,{validate=true}={}){
  const doc=await PDFDocument.load(originalBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  const byStream=new Map();
  const checks=[];
  const warnings=[];
  const reconstructions=[];
  const insertions=[];
  const fontCache=new Map();

  for(const tx of transactions){
    if(tx.kind==='INSERT_TEXT'){
      if(!String(tx.replacementUnicode||'').trim())continue;
      insertions.push(tx);
      checks.push({kind:'insert',pageIndex:tx.pageIndex,newText:tx.replacementUnicode.replace(/\n/g,' '),oldText:''});
      continue;
    }

    const block=tx.block;
    if(!block||(block.tier!=='DIRECT_EDIT'&&block.tier!=='FONT_SUBSTITUTION'))throw new Error(`Block ${block?.id||tx.blockId||'unknown'} is not safely editable: ${block?.reason||block?.tier||'UNKNOWN'}`);
    const sourceLines=block.sourceLines||[];
    const outputLines=String(tx.replacementUnicode).split('\n');
    if(!sourceLines.length)throw Object.assign(new Error('Mapped source text disappeared.'),{code:'SOURCE_NOT_MAPPED'});
    if(outputLines.length>sourceLines.length)throw Object.assign(new Error('Replacement requires additional source lines.'),{code:'TEXT_OVERFLOW'});

    let usedDirect=false;
    if(block.tier==='DIRECT_EDIT'&&!tx.styleChanged){
      const direct=planDirectReplacement(block,tx.replacementUnicode);
      tx.layoutValidation=direct.layout||null;
      if(direct.success){
        for(const r of direct.replacements){
          streamBucket(byStream,tx.pageIndex,r.streamIndex).edits.push({start:r.start,end:r.end,replacement:r.replacement});
        }
        usedDirect=true;
      }else{
        warnings.push({code:'DIRECT_EDIT_FELL_BACK_TO_RECONSTRUCTION',pageIndex:tx.pageIndex,blockId:block.id,reason:direct.reason});
      }
    }else if(tx.styleChanged){
      warnings.push({code:'FORMATTING_REQUIRES_RECONSTRUCTION',pageIndex:tx.pageIndex,blockId:block.id});
    }

    if(!usedDirect){
      neutralizeSourceLines(byStream,tx,sourceLines);
      reconstructions.push({tx,block});
    }

    checks.push({kind:'replace',pageIndex:tx.pageIndex,newText:tx.replacementUnicode.replace(/\n/g,' '),oldText:tx.originalUnicode.replace(/\n/g,' ')});
  }

  for(const {pageIndex,streamIndex,edits} of byStream.values()){
    const streams=getPageContentStreams(doc,pageIndex);
    const stream=streams.find(s=>s.streamIndex===streamIndex);
    if(!stream)throw new Error('SOURCE_STREAM_DISAPPEARED');
    const rewritten=rewriteByteRanges(stream.bytes,edits);
    const rep=replacePageContentStream(doc,pageIndex,streamIndex,rewritten);
    if(rep.sharedCloned)warnings.push({code:'SHARED_STREAM_CLONED',pageIndex,streamIndex});
  }

  for(const item of reconstructions)await drawReconstructedText(doc,item,fontCache,warnings);
  for(const tx of insertions)await drawInsertedText(doc,tx,fontCache,warnings);

  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const validation=validate?await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks}):null;
  if(validation&&!validation.ok)throw Object.assign(new Error('Export validation failed'),{code:'EXPORT_VALIDATION_FAILED',validation});
  if(validation&&!validation.textVerified)warnings.push({code:'TEXT_EXTRACTION_VERIFICATION_DIFFERED',message:'The PDF structure and rendering passed, but extracted text segmentation differed from the editor check.'});
  return {bytes,blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):null,validation,warnings};
}
