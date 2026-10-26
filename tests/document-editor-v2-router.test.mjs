import test from 'node:test';
import assert from 'node:assert/strict';
import {detectFile} from '../assets/js/document-editor-v2/file-router.js';

function namedBlob(name, bytes) {
  const file = new Blob([bytes]);
  Object.defineProperty(file, 'name', {value: name});
  return file;
}

function zip(names) {
  const chunks = [], entries = [];
  let offset = 0;
  const u16 = (view, at, n) => view.setUint16(at, n, true);
  const u32 = (view, at, n) => view.setUint32(at, n, true);
  for (const path of names) {
    const name = new TextEncoder().encode(path);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 26, name.length);
    local.set(name, 30);
    chunks.push(local);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20);
    u16(cv, 28, name.length); u32(cv, 42, offset);
    central.set(name, 46);
    entries.push(central);
    offset += local.length;
  }
  const length = entries.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, names.length); u16(ev, 10, names.length);
  u32(ev, 12, length); u32(ev, 16, offset);
  return new Blob([...chunks, ...entries, end]);
}

test('routes supported content by signature and extension', async () => {
  const docx = zip(['[Content_Types].xml', 'word/document.xml']);
  const xlsx = zip(['[Content_Types].xml', 'xl/workbook.xml']);
  assert.deepEqual((await detectFile(namedBlob('letter.docx', docx))).engine, 'document');
  assert.deepEqual((await detectFile(namedBlob('table.xlsx', xlsx))).engine, 'spreadsheet');
  assert.equal((await detectFile(namedBlob('scan.pdf', '%PDF-1.7\n'))).engine, 'pdf');
  assert.equal((await detectFile(namedBlob('note.txt', 'Hello'))).format, 'txt');
  assert.equal((await detectFile(namedBlob('data.csv', 'a,b\n1,2'))).format, 'csv');
});

test('rejects format spoofing, malformed packages and executable payloads', async () => {
  await assert.rejects(detectFile(namedBlob('wrong.docx', '%PDF-1.7')), /does not match/);
  await assert.rejects(detectFile(namedBlob('wrong.pdf', 'plain text')), /does not match/);
  await assert.rejects(detectFile(namedBlob('bad.docx', new Uint8Array([0x50, 0x4b, 3, 4]))), /incomplete/);
  await assert.rejects(detectFile(namedBlob('bad.txt', new Uint8Array([0, 1, 2]))), /binary/);
  await assert.rejects(detectFile(namedBlob('bad.docx', zip(['[Content_Types].xml', '../word/document.xml']))), /unsafe/);
  await assert.rejects(detectFile(namedBlob('macro.docx', zip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin']))), /Macro/);
  await assert.rejects(detectFile(namedBlob('book.xlsx', zip(['[Content_Types].xml', 'word/document.xml']))), /does not match/);
});
