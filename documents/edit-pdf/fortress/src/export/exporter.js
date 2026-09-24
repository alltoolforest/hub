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

function standardFontForBlock(block){
  const raw=[block.fontName,block.lines?.[0]?.fontName,block.sourceRuns?.[0]?.fontContext?.baseFont].filter(Boolean).join(' ').toLowerCase();
  const bold=/bold|black|semibold|demi/.test(raw);
  const italic=/italic|oblique/.test(raw);
  if(/courier|mono/.test(raw)){
    if(bold&&italic)return StandardFonts.CourierBoldOblique;
    if(bold)return StandardFonts.CourierBold;
    if(italic)return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if(/times|serif|roman/.test(raw)){
    if(bold&&italic)return StandardFonts.TimesRomanBoldItalic;
    if(bold)return StandardFonts.TimesRomanBold;
    if(italic)return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if(bold&&italic)return StandardFonts.HelveticaBoldOblique;
  if(bold)return StandardFonts.HelveticaBold;
  if(italic)return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

async function getEmbeddedStandardFont(doc,cache,name){
  if(!cache.has(name))cache.set(name,await doc.embedFont(name));
  return cache.get(name);
}

async function drawReconstructedText(doc,item,fontCache,warnings){
  const {tx,block}=item;
  const page=doc.getPage(tx.pageIndex);
  const fontName=standardFontForBlock(block);
  const font=await getEmbeddedStandardFont(doc,fontCache,fontName);
  const outputLines=String(tx.replacementUnicode).split('\n');
  for(let i=0;i<outputLines.length;i++){
    const text=outputLines[i];
    if(!text)continue;
    try{font.encodeText(text);}catch(error){
      throw Object.assign(new Error('Replacement contains characters unavailable in the safe fallback font.'),{code:'RECONSTRUCT_FONT_UNSUPPORTED',cause:error});
    }
    const line=block.lines?.[i]||block.lines?.at(-1);
    if(!line)throw Object.assign(new Error('Missing visual line geometry for reconstructed text.'),{code:'RECONSTRUCT_GEOMETRY_MISSING'});
    const originalSize=Math.max(1,line.fontSize||block.fontSize||12);
    const minX=Number.isFinite(line.minX)?line.minX:(block.bounds?.x??0);
    const maxX=Number.isFinite(line.maxX)?line.maxX:(minX+(block.bounds?.width??1));
    const targetWidth=Math.max(1,maxX-minX);
    let size=originalSize;
    let width=font.widthOfTextAtSize(text,size);
    if(width>targetWidth*1.04){
      size=Math.max(6,size*(targetWidth/Math.max(width,1)));
      width=font.widthOfTextAtSize(text,size);
    }
    if(width>targetWidth*1.12)throw Object.assign(new Error('Replacement cannot fit safely in the mapped text region.'),{code:'LAYOUT_COLLISION'});
    const y=Number.isFinite(line.y)?line.y:(block.bounds?.y??0);
    const angle=line.runs?.[0]?.angle||0;
    page.drawText(text,{x:minX,y,size,font,rotate:degrees(angle*180/Math.PI),color:rgb(0,0,0)});
  }
  warnings.push({code:'STYLE_APPROXIMATED',pageIndex:tx.pageIndex,blockId:block.id,message:'Replacement was reconstructed with a safe standard PDF font.'});
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

export async function exportEditedPdf(originalBytes,transactions){
  const doc=await PDFDocument.load(originalBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  const byStream=new Map();
  const checks=[];
  const warnings=[];
  const reconstructions=[];
  const fontCache=new Map();

  for(const tx of transactions){
    const block=tx.block;
    if(block.tier!=='DIRECT_EDIT'&&block.tier!=='FONT_SUBSTITUTION')throw new Error(`Block ${block.id} is not safely editable: ${block.reason||block.tier}`);
    const sourceLines=block.sourceLines||[];
    const outputLines=String(tx.replacementUnicode).split('\n');
    if(!sourceLines.length)throw Object.assign(new Error('Mapped source text disappeared.'),{code:'SOURCE_NOT_MAPPED'});
    if(outputLines.length>sourceLines.length)throw Object.assign(new Error('Replacement requires additional source lines.'),{code:'TEXT_OVERFLOW'});

    let usedDirect=false;
    if(block.tier==='DIRECT_EDIT'){
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
    }

    if(!usedDirect){
      neutralizeSourceLines(byStream,tx,sourceLines);
      reconstructions.push({tx,block});
    }

    checks.push({pageIndex:tx.pageIndex,newText:tx.replacementUnicode.replace(/\n/g,' '),oldText:tx.originalUnicode.replace(/\n/g,' ')});
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

  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const validation=await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks});
  if(!validation.ok)throw Object.assign(new Error('Export validation failed'),{validation});
  return {bytes,blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):null,validation,warnings};
}
