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
export async function pdfBlob(text,lib){
 checkedText(text);
 if(!lib?.PDFDocument||!lib?.StandardFonts)throw Error('PDF export engine is unavailable.');
 const doc=await lib.PDFDocument.create();
 const font=await doc.embedFont(lib.StandardFonts.Helvetica);
 const size=11,lineHeight=16,left=44,top=48,bottom=48;
 const pageW=595.28,pageH=841.89,width=pageW-2*left;
 let lines;
 try{lines=wrappedPdfLines(text,font,size,width);for(const line of lines)font.encodeText(line);}
 catch(error){throw Error('This PDF font cannot represent every extracted character. Download DOCX to preserve the complete original text.');}
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
