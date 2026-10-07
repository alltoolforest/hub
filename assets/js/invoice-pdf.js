import {pdfLib,canvasBlob} from './core.js';
import {formatMoney,formatUnitRate} from './invoice-engine.js';

export const INVOICE_PAPER_SIZES={
  A4:[595.28,841.89],
  LETTER:[612,792]
};

const SCALE=2;
const MARGIN=42;
const BOTTOM_MARGIN=42;
const MAX_PAGES=60;
const FONT_FAMILY='Arial, "Helvetica Neue", "Noto Sans", sans-serif';

function paperDimensions(name){
  return INVOICE_PAPER_SIZES[name==='LETTER'?'LETTER':'A4'];
}

function applyFont(ctx,size,bold=false){
  ctx.font=(bold?'600 ':'400 ')+size+'px '+FONT_FAMILY;
  ctx.textBaseline='top';
}

function drawText(ctx,text,x,y,{size=10,bold=false,color='#1f2d25',align='left'}={}){
  applyFont(ctx,size,bold);
  ctx.fillStyle=color;
  ctx.textAlign=align;
  ctx.fillText(String(text??''),x,y);
}

function splitLongToken(ctx,token,maxWidth){
  const chars=Array.from(token);
  const parts=[];
  let line='';
  for(const ch of chars){
    const next=line+ch;
    if(line&&ctx.measureText(next).width>maxWidth){
      parts.push(line);
      line=ch;
    }else line=next;
  }
  if(line)parts.push(line);
  return parts.length?parts:[''];
}

export function wrapCanvasText(ctx,text,maxWidth,{size=10,bold=false}={}){
  applyFont(ctx,size,bold);
  const source=String(text??'').replace(/\r\n?/g,'\n');
  const output=[];
  for(const paragraph of source.split('\n')){
    if(!paragraph){
      output.push('');
      continue;
    }
    const words=paragraph.trim().split(/\s+/).filter(Boolean);
    if(!words.length){
      output.push('');
      continue;
    }
    let line='';
    for(const word of words){
      if(ctx.measureText(word).width>maxWidth){
        if(line){output.push(line);line=''}
        const pieces=splitLongToken(ctx,word,maxWidth);
        output.push(...pieces.slice(0,-1));
        line=pieces.at(-1)||'';
        continue;
      }
      const next=line?line+' '+word:word;
      if(line&&ctx.measureText(next).width>maxWidth){
        output.push(line);
        line=word;
      }else line=next;
    }
    if(line)output.push(line);
  }
  return output.length?output:[''];
}

function partyLines(ctx,party,width){
  const lines=[];
  const add=(value,bold=false)=>{
    if(!value)return;
    const wrapped=wrapCanvasText(ctx,value,width,{size:9.5,bold});
    lines.push(...wrapped.map(text=>({text,bold})));
  };
  add(party.name,true);
  add(party.address);
  const contacts=[party.email,party.phone].filter(Boolean).join(' · ');
  add(contacts);
  if(party.taxId)add((party.taxIdLabel||'Tax ID')+': '+party.taxId);
  return lines;
}

function safeFilenamePart(value){
  return String(value||'invoice').replace(/[^\p{L}\p{N}_ -]/gu,'_').replace(/\s+/g,' ').trim().slice(0,80)||'invoice';
}

export function invoicePdfFilename(state){
  return safeFilenamePart(state?.invoiceNumber||'invoice')+'.pdf';
}

class InvoiceCanvasPdf {
  constructor(pdfDoc,width,height){
    this.pdfDoc=pdfDoc;
    this.width=width;
    this.height=height;
    this.pageNumber=0;
    this.canvas=null;
    this.ctx=null;
    this.y=MARGIN;
  }

  async startPage(state,continued=false){
    if(this.canvas)await this.finishPage();
    this.pageNumber++;
    if(this.pageNumber>MAX_PAGES)throw Error('This invoice is too long to export safely. Use Print / Save PDF as a fallback.');
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(this.width*SCALE);
    canvas.height=Math.ceil(this.height*SCALE);
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw Error('PDF drawing is unavailable in this browser.');
    ctx.scale(SCALE,SCALE);
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,this.width,this.height);
    this.canvas=canvas;
    this.ctx=ctx;
    this.y=MARGIN;

    if(continued){
      drawText(ctx,'INVOICE',{valueOf:()=>MARGIN},this.y,{size:16,bold:true});
      drawText(ctx,'#'+state.invoiceNumber,this.width-MARGIN,this.y+2,{size:9,bold:true,align:'right',color:'#52685b'});
      this.y+=30;
      ctx.strokeStyle='#d7e1db';
      ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(MARGIN,this.y);ctx.lineTo(this.width-MARGIN,this.y);ctx.stroke();
      this.y+=14;
    }
  }

  remaining(){
    return this.height-BOTTOM_MARGIN-this.y;
  }

  async ensureSpace(height,state,{continued=true}={}){
    if(this.remaining()>=height)return false;
    await this.startPage(state,continued);
    return true;
  }

  async finishPage(){
    if(!this.canvas)return;
    const ctx=this.ctx;
    drawText(ctx,'AllToolForest · Invoice Builder',MARGIN,this.height-24,{size:7.5,color:'#708177'});
    drawText(ctx,'Page '+this.pageNumber,this.width-MARGIN,this.height-24,{size:7.5,color:'#708177',align:'right'});
    const blob=await canvasBlob(this.canvas,'image/png');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const image=await this.pdfDoc.embedPng(bytes);
    const page=this.pdfDoc.addPage([this.width,this.height]);
    page.drawImage(image,{x:0,y:0,width:this.width,height:this.height});
    this.canvas.width=1;
    this.canvas.height=1;
    this.canvas=null;
    this.ctx=null;
  }
}

function drawWrappedLines(ctx,lines,x,y,{size=9.5,bold=false,color='#1f2d25',lineHeight=12}={}){
  let cursor=y;
  for(const line of lines){
    drawText(ctx,line,x,cursor,{size,bold,color});
    cursor+=lineHeight;
  }
  return cursor;
}

async function drawPartyBlock(renderer,state,title,party){
  const ctx=renderer.ctx;
  const width=renderer.width-2*MARGIN;
  const lines=partyLines(ctx,party,width);
  const lineHeight=12;
  let index=0;
  let first=true;
  while(index<lines.length||first){
    first=false;
    await renderer.ensureSpace(42,state);
    drawText(renderer.ctx,title,MARGIN,renderer.y,{size:9,bold:true,color:'#52685b'});
    renderer.y+=16;
    const available=Math.max(1,Math.floor((renderer.remaining()-8)/lineHeight));
    const take=Math.max(1,Math.min(lines.length-index,available));
    const chunk=lines.slice(index,index+take);
    for(const entry of chunk){
      drawText(renderer.ctx,entry.text,MARGIN,renderer.y,{size:9.5,bold:entry.bold});
      renderer.y+=lineHeight;
    }
    index+=take;
    renderer.y+=10;
    if(index<lines.length)await renderer.startPage(state,true);
  }
}

function drawTableHeader(renderer){
  const {ctx,width}=renderer;
  const content=width-2*MARGIN;
  const desc=content*.40,qty=content*.10,rate=content*.17,tax=content*.16,amount=content*.17;
  const xs=[MARGIN,MARGIN+desc,MARGIN+desc+qty,MARGIN+desc+qty+rate,MARGIN+desc+qty+rate+tax];
  ctx.fillStyle='#f0f5f2';
  ctx.fillRect(MARGIN,renderer.y,content,24);
  const labels=['Description','Qty','Rate','Tax','Amount'];
  for(let i=0;i<labels.length;i++){
    drawText(ctx,labels[i],xs[i]+4,renderer.y+7,{size:8,bold:true,color:'#40564a'});
  }
  renderer.y+=24;
  return {desc,qty,rate,tax,amount,xs};
}

async function drawItems(renderer,state,totals){
  await renderer.ensureSpace(70,state);
  drawText(renderer.ctx,'Items',MARGIN,renderer.y,{size:13,bold:true});
  renderer.y+=22;
  let cols=drawTableHeader(renderer);
  const lineHeight=11;

  for(const [itemIndex,line] of totals.lines.entries()){
    let descLines=wrapCanvasText(renderer.ctx,line.description,cols.desc-10,{size:8.8});
    if(line.unit)descLines.push('Unit: '+line.unit);
    let taxLines=line.taxes.filter(t=>Number(t.ratePercent)!==0).map(t=>t.name+' '+t.ratePercent+'%');
    if(!taxLines.length)taxLines=['—'];
    let di=0,ti=0,firstChunk=true;

    while(di<descLines.length||ti<taxLines.length){
      if(renderer.remaining()<44){
        await renderer.startPage(state,true);
        cols=drawTableHeader(renderer);
      }
      const maxLines=Math.max(1,Math.floor((renderer.remaining()-14)/lineHeight));
      const descChunk=descLines.slice(di,di+maxLines);
      const taxChunk=taxLines.slice(ti,ti+maxLines);
      const used=Math.max(descChunk.length,taxChunk.length,1);
      const rowHeight=14+used*lineHeight;
      if(rowHeight>renderer.remaining()&&renderer.y>MARGIN+60){
        await renderer.startPage(state,true);
        cols=drawTableHeader(renderer);
        continue;
      }

      const top=renderer.y;
      const alt=itemIndex%2===1;
      if(alt){
        renderer.ctx.fillStyle='#fafcfb';
        renderer.ctx.fillRect(MARGIN,top,renderer.width-2*MARGIN,rowHeight);
      }
      const prefix=firstChunk?'':'(continued) ';
      for(let i=0;i<descChunk.length;i++)drawText(renderer.ctx,(i===0?prefix:'')+descChunk[i],cols.xs[0]+4,top+7+i*lineHeight,{size:8.8,bold:firstChunk&&i===0});
      for(let i=0;i<taxChunk.length;i++)drawText(renderer.ctx,taxChunk[i],cols.xs[3]+4,top+7+i*lineHeight,{size:8.3});
      if(firstChunk){
        drawText(renderer.ctx,line.quantity,cols.xs[1]+4,top+7,{size:8.8});
        drawText(renderer.ctx,formatUnitRate(line.rate,totals.currency),cols.xs[2]+4,top+7,{size:8.3});
        drawText(renderer.ctx,formatMoney(line.totalMinor,totals.currency),renderer.width-MARGIN-4,top+7,{size:8.5,bold:true,align:'right'});
      }
      renderer.ctx.strokeStyle='#d7e1db';
      renderer.ctx.lineWidth=.6;
      renderer.ctx.beginPath();
      renderer.ctx.moveTo(MARGIN,top+rowHeight);
      renderer.ctx.lineTo(renderer.width-MARGIN,top+rowHeight);
      renderer.ctx.stroke();
      renderer.y+=rowHeight;
      di+=descChunk.length;
      ti+=taxChunk.length;
      firstChunk=false;
    }
  }
  renderer.y+=12;
}

async function drawTotals(renderer,state,totals){
  const rows=[
    ['Subtotal',totals.subtotalMinor,false],
    ...(totals.discountMinor?[['Discount',-totals.discountMinor,false]]:[]),
    ...totals.taxSummary.filter(t=>t.amountMinor).map(t=>[t.name+' ('+t.ratePercent+'%)',t.amountMinor,false]),
    ['Total due',totals.totalMinor,true]
  ];
  const height=34+rows.length*18;
  await renderer.ensureSpace(height,state);
  drawText(renderer.ctx,'Totals',MARGIN,renderer.y,{size:13,bold:true});
  renderer.y+=22;
  for(const [label,minor,strong] of rows){
    const amount=minor<0?'−'+formatMoney(Math.abs(minor),totals.currency):formatMoney(minor,totals.currency);
    drawText(renderer.ctx,label,renderer.width-250,renderer.y,{size:strong?10.5:9,bold:strong});
    drawText(renderer.ctx,amount,renderer.width-MARGIN,renderer.y,{size:strong?11:9,bold:strong,align:'right'});
    renderer.y+=strong?22:17;
  }
  renderer.y+=8;
}

async function drawTextSection(renderer,state,title,text){
  if(!text)return;
  const width=renderer.width-2*MARGIN;
  let lines=wrapCanvasText(renderer.ctx,text,width,{size:9});
  let index=0;
  while(index<lines.length){
    await renderer.ensureSpace(40,state);
    drawText(renderer.ctx,title,MARGIN,renderer.y,{size:10,bold:true,color:'#40564a'});
    renderer.y+=17;
    const available=Math.max(1,Math.floor((renderer.remaining()-8)/12));
    const chunk=lines.slice(index,index+available);
    renderer.y=drawWrappedLines(renderer.ctx,chunk,MARGIN,renderer.y,{size:9,lineHeight:12});
    renderer.y+=10;
    index+=chunk.length;
    if(index<lines.length)await renderer.startPage(state,true);
  }
}

function drawFirstPageHeader(renderer,state){
  const {ctx,width}=renderer;
  drawText(ctx,'INVOICE',MARGIN,renderer.y,{size:24,bold:true});
  drawText(ctx,'#'+state.invoiceNumber,width-MARGIN,renderer.y+2,{size:10,bold:true,align:'right',color:'#40564a'});
  renderer.y+=34;
  const meta=[
    ['Invoice date',state.invoiceDate],
    ['Due date',state.dueDate],
    ['Reference',state.reference],
    ['Currency',state.currency]
  ].filter(([,value])=>value);
  for(const [label,value] of meta){
    drawText(ctx,label+':',MARGIN,renderer.y,{size:8.5,bold:true,color:'#52685b'});
    const lines=wrapCanvasText(ctx,value,width-2*MARGIN-90,{size:8.5});
    drawText(ctx,lines[0]||'',MARGIN+82,renderer.y,{size:8.5});
    renderer.y+=12;
    for(const extra of lines.slice(1)){
      drawText(ctx,extra,MARGIN+82,renderer.y,{size:8.5});
      renderer.y+=12;
    }
  }
  renderer.y+=8;
  ctx.strokeStyle='#a9bcb0';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(MARGIN,renderer.y);ctx.lineTo(width-MARGIN,renderer.y);ctx.stroke();
  renderer.y+=16;
}

export async function generateInvoicePdf(state,totals,paperSize='A4'){
  if(typeof document==='undefined'||typeof document.createElement!=='function')throw Error('PDF export requires a browser.');
  const [width,height]=paperDimensions(paperSize);
  try{
    const lib=await pdfLib();
    const pdfDoc=await lib.PDFDocument.create();
    pdfDoc.setCreator('AllToolForest Invoice Builder');
    pdfDoc.setProducer('AllToolForest');
    const renderer=new InvoiceCanvasPdf(pdfDoc,width,height);
    await renderer.startPage(state,false);
    drawFirstPageHeader(renderer,state);
    await drawPartyBlock(renderer,state,'From',state.seller);
    await drawPartyBlock(renderer,state,'Bill to',state.customer);
    await drawItems(renderer,state,totals);
    await drawTotals(renderer,state,totals);
    await drawTextSection(renderer,state,'Payment terms',state.paymentTerms);
    await drawTextSection(renderer,state,'Payment instructions',state.paymentInstructions);
    await drawTextSection(renderer,state,'Notes',state.notes);
    await renderer.finishPage();
    const bytes=await pdfDoc.save();
    if(!bytes?.length)throw Error('Generated PDF was empty.');
    return {
      blob:new Blob([bytes],{type:'application/pdf'}),
      pageCount:renderer.pageNumber,
      filename:invoicePdfFilename(state),
      paperSize:paperSize==='LETTER'?'LETTER':'A4'
    };
  }catch(error){
    if(/too long to export safely/i.test(error?.message||''))throw error;
    throw Error('Could not generate the PDF on this device. Use Print / Save PDF as a fallback.');
  }
}
