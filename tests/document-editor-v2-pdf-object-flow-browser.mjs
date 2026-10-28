import assert from 'node:assert/strict';import fs from 'node:fs/promises';import Zip from '../hybrid-build/node_modules/jszip/lib/index.js';import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const launch={headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']};
if(process.env.HTTPS_PROXY){const p=new URL(process.env.HTTPS_PROXY);launch.proxy={server:p.origin,bypass:'127.0.0.1,localhost',...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})};launch.args.push('--ignore-certificate-errors');}
const browser=await chromium.launch(launch);
try{
 const page=await browser.newPage();await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8765/documents/document-editor/');const root=new URL('../../',page.url()).href;await page.addScriptTag({url:root+'assets/vendor/pdf-lib.js'});
 const result=await page.evaluate(async(root)=>{
  const {PDFDocument,PDFName,PDFArray}=globalThis.PDFLib;
  const {createPdfObjectTools}=await import(root+'assets/js/document-editor-v2/pdf-objects.js');
  const {applyUpwardCompaction}=await import(root+'documents/document-editor-v2-lab/pdf-engine/fortress/src/export/upward-compaction-v3.js');
  const {loadPdfjs,configureWorkerSrc}=await import(root+'documents/document-editor-v2-lab/pdf-engine/fortress/src/rendering/pdfjs.js');
  await configureWorkerSrc(root+'documents/edit-pdf/fortress/vendor/pdf.worker.mjs');
  const doc=await PDFDocument.create(),sheet=doc.addPage([300,300]);for(const [text,y]of [['Header fixed',260],['Following first line',160],['Following second line',140],['Following third line',120]])sheet.drawText(text,{x:40,y,size:12});
  const bytes=await doc.save(),file=new Blob([bytes]);const view=await createPdfObjectTools(file,{onChange(){},getBaseBytes:()=>bytes,getEditorState:()=>({})});
  const tx={id:'delete-line',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'Deleted line',replacementUnicode:'',block:{text:'Deleted line',bounds:{x:40,y:177,width:110,height:13},fontSize:12,lines:[{y:180,fontSize:12}]}};
  const flow=await applyUpwardCompaction({bytes,reflowMetrics:[]},[tx]);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=4;const context=canvas.getContext('2d');context.fillStyle='#ff0000';context.fillRect(0,0,4,4);const image=new Uint8Array(await (await fetch(canvas.toDataURL())).arrayBuffer());
  const link={id:'link',kind:'link',pageIndex:0,x:50,y:90,width:20,height:10,url:'https://example.org/flow'},pic={id:'image',kind:'image',pageIndex:0,x:90,y:90,width:10,height:10,bytes:image,format:'png'};
  await view.restore({...view.snapshot(),changes:[link,pic]});const output=await view.apply(flow.bytes,{reflowMetrics:flow.reflowMetrics});const parsed=await PDFDocument.load(output),rect=parsed.context.lookup(parsed.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray).get(0)).lookup(PDFName.of('Rect'),PDFArray).asArray().map(v=>v.asNumber());
  const pdfjs=await loadPdfjs(),task=pdfjs.getDocument({data:output.slice()}),pdf=await task.promise,p=await pdf.getPage(1),viewport=p.getViewport({scale:1});canvas.width=viewport.width;canvas.height=viewport.height;await p.render({canvasContext:context,viewport}).promise;const shift=flow.reflowMetrics[0].shiftY,pixel=[...context.getImageData(95,300-(95+shift),1,1).data];const text=(await p.getTextContent()).items.map(x=>x.str).join(' ');
  await task.destroy();await view.dispose();return {rect,shift,pixel,text};
 },root);
 assert.equal(result.rect[1],90+result.shift);assert.deepEqual(result.pixel,[255,0,0,255]);assert.match(result.text,/Following first line/);assert.match(result.text,/Header fixed/);console.log('PASS real PDF upward reflow: added hyperlink coordinates, added image rendered position, surviving text');await page.close();
}finally{await browser.close();}
