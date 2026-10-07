import {formatMoney,formatUnitRate} from './invoice-engine.js';
function concatBytes(parts){
  const length=parts.reduce((sum,part)=>sum+part.length,0);
  const out=new Uint8Array(length);
  let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.length}
  return out;
}
const ascii=text=>new TextEncoder().encode(String(text));
function dataUrlToBytes(dataUrl){
  const base64=String(dataUrl).split(',')[1]||'';
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function wrapText(ctx,text,maxWidth){
  const source=String(text??'').replace(/\r/g,'');
  if(!source)return [''];
  const lines=[];
  for(const paragraph of source.split('\n')){
    if(!paragraph){lines.push('');continue}
    const words=paragraph.split(/\s+/).filter(Boolean);
    let line='';
    for(const word of words){
      const candidate=line?line+' '+word:word;
      if(ctx.measureText(candidate).width<=maxWidth){line=candidate;continue}
      if(line)lines.push(line);
      if(ctx.measureText(word).width<=maxWidth){line=word;continue}
      let chunk='';
      for(const char of word){
        const next=chunk+char;
        if(chunk&&ctx.measureText(next).width>maxWidth){lines.push(chunk);chunk=char}else chunk=next;
      }
      line=chunk;
    }
    if(line)lines.push(line);
  }
  return lines.length?lines:[''];
}
function safeFilenamePart(value){
  const clean=String(value||'invoice').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'');
  return (clean||'invoice').slice(0,80);
}
export function invoicePdfFilename(invoiceNumber){
  return 'invoice-'+safeFilenamePart(invoiceNumber)+'.pdf';
}
function pageMetrics(pageSize){
  return pageSize==='LETTER'
    ?{pdfWidth:612,pdfHeight:792,canvasWidth:1275,canvasHeight:1650}
    :{pdfWidth:595.28,pdfHeight:841.89,canvasWidth:1240,canvasHeight:1754};
}
function buildPdfFromJpegs(pages,pageSize){
  const {pdfWidth,pdfHeight}=pageMetrics(pageSize);
  const objectCount=2+pages.length*3,objects=new Array(objectCount+1),kids=[];
  objects[1]=ascii('<< /Type /Catalog /Pages 2 0 R >>');
  for(let i=0;i<pages.length;i++){
    const pageObj=3+i*3,imageObj=pageObj+1,contentObj=pageObj+2,page=pages[i];
    kids.push(pageObj+' 0 R');
    objects[pageObj]=ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pdfWidth+' '+pdfHeight+'] /Resources << /XObject << /Im'+(i+1)+' '+imageObj+' 0 R >> >> /Contents '+contentObj+' 0 R >>');
    objects[imageObj]=concatBytes([ascii('<< /Type /XObject /Subtype /Image /Width '+page.width+' /Height '+page.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+page.jpeg.length+' >>\nstream\n'),page.jpeg,ascii('\nendstream')]);
    const stream='q\n'+pdfWidth+' 0 0 '+pdfHeight+' 0 0 cm\n/Im'+(i+1)+' Do\nQ';
    objects[contentObj]=ascii('<< /Length '+ascii(stream).length+' >>\nstream\n'+stream+'\nendstream');
  }
  objects[2]=ascii('<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages.length+' >>');
  const chunks=[ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')],offsets=new Array(objectCount+1).fill(0);
  let position=chunks[0].length;
  for(let i=1;i<=objectCount;i++){
    offsets[i]=position;
    const prefix=ascii(i+' 0 obj\n'),suffix=ascii('\nendobj\n');
    chunks.push(prefix,objects[i],suffix);position+=prefix.length+objects[i].length+suffix.length;
  }
  const xrefOffset=position;
  let xref='xref\n0 '+(objectCount+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<=objectCount;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  xref+='trailer\n<< /Size '+(objectCount+1)+' /Root 1 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF';
  chunks.push(ascii(xref));
  return concatBytes(chunks);
}
function drawInvoicePages(state,totals,pageSize){
  if(typeof document==='undefined')throw Error('browser_canvas_unavailable');
  const {canvasWidth,canvasHeight}=pageMetrics(pageSize);
  const margin=88,bottom=86,contentWidth=canvasWidth-margin*2,lineHeight=31;
  const pages=[];
  let canvas,ctx,y,pageNumber=0;

  function newCanvas(){
    canvas=document.createElement('canvas');canvas.width=canvasWidth;canvas.height=canvasHeight;
    ctx=canvas.getContext('2d');if(!ctx)throw Error('browser_canvas_unavailable');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvasWidth,canvasHeight);ctx.fillStyle='#111';ctx.textBaseline='top';
    pageNumber++;y=margin;
    ctx.font='700 42px Arial';ctx.fillText('INVOICE',margin,y);ctx.font='24px Arial';
    const number='#'+state.invoiceNumber;ctx.fillText(number,canvasWidth-margin-ctx.measureText(number).width,y+8);
    y+=72;
    ctx.strokeStyle='#c8c8c8';ctx.beginPath();ctx.moveTo(margin,y);ctx.lineTo(canvasWidth-margin,y);ctx.stroke();y+=24;
    if(pageNumber>1){ctx.font='20px Arial';ctx.fillText('Invoice '+state.invoiceNumber+' · continued',margin,y);y+=42}
  }
  function pushPage(){
    pages.push({width:canvasWidth,height:canvasHeight,jpeg:dataUrlToBytes(canvas.toDataURL('image/jpeg',0.92))});
  }
  function ensure(height){
    if(y+height<=canvasHeight-bottom)return;
    pushPage();newCanvas();
  }
  function textBlock(text,x,width,font='22px Arial',gap=8){
    ctx.font=font;const lines=wrapText(ctx,text,width);const h=lines.length*lineHeight+gap;ensure(h);
    for(const line of lines){ctx.fillText(line,x,y,width);y+=lineHeight}
    y+=gap;
  }
  function labelValue(label,value,x,width){
    if(!value)return;
    ctx.font='700 18px Arial';ctx.fillStyle='#555';ctx.fillText(label.toUpperCase(),x,y);
    y+=25;ctx.fillStyle='#111';textBlock(value,x,width,'22px Arial',12);
  }
  function partyLines(party){
    const out=[party.name,party.address,party.email,party.phone];
    if(party.taxId)out.push((party.taxIdLabel||'Tax ID')+': '+party.taxId);
    return out.filter(Boolean).join('\n');
  }
  newCanvas();
  const col=(contentWidth-50)/2,startY=y;
  labelValue('From',partyLines(state.seller),margin,col);
  const leftEnd=y;y=startY;labelValue('Bill to',partyLines(state.customer),margin+col+50,col);
  y=Math.max(y,leftEnd)+10;
  const meta=[['Invoice date',state.invoiceDate],['Due date',state.dueDate],['Reference',state.reference],['Currency',state.currency]].filter(([,v])=>v);
  ensure(meta.length*30+36);ctx.font='20px Arial';
  for(const [label,value] of meta){ctx.font='700 19px Arial';ctx.fillText(label+':',margin,y);ctx.font='19px Arial';ctx.fillText(String(value),margin+180,y);y+=30}
  y+=20;

  function tableHeader(){
    ensure(46);ctx.fillStyle='#f1f1f1';ctx.fillRect(margin,y,contentWidth,38);ctx.fillStyle='#111';ctx.font='700 18px Arial';
    ctx.fillText('DESCRIPTION',margin+10,y+9);ctx.fillText('QTY',margin+620,y+9);ctx.fillText('RATE',margin+735,y+9);ctx.fillText('AMOUNT',margin+920,y+9);y+=50;
  }
  tableHeader();
  for(const line of totals.lines){
    ctx.font='20px Arial';
    const descLines=wrapText(ctx,line.description,560);
    const taxLines=line.taxes.filter(t=>Number(t.ratePercent)!==0).map(t=>t.name+' '+t.ratePercent+'%');
    const rowHeight=Math.max(58,descLines.length*27+(line.unit?25:0)+(taxLines.length?25:0)+16);
    if(y+rowHeight>canvasHeight-bottom){pushPage();newCanvas();tableHeader()}
    let dy=y+6;for(const part of descLines){ctx.fillText(part,margin+10,dy,560);dy+=27}
    ctx.font='17px Arial';ctx.fillStyle='#555';
    if(line.unit){ctx.fillText('Unit: '+line.unit,margin+10,dy);dy+=23}
    if(taxLines.length)ctx.fillText(taxLines.join(', '),margin+10,dy,560);
    ctx.fillStyle='#111';ctx.font='20px Arial';
    ctx.fillText(String(line.quantity),margin+620,y+6,100);
    ctx.fillText(line.rateFormatted||'',margin+735,y+6,170);
    ctx.fillText(line.totalFormatted||'',margin+920,y+6,210);
    y+=rowHeight;ctx.strokeStyle='#ddd';ctx.beginPath();ctx.moveTo(margin,y);ctx.lineTo(canvasWidth-margin,y);ctx.stroke();y+=8;
  }

  const totalRows=[['Subtotal',totals.subtotalFormatted]];
  if(totals.discountMinor)totalRows.push(['Discount','−'+totals.discountFormatted]);
  for(const tax of totals.taxSummary)if(tax.amountMinor)totalRows.push([tax.name+' ('+tax.ratePercent+'%)',tax.formatted]);
  totalRows.push(['Total due',totals.totalFormatted]);
  const footerTexts=[state.paymentTerms&&['Payment terms',state.paymentTerms],state.paymentInstructions&&['Payment instructions',state.paymentInstructions],state.notes&&['Notes',state.notes]].filter(Boolean);
  const totalsHeight=totalRows.length*36+50;
  ensure(totalsHeight);
  y+=12;
  for(const [label,value] of totalRows){
    const final=label==='Total due';ctx.font=(final?'700 25px':'20px')+' Arial';
    ctx.fillText(label,margin+650,y);
    const width=ctx.measureText(value).width;ctx.fillText(value,canvasWidth-margin-width,y);y+=final?44:34;
  }
  y+=12;
  for(const [label,value] of footerTexts){
    ctx.font='700 19px Arial';const wrapped=wrapText(ctx,value,contentWidth);const needed=30+wrapped.length*27+18;ensure(needed);
    ctx.fillText(label,margin,y);y+=28;ctx.font='18px Arial';
    for(const line of wrapped){ctx.fillText(line,margin,y,contentWidth);y+=27}
    y+=18;
  }
  pushPage();
  return pages;
}
export async function createInvoicePdf(state,totals,{pageSize='A4'}={}){
  if(!['A4','LETTER'].includes(pageSize))throw Error('unsupported_page_size');
  if(typeof Blob==='undefined'||typeof document==='undefined')throw Error('browser_pdf_unavailable');
  const currency=totals.currency;
  const printable={
    ...totals,
    subtotalFormatted:formatMoney(totals.subtotalMinor,currency),
    discountFormatted:formatMoney(totals.discountMinor,currency),
    totalFormatted:formatMoney(totals.totalMinor,currency),
    lines:totals.lines.map(line=>({...line,rateFormatted:formatUnitRate(line.rate,currency),totalFormatted:formatMoney(line.totalMinor,currency)})),
    taxSummary:totals.taxSummary.map(tax=>({...tax,formatted:formatMoney(tax.amountMinor,currency)}))
  };
  const pages=drawInvoicePages(state,printable,pageSize);
  const bytes=buildPdfFromJpegs(pages,pageSize);
  return new Blob([bytes],{type:'application/pdf'});
}
export function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  try{
    const link=document.createElement('a');link.href=url;link.download=filename;link.rel='noopener';document.body.append(link);link.click();link.remove();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
