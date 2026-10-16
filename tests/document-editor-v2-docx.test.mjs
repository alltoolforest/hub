import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from '../hybrid-build/node_modules/jszip/lib/index.js';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
import {Document, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, Packer} from '../hybrid-build/node_modules/docx/dist/index.mjs';
import {readDocx, updateDocxText, writeDocx, documentBlocks} from '../assets/js/document-editor-v2/docx-package.js';

const {DOMParser, XMLSerializer} = new JSDOM('').window;
const body = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>First</w:t></w:r><w:r><w:t> line</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:drawing/></w:r></w:p>
</w:body></w:document>`;

async function fixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', body);
  zip.file('word/media/photo.png', new Uint8Array([1, 2, 3]));
  zip.file('word/_rels/document.xml.rels', '<Relationships/>');
  return zip.generateAsync({type:'blob'});
}

test('DOCX edits retain untouched package parts, paragraph properties and table cells', async () => {
  const model = await readDocx(await fixture(), JSZip, DOMParser);
  assert.deepEqual(model.text, ['First line', 'Cell', '']);
  const blocks = documentBlocks(model);
  assert.equal(blocks[0].paragraph.pageBreak, true);
  assert.equal(blocks[1].rows[0][0][0].index, 1);
  assert.equal(blocks[2].paragraph.hasDrawing, true);
  updateDocxText(model, 0, 'First line expanded across the page with additional words');
  updateDocxText(model, 1, '');
  const result = await writeDocx(model, JSZip, DOMParser, XMLSerializer);
  const reopened = await readDocx(result, JSZip, DOMParser);
  assert.deepEqual(reopened.text, model.text);
  assert.match(await reopened.zip.file('word/document.xml').async('string'), /pageBreakBefore/);
  assert.deepEqual([...await reopened.zip.file('word/media/photo.png').async('uint8array')], [1, 2, 3]);
  assert.equal(await reopened.zip.file('word/_rels/document.xml.rels').async('string'), '<Relationships/>');
});

test('rejects unsafe XML while retaining the original model after a failed export', async () => {
  const model = await readDocx(await fixture(), JSZip, DOMParser);
  await assert.rejects(readDocx(await new JSZip().file('[Content_Types].xml','<Types/>').file('word/document.xml', '<!DOCTYPE a><w:document/>').generateAsync({type:'blob'}), JSZip, DOMParser), /unsupported XML/);
  assert.equal(model.text[0], 'First line');
});

test('real generated DOCX round trips text growth and shortening with headers and table intact', async () => {
  const document = new Document({sections:[{properties:{},
    headers:{default:new Header({children:[new Paragraph('Header stays')]})},
    footers:{default:new Footer({children:[new Paragraph('Footer stays')]})},
    children:[
      new Paragraph({children:[new TextRun({text:'Short',bold:true})]}),
      new Table({rows:[new TableRow({children:[new TableCell({children:[new Paragraph('Table value')]})]})]}),
      new Paragraph({children:[new TextRun('Trailing paragraph')]})
    ]}]});
  const input = await Packer.toBlob(document);
  const model = await readDocx(input, JSZip, DOMParser);
  updateDocxText(model, 0, 'Short text expanded into a long paragraph that can wrap downward and across pages in Word. '.repeat(20));
  updateDocxText(model, model.text.length - 1, 'End');
  const result = await writeDocx(model, JSZip, DOMParser, XMLSerializer);
  const reopened = await readDocx(result, JSZip, DOMParser);
  assert.deepEqual(reopened.text, model.text);
  assert.match(await reopened.zip.file('word/header1.xml').async('string'), /Header stays/);
  assert.match(await reopened.zip.file('word/footer1.xml').async('string'), /Footer stays/);
  assert.match(await reopened.zip.file('word/document.xml').async('string'), /Table value/);
});
