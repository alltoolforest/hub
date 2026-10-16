import test from 'node:test';
import assert from 'node:assert/strict';
import Excel from '../hybrid-build/node_modules/exceljs/excel.js';
import {displayValue, assignCell, assertPreserved} from '../assets/js/document-editor-v2/spreadsheet-model.js';

test('XLSX cell edits preserve formulas, multiple sheets, style and reopen', async () => {
  const book = new Excel.Workbook();
  const inputs = book.addWorksheet('Inputs');
  inputs.getCell('A1').value = 4;
  inputs.getCell('A1').font = {bold:true, color:{argb:'FF225588'}};
  inputs.getCell('A2').value = 5;
  inputs.getCell('A3').value = {formula:'SUM(A1:A2)',result:9};
  book.addWorksheet('Notes').getCell('A1').value = 'Retain me';
  const original = await book.xlsx.writeBuffer();
  const loaded = new Excel.Workbook(); await loaded.xlsx.load(original);
  assignCell(loaded.getWorksheet('Inputs').getCell('A2'), '12');
  const exported = await loaded.xlsx.writeBuffer();
  const reopened = new Excel.Workbook(); await reopened.xlsx.load(exported);
  assertPreserved(loaded, reopened, [['Inputs','A2']]);
  assert.equal(displayValue(reopened.getWorksheet('Inputs').getCell('A3').value), '=SUM(A1:A2)');
  assert.equal(reopened.getWorksheet('Inputs').getCell('A1').font.bold, true);
  assert.equal(reopened.getWorksheet('Notes').getCell('A1').value, 'Retain me');
});

test('validation rejects a lost formula', async () => {
  const book = new Excel.Workbook();
  book.addWorksheet('Sheet1').getCell('A1').value = {formula:'1+2',result:3};
  const damaged = new Excel.Workbook();
  damaged.addWorksheet('Sheet1').getCell('A1').value = 3;
  assert.throws(() => assertPreserved(book, damaged, []), /altered formulas/);
});
