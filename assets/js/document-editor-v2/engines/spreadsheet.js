import {load} from '../../core.js';
import {displayValue, assignCell, assertPreserved} from '../spreadsheet-model.js';
import {formulaRisk} from '../../csv-cleaning.js';

const unsupported = /^(xl\/(charts|pivotTables|slicers|externalLinks|embeddings)\/|xl\/vbaProject\.bin$)/i;

export async function open(file, format) {
  if (format === 'xls') throw new Error('Legacy XLS needs a separate reader. This lab does not yet edit it.');
  const Excel = await load('excel');
  const book = new Excel.Workbook();
  const original = new Map();
  let parser = null;
  if (format === 'xlsx') {
    const Zip = await load('zip');
    const zip = await Zip.loadAsync(file);
    const risky = Object.keys(zip.files).find(name => unsupported.test(name));
    if (risky) throw new Error(`This workbook uses a feature the lab cannot preserve (${risky}). The original is untouched.`);
    await book.xlsx.load(await file.arrayBuffer());
    if (!book.worksheets.length) throw new Error('This workbook has no worksheets.');
    for (const sheet of book.worksheets) sheet.eachRow({includeEmpty:false}, row => row.eachCell({includeEmpty:false}, cell => {
      original.set(`${sheet.name}!${cell.address}`, structuredClone(cell.value));
    }));
  } else if (format === 'csv') {
    parser = await load('csv');
    const text = await file.text();
    const result = parser.parse(text, {skipEmptyLines:false});
    if (result.errors.length) throw new Error('CSV parsing failed: ' + result.errors[0].message);
    const csv = result.data.map(row => row.map(String));
    const sheet = book.addWorksheet('Sheet1');
    csv.forEach(row => sheet.addRow(row));
  } else throw new Error('Unsupported spreadsheet format.');
  let active = 0, page = 0;
  const edits = new Map();
  const key = (sheet, address) => `${sheet.name}!${address}`;
  function snapshot() { return {active, page, edits:[...edits]}; }
  function restore(state) {
    for (const [entry] of edits) {
      const split = entry.lastIndexOf('!');
      const sheet = book.getWorksheet(entry.slice(0, split));
      if (sheet) sheet.getCell(entry.slice(split + 1)).value = original.has(entry) ? structuredClone(original.get(entry)) : null;
    }
    edits.clear();
    for (const [entry, value] of state.edits) {
      const split = entry.lastIndexOf('!');
      const sheet = book.getWorksheet(entry.slice(0, split));
      if (!sheet) throw new Error('Recovered draft does not match this workbook.');
      assignCell(sheet.getCell(entry.slice(split + 1)), value);
      edits.set(entry, value);
    }
    active = state.active; page = state.page;
  }
  function render(host, onChange) {
    host.replaceChildren();
    const note = document.createElement('p');
    note.className = 'notice';
    note.textContent = 'Cells and formulas remain spreadsheet cells. Formulas are retained, but calculated results update when the exported file opens in a spreadsheet app.';
    host.append(note);
    const tabs = document.createElement('div');
    tabs.className = 'document-v2-tabs';
    tabs.setAttribute('role', 'tablist');
    book.worksheets.forEach((sheet, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === active));
      button.textContent = sheet.name;
      button.addEventListener('click', () => { active = index; page = 0; render(host, onChange); });
      tabs.append(button);
    });
    host.append(tabs);
    const sheet = book.worksheets[active];
    const rows = Math.max(sheet.rowCount, 1);
    const columns = Math.max(sheet.columnCount, 1);
    const lastPage = Math.max(0, Math.ceil(rows / 50) - 1);
    page = Math.min(page, lastPage);
    const region = document.createElement('div');
    region.className = 'document-v2-grid';
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', `${sheet.name} cells; scroll horizontally for more columns`);
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    for (let row = page * 50 + 1; row <= Math.min(rows, (page + 1) * 50); row++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.scope = 'row'; th.textContent = row; tr.append(th);
      for (let col = 1; col <= Math.min(columns + 1, 50); col++) {
        const cell = sheet.getCell(row, col);
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = displayValue(cell.value);
        input.setAttribute('aria-label', `${sheet.name} ${cell.address}`);
        input.addEventListener('change', () => {
          if (input.value === displayValue(cell.value)) return;
          const entry = key(sheet, cell.address);
          if (!original.has(entry)) original.set(entry, structuredClone(cell.value));
          assignCell(cell, input.value);
          edits.set(entry, input.value);
          onChange();
        });
        td.append(input); tr.append(td);
      }
      body.append(tr);
    }
    table.append(body); region.append(table); host.append(region);
    const nav = document.createElement('div'); nav.className = 'document-v2-actions';
    const previous = document.createElement('button'); previous.textContent = 'Previous rows'; previous.disabled = page === 0;
    const next = document.createElement('button'); next.textContent = 'Next rows'; next.disabled = page >= lastPage;
    previous.addEventListener('click', () => { page--; render(host, onChange); });
    next.addEventListener('click', () => { page++; render(host, onChange); });
    const label = document.createElement('span'); label.textContent = `Rows ${page * 50 + 1}–${Math.min(rows, (page + 1) * 50)} of ${rows}`;
    nav.append(previous, label, next); host.append(nav);
  }
  return {
    format, snapshot, restore, render,
    async export() {
      if (format === 'csv') {
        const sheet = book.worksheets[0];
        const rows = [];
        for (let r = 1; r <= sheet.rowCount; r++) {
          const values = [];
          for (let c = 1; c <= sheet.columnCount; c++) {
            const value = displayValue(sheet.getCell(r, c).value);
            if (formulaRisk(value)) throw new Error(`CSV cell ${r},${c} can run as a formula in spreadsheet apps. Export is blocked until it is changed.`);
            values.push(value);
          }
          rows.push(values);
        }
        const text = parser.unparse(rows);
        const check = parser.parse(text, {skipEmptyLines:false});
        if (check.errors.length || JSON.stringify(check.data) !== JSON.stringify(rows))
          throw new Error('CSV export validation failed. Your draft is retained.');
        return new Blob(['\ufeff', text], {type:'text/csv;charset=utf-8'});
      }
      book.calcProperties.fullCalcOnLoad = true;
      const bytes = await book.xlsx.writeBuffer();
      const check = new Excel.Workbook();
      await check.xlsx.load(bytes);
      assertPreserved(book, check, [...edits].map(([entry]) => {
        const split = entry.lastIndexOf('!'); return [entry.slice(0, split), entry.slice(split + 1)];
      }));
      return new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    }
  };
}
