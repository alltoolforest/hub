import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rotateBy,moveBy,batchCapacity,batchText,drawRotatedPreview,normalizedLines} from '../assets/js/image-ocr-batch.js';
import {checkedText,wrappedPdfLines,docxBlob,pdfBlob} from '../assets/js/image-ocr-export.js';

const app=readFileSync(new URL('../assets/js/image-to-text-ocr.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/image-to-text-ocr.css',import.meta.url),'utf8');
const mk=(id,name,text='',width=120,height=80)=>({id,name,text,image:{width,height}});
test('clockwise and counterclockwise rotations stay within right angles',()=>{
 assert.equal(rotateBy(0,90),90);
 assert.equal(rotateBy(90,90),180);
 assert.equal(rotateBy(270,90),0);
 assert.equal(rotateBy(0,-90),270);
 assert.equal(rotateBy(90,-90),0);
 assert.throws(()=>rotateBy(90,45),/rotation/);
});
test('reordering is stable and does not mutate the existing array or its items',()=>{
 const one=mk(1,'first'),two=mk(2,'second'),three=mk(3,'third');
 const original=[one,two,three];
 const newOrder=moveBy(original,3,-1);
 assert.deepEqual(newOrder.map(i=>i.name),['first','third','second']);
 assert.deepEqual(original.map(i=>i.name),['first','second','third']);
 assert.equal(newOrder[0],one);
 assert.deepEqual(moveBy(newOrder,1,-1),newOrder);
 assert.deepEqual(moveBy(newOrder,2,1),newOrder);
 assert.throws(()=>moveBy(original,12,1),/not found/);
});
test('ordered extraction is stable and identifies each source',()=>{
 assert.equal(batchText([mk(1,'a.png','  Single source  ')]),'Single source');
 const combined=batchText([mk(4,'z.png','PAGE Z'),mk(1,'a.png','PAGE A')]);
 assert.ok(combined.indexOf('PAGE Z')<combined.indexOf('PAGE A'));
 assert.match(combined,/Image 1 — z.png/);
 assert.match(combined,/Image 2 — a.png/);
 assert.throws(()=>batchText([mk(1,'empty','')]),/no recognized/);
});
test('batch admission rejects too many or too many decoded source pixels',()=>{
 const prior=Array.from({length:9},(_,i)=>mk(i,'img'+i));
 assert.deepEqual(batchCapacity(prior,1,true).max,10);
 assert.throws(()=>batchCapacity(prior,2,true),/Maximum 10/);
 assert.equal(batchCapacity([],20,false).max,20);
 assert.throws(()=>batchCapacity([],21,false),/Maximum 20/);
});
test('live rotation preview rotates canvas size and drawing path',()=>{
 const operations=[];
 const canvas={width:0,height:0,getContext:()=>({
  save(){operations.push('save')},restore(){operations.push('restore')},
  translate(x,y){operations.push(['translate',x,y])},
  rotate(x){operations.push(['rotate',x])},
  drawImage(){operations.push('draw')}
 })};
 drawRotatedPreview(canvas,{width:120,height:80},90,140);
 assert.deepEqual([canvas.width,canvas.height],[80,120]);
 assert.ok(operations.some(x=>Array.isArray(x)&&x[0]==='rotate'));
 assert.equal(operations.at(-1),'restore');
 drawRotatedPreview(canvas,{width:120,height:80},0,140);
 assert.deepEqual([canvas.width,canvas.height],[120,80]);
});
test('user-entered text is checked and line breaks remain intact',()=>{
 assert.equal(checkedText(' OCR output '),' OCR output ');
 assert.throws(()=>checkedText('   '),/Recognize/);
 assert.deepEqual(normalizedLines('a\r\nb\tc\n'),['a','b    c','']);
});
test('PDF line wrapping respects measured width and blank line separation',()=>{
 const font={widthOfTextAtSize:(s,size)=>s.length};
 const rows=wrappedPdfLines('a very long example line\n\n123456789',font,11,8);
 assert.equal(rows.includes(''),true);
 assert.ok(rows.every(r=>r.length<=8));
 assert.equal(rows.join(' ').includes('12345678'),true);
});
test('DOCX export delegates to local engine and returns a nonempty Blob',async()=>{
 let paragraphs=0,sections=0;
 class TextRun{constructor(x){assert.equal(typeof x.text,'string')}}
 class Paragraph{constructor(x){paragraphs++;assert.ok(x.children.length)}}
 class Document{constructor(x){sections=x.sections.length}}
 const Packer={toBlob:async()=>new Blob(['docx'],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})};
 const blob=await docxBlob('line one\n\nline three',{TextRun,Paragraph,Document,Packer});
 assert.equal(paragraphs,3);assert.equal(sections,1);assert.equal(blob.size,4);
});
test('PDF exports all text lines into bounded A4 pages',async()=>{
 const drawn=[];
 const font={widthOfTextAtSize:(s,size)=>s.length*5,encodeText:()=>{}};
 const pages=[];
 const lib={StandardFonts:{Helvetica:'Helvetica'},
  rgb:(...args)=>args,
  PDFDocument:{create:async()=>({
   embedFont:async()=>font,addPage:size=>{
    assert.deepEqual(size,[595.28,841.89]);
    const p={drawText:(s,opts)=>drawn.push([s,opts.y])};pages.push(p);return p;
   },
   save:async()=>new Uint8Array([37,80,68,70,45,49])
  })}
 };
 const blob=await pdfBlob('First line\nSecond line',lib);
 assert.equal(blob.type,'application/pdf');
 assert.equal(pages.length,1);
 assert.deepEqual(drawn.map(r=>r[0]),['First line','Second line']);
});
test('PDF export rejects unsupported Unicode explicitly rather than changing text',async()=>{
 const font={widthOfTextAtSize:s=>s.length*5,encodeText:s=>{if(s.includes('☃'))throw Error('WinAnsi cannot encode character')}};
 const lib={StandardFonts:{Helvetica:'h'},
  rgb:()=>{},PDFDocument:{create:async()=>({embedFont:async()=>font,addPage:()=>({drawText(){}}),save:async()=>new Uint8Array([1])})}};
 await assert.rejects(()=>pdfBlob('Snowman ☃',lib),/Download DOCX/);
});
test('the isolated OCR module preserves per-image progress and user-corrected text',()=>{
 assert.match(app,/fileInput\(root,[^\n]+true,'Select one or more text images'\)/);
 assert.match(app,/items=moveBy\(items,item.id/);
 assert.match(app,/item.rotation=rotateBy/);
 assert.match(app,/drawRotatedPreview\(sourceCanvas,active.image,active.rotation,720\)/);
 assert.match(app,/for\(const \[index,item\] of snapshot.entries\(\)\)/);
 assert.match(app,/recognizeSafely\(worker,item.image/);
 assert.match(app,/text.value=combined/);
 assert.match(app,/resultRevision=queueRevision/);
 assert.match(app,/clearOutputs\(\)/);
 assert.match(app,/activeController.abort\(\)/);
 assert.match(app,/localAction\('Download DOCX'/);
 assert.match(app,/localAction\('Download PDF'/);
 assert.match(css,/ocr-batch-item/);
 assert.match(css,/@media\(max-width:560px\)/);
});
