// Independently drawn QA scan-style pages, not physical scanner evidence.
import {createCanvas} from '@napi-rs/canvas';
import {PDF} from './pdf-compressor-task1-fixtures.mjs';
export async function buildImageFixture({gray=false,width=800,height=1100,masked=false,shared=false,hiddenOCR=false}={}){
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
  ctx.fillStyle='#f8f4ee';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#222';ctx.font=`${Math.round(width/30)}px sans-serif`;
  for(let n=0;n<15;n++)ctx.fillText(`Scan readability line ${n+1}: Invoice 12345 — total 678.90`,30,60+n*height/20);
  const rgba=ctx.getImageData(0,0,width,height).data,raw=new Uint8Array(width*height*(gray?1:3));
  // Deterministic light sensor-like noise makes the source realistically less
  // efficient than a blank synthetic image while keeping text edges intact.
  for(let p=0;p<width*height;p++){
    const noise=((p*17)%7)-3;
    if(gray)raw[p]=Math.max(0,Math.min(255,Math.round((rgba[p*4]+rgba[p*4+1]+rgba[p*4+2])/3)+noise));
    else for(let c=0;c<3;c++)raw[p*3+c]=Math.max(0,Math.min(255,rgba[p*4+c]+noise));
  }
  const doc=await PDF.PDFDocument.create(),N=PDF.PDFName.of;
  const dict={Type:'XObject',Subtype:'Image',Width:width,Height:height,
    BitsPerComponent:8,ColorSpace:gray?'DeviceGray':'DeviceRGB'};
  if(masked)dict.Mask=[0,0,0,0,0,0];
  const image=doc.context.register(doc.context.flateStream(raw,dict));
  const font=await doc.embedFont(PDF.StandardFonts.Helvetica);
  for(let n=0;n<(shared?2:1);n++){
    const page=doc.addPage([600,800]);page.node.set(N('Resources'),doc.context.obj({XObject:{Image:image}}));
    page.pushOperators(PDF.pushGraphicsState(),PDF.scale(600,800),PDF.drawObject('Image'),PDF.popGraphicsState());
    if(hiddenOCR)page.pushOperators(PDF.setTextRenderingMode(3));
    page.drawText('OCR retained: Invoice 12345 total 678.90',{x:30,y:760,size:10,font});
  }
  return new Uint8Array(await doc.save({useObjectStreams:false}));
}
