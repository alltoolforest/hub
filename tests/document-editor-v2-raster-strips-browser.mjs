import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const page=await browser.newPage(),root=new URL('../../',process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8770/documents/document-editor/').href;
 await page.goto(root+'documents/document-editor/');await page.addScriptTag({url:root+'assets/vendor/pdf-lib.js'});
 const result=await page.evaluate(async root=>{
  const {loadPdfjs,configureWorkerSrc}=await import(root+'documents/document-editor-v2-lab/pdf-engine/fortress/src/rendering/pdfjs.js');await configureWorkerSrc(root+'documents/edit-pdf/fortress/vendor/pdf.worker.mjs');
  const {rasterFlowProfile}=await import(root+'documents/document-editor-v2-lab/pdf-engine/fortress/src/layout/raster-flow.js');
  const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=3000;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,2000,3000);ctx.fillStyle='black';
  for(const y of [0,495,990,1495,1995,2495,2990])ctx.fillRect(40,y,1900,10);ctx.font='40px sans-serif';ctx.fillText('Scanned source with strip-edge ink',50,200);
  const doc=await PDFLib.PDFDocument.create(),image=await doc.embedPng(new Uint8Array(await(await fetch(canvas.toDataURL())).arrayBuffer()));doc.addPage([2000,3000]).drawImage(image,{x:0,y:0,width:2000,height:3000});
  const pdfjs=await loadPdfjs(),task=pdfjs.getDocument({data:await doc.save()}),pdf=await task.promise,p=await pdf.getPage(1);let renders=0,maxPixels=0;
  const profile=await rasterFlowProfile({getViewport:options=>p.getViewport(options),render(options){renders++;maxPixels=Math.max(maxPixels,options.canvasContext.canvas.width*options.canvasContext.canvas.height);return p.render(options);}});
  await p.render({canvasContext:ctx,viewport:p.getViewport({scale:profile.scale}),background:'rgb(255,255,255)',annotationMode:0}).promise;
  const data=ctx.getImageData(0,0,2000,3000).data,rows=[];let start=null;
  for(let y=0;y<3000;y++){let ink=false;for(let x=0;x<2000;x++){const i=(y*2000+x)*4;if(data[i+3]>8&&(data[i]<254||data[i+1]<254||data[i+2]<254)){ink=true;break;}}if(ink&&start===null)start=y;if(!ink&&start!==null){rows.push({bottom:3000-y,top:3000-start});start=null;}}
  if(start!==null)rows.push({bottom:0,top:3000-start});await task.destroy();return {actual:profile.rows,expected:rows,renders,maxPixels};
 },root);
 assert.equal(result.renders,6);assert.ok(result.maxPixels<=1_000_000);assert.deepEqual(result.actual,result.expected);assert.ok(result.actual.length>=8);
 console.log('PASS real scanned PDF: six bounded strips match full-page ink geometry, including strip boundaries and page edges');
}finally{await browser.close();}
