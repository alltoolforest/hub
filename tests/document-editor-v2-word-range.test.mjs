import test from 'node:test';import assert from 'node:assert/strict';import Zip from '../hybrid-build/node_modules/jszip/lib/index.js';import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
import {readDocx,writeDocx,snapshotDocx,restoreDocx} from '../assets/js/document-editor-v2/docx-package.js';import {replaceWordRange} from '../assets/js/document-editor-v2/word-range.js';
const {DOMParser,XMLSerializer}=new JSDOM('').window,W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const p=(text,properties='',style='')=>`<w:p>${properties?`<w:pPr>${properties}</w:pPr>`:''}<w:r>${style?`<w:rPr>${style}</w:rPr>`:''}<w:t>${text}</w:t></w:r></w:p>`;
async function model(body){const z=new Zip();z.file('[Content_Types].xml','<Types/>');z.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`);z.file('word/header1.xml','<kept/>');return readDocx(await z.generateAsync({type:'blob'}),Zip,DOMParser);}
const point=(index,offset,part=0)=>({index,part,offset});
async function reopen(m){return readDocx(await writeDocx(m,Zip,DOMParser,XMLSerializer),Zip,DOMParser);}
test('deletion spanning three source paragraphs preserves prefix, suffix formatting and undo/recovery',async()=>{
 const m=await model(p('BEGIN remove','','<w:b/>')+p('Middle removal')+p('remove TAIL','','<w:i/>')+p('Keep final'));
 const original=snapshotDocx(m),result=replaceWordRange(m,point(0,6),point(2,7),'');assert.deepEqual(result.indexes,[0,1,2]);assert.equal(result.offset,6);
 const changed=snapshotDocx(m),out=await reopen(m);assert.deepEqual(out.text,['BEGIN TAIL','Keep final']);assert.equal(await out.zip.file('word/header1.xml').async('string'),'<kept/>');
 const paragraphs=out.xml.getElementsByTagNameNS(W,'p');assert.equal(out.formatting.formats[0].runs[0].bold,true);assert.equal(out.formatting.formats[0].runs.at(-1).italic,true);assert.equal(out.formatting.formats[0].runs.at(-1).bold,false);
 restoreDocx(m,original);assert.deepEqual((await reopen(m)).text,['BEGIN remove','Middle removal','remove TAIL','Keep final']);restoreDocx(m,changed);assert.deepEqual((await reopen(m)).text,['BEGIN TAIL','Keep final']);
});
test('cross-paragraph multiline replacement and repeated edits retain remaining parts and origins',async()=>{
 const m=await model(p('prefix remove')+p('remove suffix','','<w:i/>')+p('last'));
 replaceWordRange(m,point(0,7),point(1,7),'one\ntwo\n');assert.deepEqual((await reopen(m)).text,['prefix one','two','suffix','last']);
 replaceWordRange(m,point(0,7,0),point(0,0,2),'joined ');assert.deepEqual((await reopen(m)).text,['prefix joined suffix','last']);
 restoreDocx(m,snapshotDocx(m));assert.deepEqual((await reopen(m)).text,['prefix joined suffix','last']);
});
test('invalid or protected structural ranges fail atomically',async()=>{
 for(const middle of [p('Page break','<w:pageBreakBefore/>'),p('Numbered','<w:numPr/>'),'<w:p><w:fldSimple w:instr="DATE"><w:r><w:t>Date</w:t></w:r></w:fldSimple></w:p>','<w:tbl><w:tr><w:tc>'+p('Cell')+'</w:tc></w:tr></w:tbl>']){
  const m=await model(p('first')+middle+p('last')),last=m.text.length-1,before=snapshotDocx(m);
  assert.throws(()=>replaceWordRange(m,point(0,1),point(last,2),''));assert.deepEqual(snapshotDocx(m),before);
 }
 const m=await model(p('first')+p('last')),before=snapshotDocx(m);for(const [start,end] of [[point(1,0),point(0,0)],[point(0,20),point(1,1)],[point(0,0),point(1,0,5)]]){assert.throws(()=>replaceWordRange(m,start,end,''));assert.deepEqual(snapshotDocx(m),before);}
});
test('disabled page breaks allow replacement; soft line breaks remain within one paragraph',async()=>{
 const m=await model(p('first')+p('last','<w:pageBreakBefore w:val="0"/>'));replaceWordRange(m,point(0,2),point(1,2),'\n',{splitLines:false});assert.deepEqual((await reopen(m)).text,['fi\nst']);
});
test('cross-paragraph formatting changes only the selected spans and preserves paragraph boundaries',async()=>{
 const {formatWordRange}=await import('../assets/js/document-editor-v2/word-range.js');
 const m=await model(p('abcd','','<w:b/>')+p('efgh')+p('ijkl','','<w:i/>')),before=snapshotDocx(m);
 const format={font:'Courier New',size:18,bold:false,italic:true,color:'#aabbcc'};
 formatWordRange(m,point(0,2),point(2,2),format);const out=await reopen(m);assert.deepEqual(out.text,['abcd','efgh','ijkl']);
 assert.equal(out.formatting.formats[0].runs[0].bold,true);assert.equal(out.formatting.formats[0].runs[1].font,'Courier New');assert.equal(out.formatting.formats[1].runs[0].size,18);assert.equal(out.formatting.formats[2].runs[0].font,'Courier New');assert.equal(out.formatting.formats[2].runs[1].font,'Calibri');
 const valid=snapshotDocx(m);assert.throws(()=>formatWordRange(m,point(0,0),point(2,4),{...format,size:0}));assert.deepEqual(snapshotDocx(m),valid);restoreDocx(m,before);assert.deepEqual((await reopen(m)).text,['abcd','efgh','ijkl']);
});
test('oversized multiline replacements are refused before mutating the document',async()=>{
 const m=await model(p('first')+p('last')),before=snapshotDocx(m);assert.throws(()=>replaceWordRange(m,point(0,1),point(1,1),'\n'.repeat(10000)),/too many paragraphs/);assert.deepEqual(snapshotDocx(m),before);
});
