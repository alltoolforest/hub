import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
const require=createRequire(import.meta.url);globalThis.PDFLib=require('../assets/vendor/pdf-lib.js');
const d=require('../hybrid-build/node_modules/docx/dist/index.cjs'),Zip=require('../hybrid-build/node_modules/jszip/lib/index.js');
const dom=new JSDOM('<div></div>',{url:'https://example.invalid/'});globalThis.document=dom.window.document;globalThis.window=dom.window;window.docx=d;
globalThis.fetch=async()=>({ok:true,json:async()=>({docx:{script:'docx.js',global:'docx'}})});
const append=document.head.append.bind(document.head);document.head.append=(...nodes)=>{append(...nodes);for(const node of nodes)queueMicrotask(()=>node.onload?.());};
const {PDFDocument}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/pdf-lib.js');
const {addSearchableText}=await import('../documents/document-editor-v2-lab/pdf-engine/ocr/searchable-text.js');
const {pdfToDocx}=await import('../assets/js/document-editor-v2/pdf-conversion.js');
test('editable PDF-to-Word export preserves Unicode phrases without inserted spaces',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([300,300]),text='Reviewed text తెలుగు 😀';
 await addSearchableText(doc,page,{viewportTransform:[1,0,0,-1,0,300],words:[{text,bbox:{x0:20,y0:20,x1:280,y1:40}}]});
 const blob=await pdfToDocx(await doc.save()),zip=await Zip.loadAsync(await blob.arrayBuffer()),xml=new dom.window.DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml');
 assert.equal([...xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','t')].map(n=>n.textContent).join(''),text);
 assert.equal(xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','sectPr').length,1);
});
test('PDF-to-Word refuses blank text pages and cancellation',async()=>{
 const doc=await PDFDocument.create();doc.addPage([300,300]);const bytes=await doc.save();
 await assert.rejects(pdfToDocx(bytes),/no extractable text/);
 const controller=new AbortController();controller.abort();await assert.rejects(pdfToDocx(bytes,{signal:controller.signal}),/cancelled/);
});
