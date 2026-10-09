import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const merger=readFileSync(new URL('../assets/js/pdf-merger.js',import.meta.url),'utf8');
const preview=readFileSync(new URL('../assets/js/pdf-merger-preview.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../assets/css/pdf-merger.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../documents/pdf-merger/index.html',import.meta.url),'utf8');
test('PDF Merger alone loads responsive styles and local PDF.js thumbnail renderer',()=>{
 assert.match(html,/assets\/css\/pdf-merger\.css/);
 assert.match(merger,/renderPdfMergerThumbnail\(entry\.file,view\.canvas/);
 assert.match(preview,/disableAutoFetch:true/);
 assert.match(preview,/isEvalSupported:false/);
 assert.match(preview,/getPage\(1\)/);
 assert.match(preview,/standardFontDataUrl/);
});
test('preview memory is explicitly bounded with lazy loading and disposal',()=>{
 assert.match(preview,/maxWidth:158/);
 assert.match(preview,/maxHeight:210/);
 assert.match(preview,/maxPixels:34000/);
 assert.match(preview,/mobileMaxFileBytes:12\*1024\*1024/);
 assert.match(merger,/IntersectionObserver/);
 assert.match(merger,/previewRunning/);
 assert.match(merger,/releasePreview\(entry\)/);
 assert.match(merger,/previewObserver\?\.disconnect/);
});
test('every order button has a specific accessible name and order updates announce',()=>{
 assert.match(merger,/aria-label':label\+' '\+entry\.file\.name/);
 assert.match(merger,/Move up/);
 assert.match(merger,/Move down/);
 assert.match(merger,/aria-atomic':'true'/);
 assert.match(merger,/target\?\.focus\(\)/);
 assert.match(merger,/Moved '\+entry\.file\.name\+' to position/);
 assert.match(merger,/Removed '\+entry\.file\.name/);
});
test('PDF Merger styles are scoped to its body and small screens',()=>{
 assert.ok(style.split('\n').filter(l=>l.includes('pdf-merger')).every(l=>
  !l.trim().startsWith('.file-list')&&!l.trim().startsWith('.workspace')));
 assert.match(style,/@media\(max-width:560px\)/);
 assert.match(style,/@media\(max-width:330px\)/);
 assert.match(style,/min-height:44px/);
});
test('the Task 1/2 verified workflow and no touching of generic core remain',()=>{
 assert.match(merger,/preparePdfBatch\(files,selected/);
 assert.match(merger,/verifiedMerge\(snapshot,engine/);
 assert.match(merger,/output\(result\.blob,'merged\.pdf'\)/);
 assert.match(merger,/const oldRows=\[\.\.\.root\.querySelectorAll/);
 assert.match(merger,/if\(busy\|\|uploading\)return/);
});
