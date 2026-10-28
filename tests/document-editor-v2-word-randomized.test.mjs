import test from 'node:test';import assert from 'node:assert/strict';import Zip from '../hybrid-build/node_modules/jszip/lib/index.js';import{JSDOM}from'../hybrid-build/node_modules/jsdom/lib/api.js';import{readDocx,writeDocx,snapshotDocx,restoreDocx}from'../assets/js/document-editor-v2/docx-package.js';import{replaceWordRange}from'../assets/js/document-editor-v2/word-range.js';
const {DOMParser,XMLSerializer}=new JSDOM('').window,W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
test('75 deterministic Unicode range replacements round-trip with exact text and undo',async()=>{let seed=271828;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;},escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
 for(let trial=0;trial<75;trial++){
  const values=['First café 😀 paragraph','Second हिंदी content','Third العربية text','Last & <end> retained'],a=rand(4),b=a+rand(4-a),ap=Array.from(values[a]),bp=Array.from(values[b]),ai=rand(ap.length+1),bi=a===b?ai+rand(bp.length-ai+1):rand(bp.length+1),start=ap.slice(0,ai).join('').length,end=bp.slice(0,bi).join('').length,replacement=['','new text','😀 replacement','two\nlines','\n\n'][rand(5)];
  const z=new Zip();z.file('[Content_Types].xml','<Types/>');z.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>${values.map(s=>`<w:p><w:r><w:t>${escape(s)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);z.file('word/unchanged.xml','retained unrelated package part');const m=await readDocx(await z.generateAsync({type:'uint8array'}),Zip,DOMParser),before=snapshotDocx(m);
  replaceWordRange(m,{index:a,part:0,offset:start},{index:b,part:0,offset:end},replacement);
  const expected=[...values.slice(0,a),...(values[a].slice(0,start)+replacement+values[b].slice(end)).split('\n'),...values.slice(b+1)];
  const output=await readDocx(await writeDocx(m,Zip,DOMParser,XMLSerializer),Zip,DOMParser);assert.deepEqual(output.text,expected,'trial '+trial);assert.equal(await output.zip.file('word/unchanged.xml').async('string'),'retained unrelated package part');restoreDocx(m,before);assert.deepEqual(snapshotDocx(m),before);
 }
});
