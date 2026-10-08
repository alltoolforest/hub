// Image OCR document export. Text comes ONLY from the user-editable OCR text area.
// Uses locally bundled docx.js / pdf-lib; it does not upload extracted text.
import {normalizedLines} from './image-ocr-batch.js';
const MAX_CHARS=500_000;
export function checkedText(text){
 if(!text?.trim())throw Error('Recognize or enter text before downloading.');
 if(text.length>MAX_CHARS)throw Error('Text exceeds the 500,000-character export safety limit. Export a smaller batch.');
 return text;
}
export function wrappedPdfLines(text,font,size,width){
 const result=[];
 for(const line of normalizedLines(text)){
  if(!line.trim()){result.push('');continue;}
  let current='';
  for(const word of line.split(/(\s+)/).filter(Boolean)){
   if(font.widthOfTextAtSize(current+word,size)<=width){current+=word;continue;}
   if(current.trim()){result.push(current.trimEnd());current='';}
   if(font.widthOfTextAtSize(word,size)<=width){current=word.trimStart();continue;}
   // A long OCR token such as a serial number or URL should not overflow a page.
   for(const char of Array.from(word)){
    if(current&&font.widthOfTextAtSize(current+char,size)>width){result.push(current);current='';}
    current+=char;
   }
  }
  result.push(current.trimEnd());
 }
 return result;
}
export async function docxBlob(text,engine){
 checkedText(text);
 const {Document,Paragraph,TextRun,Packer}=engine||{};
 if(!Document||!Paragraph||!TextRun||!Packer?.toBlob)throw Error('DOCX export engine is unavailable.');
 const children=normalizedLines(text).map(line=>new Paragraph({
  children:[new TextRun({text:line||' ',size:22})],spacing:{after:line?50:100}
 }));
 const doc=new Document({sections:[{properties:{},children}]});
 const blob=await Packer.toBlob(doc);
 if(!blob?.size)throw Error('DOCX export returned an empty file.');
 return blob;
}

async function unicodePdfBlob(text,lib){
 if(typeof document==='undefined')throw Error('This environment cannot render international PDF text. Download DOCX to preserve the complete text.');
 const doc=await lib.PDFDocument.create();
 const canvas=document.createElement('canvas');
 canvas.width=1190;canvas.height=1684;
 const context=canvas.getContext('2d');
 if(!context)throw Error('PDF image rendering is unavailable. Download DOCX to preserve the complete text.');
 const margin=86,limit=canvas.width-margin,top=100,bottom=100,lineHeight=34;
 const maxPageCount=40;
 let y=top,pageLines=0,pageCount=0;
 const resetPage=()=>{
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
  context.font='23px Arial, sans-serif';context.fillStyle='#172127';
  context.textBaseline='top';y=top;pageLines=0;
 };
 async function flush(){
  if(!pageLines)return;
  if(++pageCount>maxPageCount)throw Error('International-text PDF exceeds 40 pages. Export a smaller batch or use DOCX.');
  const png=await new Promise((resolve,reject)=>canvas.toBlob(
   blob=>blob?resolve(blob):reject(Error('PDF image export failed. Download DOCX.')),'image/png'
  ));
  const img=await doc.embedPng(await png.arrayBuffer());
  const page=doc.addPage([595.28,841.89]);
  page.drawImage(img,{x:0,y:0,width:595.28,height:841.89});
  resetPage();
 }
 async function drawLine(line){
  if(y+lineHeight>canvas.height-bottom)await flush();
  if(line)context.fillText(line,margin,y);
  y+=lineHeight;pageLines++;
 }
 const maxWidth=limit-margin;
 const segments=str=>{
  if(typeof Intl!=='undefined'&&Intl.Segmenter)
   return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(str)].map(x=>x.segment);
  return Array.from(str);
 };
 try{
  resetPage();
  for(const line of normalizedLines(text)){
   if(!line.trim()){await drawLine('');continue;}
   let current='';
   const parts=line.match(/\S+|\s+/gu)||[];
   for(const part of parts){
    if(context.measureText(current+part).width<=maxWidth){current+=part;continue;}
    if(current.trim()){await drawLine(current.trimEnd());current='';}
    if(context.measureText(part).width<=maxWidth){current=part.trimStart();continue;}
    for(const segment of segments(part)){
     if(current&&context.measureText(current+segment).width>maxWidth){
      await drawLine(current);current='';
     }
     current+=segment;
    }
   }
   if(current)await drawLine(current.trimEnd());
  }
  await flush();
  const bytes=await doc.save();
  const blob=new Blob([bytes],{type:'application/pdf'});
  if(!blob.size||blob.size>40*1024*1024)
   throw Error('International-text PDF exceeds the export size limit. Download DOCX instead.');
  // Generated PDF preserves glyphs visually. The original text is fully editable in DOCX.
  blob.ocrTextRasterized=true;
  return blob;
 }finally{canvas.width=0;canvas.height=0;}
}

export async function pdfBlob(text,lib){
 checkedText(text);
 if(!lib?.PDFDocument||!lib?.StandardFonts)throw Error('PDF export engine is unavailable.');
 const doc=await lib.PDFDocument.create();
 const font=await doc.embedFont(lib.StandardFonts.Helvetica);
 const size=11,lineHeight=16,left=44,top=48,bottom=48;
 const pageW=595.28,pageH=841.89,width=pageW-2*left;
 let lines;
 try{lines=wrappedPdfLines(text,font,size,width);for(const line of lines)font.encodeText(line);}
 catch(error){
  if(!/encod|WinAnsi|character/i.test(String(error?.message||error)))throw error;
  // Standard PDF fonts cannot cover many languages. Preserve visible characters
  // through a browser-rendered PDF, without pretending that its text is selectable.
  return unicodePdfBlob(text,lib);
 }
 let page=null,y=0,n=0;
 for(const line of lines){
  if(!page||y<bottom){
   if(++n>160)throw Error('PDF exceeds the 160-page export safety limit. Export fewer images.');
   page=doc.addPage([pageW,pageH]);y=pageH-top;
  }
  if(line)page.drawText(line,{x:left,y,size,font,color:lib.rgb(0.08,0.12,0.13)});
  y-=lineHeight;
 }
 const bytes=await doc.save();
 const blob=new Blob([bytes],{type:'application/pdf'});
 if(!blob.size)throw Error('PDF export returned an empty file.');
 return blob;
}
