import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);globalThis.PDFLib=require('../assets/vendor/pdf-lib.js');
const create=require('../documents/document-editor-v2-lab/pdf-engine/vendor/qpdf-0.3.0/qpdf.js');
const wasm=fs.readFileSync(new URL('../documents/document-editor-v2-lab/pdf-engine/vendor/qpdf-0.3.0/qpdf.wasm',import.meta.url));
const {PDFDocument,StandardFonts}=globalThis.PDFLib;
const {preparePdf}=await import('../assets/js/document-editor-v2/pdf-unlock.js');
const {extractPageText}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/extraction-validator.js');
async function run(bytes,args){const errors=[];const q=await create({wasmBinary:wasm,print:()=>{},printErr:s=>errors.push(s)});q.FS.writeFile('/input.pdf',bytes);const code=q.callMain(args);if(code!==0&&code!==3)throw Object.assign(new Error('Wrong password'),{code:'PDF_PASSWORD_INCORRECT'});return q.FS.readFile('/output.pdf');}
async function fixture({password='secret',bits='256'}={}){const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);doc.addPage([300,300]).drawText('Original editable text',{x:20,y:220,size:12,font});doc.addPage([300,300]);doc.getForm().createTextField('Name').setText('Preserve field');const plain=await doc.save();const encrypted=await run(plain,['--encrypt',password,'owner',bits,...(bits==='128'?['--use-aes=y']:[]),'--','/input.pdf','/output.pdf']);const file=new Blob([encrypted],{type:'application/pdf'});Object.defineProperty(file,'name',{value:'protected.pdf'});return {file,encrypted};}
const decrypt=async(bytes,password)=>({bytes:await run(bytes,[`--password=${password}`,'--decrypt','/input.pdf','/output.pdf']),pageCount:2});
test('AES-256 password unlock preserves native text, pages and form values',async()=>{const {file,encrypted}=await fixture();let prompts=0;const result=await preparePdf(file,{requestPassword:async()=>{prompts++;return 'secret';},decrypt});assert.equal(prompts,1);assert.equal((await PDFDocument.load(result.unlocked.bytes)).getPageCount(),2);assert.equal((await PDFDocument.load(result.unlocked.bytes)).getForm().getTextField('Name').getText(),'Preserve field');assert.match(await extractPageText(result.unlocked.bytes,0),/Original editable text/);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),encrypted);assert.equal(result.file.name,'protected.pdf');});
test('incorrect password retries; cancellation preserves the encrypted original',async()=>{const {file}=await fixture();let count=0;const result=await preparePdf(file,{requestPassword:async message=>{count++;if(count===2)assert.match(message,/Wrong password/);return count===1?'wrong':'secret';},decrypt});assert.ok(result.unlocked);await assert.rejects(preparePdf(file,{requestPassword:async()=>null,decrypt}),/cancelled/);assert.equal((await PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:true})).isEncrypted,true);});
test('decrypted recovery reopens without saving a password and rejects mismatched sources',async()=>{const {file}=await fixture(),result=await preparePdf(file,{requestPassword:async()=> 'secret',decrypt});const recovery={unlocked:result.unlocked};assert.equal(JSON.stringify(Object.keys(recovery.unlocked)),JSON.stringify(['source','bytes','pageCount']));const fresh=await preparePdf(file,{recovery,requestPassword:async()=>{throw new Error('Password should not be requested');}});assert.deepEqual(fresh.unlocked.bytes,result.unlocked.bytes);await assert.rejects(preparePdf(file,{recovery:{unlocked:{...result.unlocked,source:'wrong'}}}),/does not match/);});

test('AES-128 and empty opening passwords preserve native content',async()=>{
 for(const password of ['secret','']){
  const {file}=await fixture({password,bits:'128'});const result=await preparePdf(file,{requestPassword:async()=>password,decrypt});assert.equal((await PDFDocument.load(result.unlocked.bytes)).getPageCount(),2);assert.match(await extractPageText(result.unlocked.bytes,0),/Original editable text/);
 }
});
