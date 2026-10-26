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
    const source=await file.arrayBuffer();
    const zip = await Zip.loadAsync(source);
    const risky = Object.keys(zip.files).find(name => unsupported.test(name));
    if (risky) throw new Error(`This workbook uses a feature the lab cannot preserve (${risky}). The original is untouched.`);
    await book.xlsx.load(source);
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
  const csvShape={rows:book.worksheets[0].rowCount,columns:book.worksheets[0].columnCount};
  let active = 0, page = 0, columnPage = 0;
  const edits = new Map();
  const key = (sheet, address) => `${sheet.name}!${address}`;
  function snapshot() { return {active, page, columnPage, edits:[...edits]}; }
  function target(entry) {
    if(typeof entry!=='string')throw new Error('Invalid cell reference.');
    const split=entry.lastIndexOf('!'),sheet=book.getWorksheet(entry.slice(0,split)),address=entry.slice(split+1);
    if(!sheet||!validAddress(address))throw new Error('Recovered draft does not match this workbook.');
    return sheet.getCell(address);
  }
  function validAddress(address){
    const match=/^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(address);if(!match)return false;
    const column=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
    return column<=16384&&Number(match[2])<=1048576;
  }
  function locked(cell){return cell.isMerged&&cell.master.address!==cell.address||!!(cell.value&&typeof cell.value==='object'&&(cell.value.sharedFormula||cell.value.shareType));}
  function restore(state) {
    if(!state||!Array.isArray(state.edits)||!Number.isInteger(state.active)||state.active<0||state.active>=book.worksheets.length||!Number.isInteger(state.page)||state.page<0||state.page>20971||!Number.isInteger(state.columnPage??0)||(state.columnPage??0)<0||(state.columnPage??0)>819)throw new Error('Invalid spreadsheet draft.');
    // Validate the entire draft before changing any cell or history.
    const seen=new Set();
    for(const item of state.edits){if(!Array.isArray(item)||item.length!==2||typeof item[1]!=='string'||seen.has(item[0])||locked(target(item[0])))throw new Error('Invalid spreadsheet edit.');seen.add(item[0]);}
    for(const [entry] of state.edits)if(!original.has(entry))original.set(entry,structuredClone(target(entry).value));
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
      const cell = sheet.getCell(entry.slice(split + 1));
      if (format === 'csv') cell.value = value;
      else assignCell(cell, value);
      edits.set(entry, value);
    }
    active = state.active; page = state.page; columnPage=state.columnPage??0;
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
      button.addEventListener('click', () => { active = index; page = 0; columnPage=0; render(host, onChange); });
      tabs.append(button);
    });
    host.append(tabs);
    const sheet = book.worksheets[active];
    const rows = Math.min(1048576,Math.max(sheet.rowCount+1, page*50+50));
    const columns = Math.min(16384,Math.max(sheet.columnCount+1,columnPage*20+20));
    const lastPage = Math.max(0, Math.ceil(rows / 50) - 1);
    page = Math.min(page, lastPage);
    const jump=document.createElement('form');jump.className='document-v2-actions';
    const address=document.createElement('input');address.setAttribute('aria-label','Go to cell');address.placeholder='Cell, e.g. B12';
    const go=document.createElement('button');go.textContent='Go to cell';go.type='submit';
    const status=document.createElement('span');status.setAttribute('role','status');
    jump.append(address,go,status);host.append(jump);
    jump.addEventListener('submit',event=>{event.preventDefault();const value=address.value.trim().toUpperCase();if(!validAddress(value)){status.textContent='Enter a cell from A1 to XFD1048576.';return;}const cell=sheet.getCell(value);page=Math.floor((cell.row-1)/50);columnPage=Math.floor((cell.col-1)/20);render(host,onChange);[...host.querySelectorAll('input[data-cell]')].find(input=>input.dataset.cell===value)?.focus();});
    const region = document.createElement('div');
    region.className = 'document-v2-grid';
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', `${sheet.name} cells; scroll horizontally for more columns`);
    const table = document.createElement('table');
    const head=document.createElement('thead'),heading=document.createElement('tr');heading.append(document.createElement('th'));
    for(let col=columnPage*20+1;col<=Math.min(columns,(columnPage+1)*20);col++){const th=document.createElement('th');th.scope='col';th.textContent=sheet.getColumn(col).letter;heading.append(th);}head.append(heading);table.append(head);
    const body = document.createElement('tbody');
    for (let row = page * 50 + 1; row <= Math.min(rows, (page + 1) * 50); row++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.scope = 'row'; th.textContent = row; tr.append(th);
      for (let col = columnPage*20+1; col <= Math.min(columns, (columnPage+1)*20); col++) {
        const cell = sheet.getCell(row, col);
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';input.dataset.cell=cell.address;input.readOnly=locked(cell);
        input.style.fontWeight=cell.font?.bold?'bold':'normal';input.style.fontStyle=cell.font?.italic?'italic':'normal';
        if(input.readOnly)input.title='Merged continuation or shared/array formula; edit its source cell in a spreadsheet app.';
        input.value = displayValue(cell.value);
        input.setAttribute('aria-label', `${sheet.name} ${cell.address}`);
        input.addEventListener('change', () => {
          if(locked(cell)){input.value=displayValue(cell.value);return;}
          if (input.value === displayValue(cell.value)) return;
          const entry = key(sheet, cell.address);
          if (!original.has(entry)) original.set(entry, structuredClone(cell.value));
          if (format === 'csv') cell.value = input.value;
          else assignCell(cell, input.value);
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
    const left=document.createElement('button');left.type='button';left.textContent='Previous columns';left.disabled=columnPage===0;
    const right=document.createElement('button');right.type='button';right.textContent='Next columns';right.disabled=columnPage>=819;
    left.addEventListener('click',()=>{columnPage--;render(host,onChange);});right.addEventListener('click',()=>{columnPage++;render(host,onChange);});
    // Next rows can extend beyond the currently populated range.
    next.disabled=page>=20971;
    nav.append(previous, label, next,left,right); host.append(nav);
  }
  return {
    format, snapshot, restore, render,
    async export() {
      if (format === 'csv') {
        const sheet = book.worksheets[0];
        const rows = [];
        let rowCount=csvShape.rows,columnCount=csvShape.columns;
        sheet.eachRow({includeEmpty:false},row=>row.eachCell({includeEmpty:false},cell=>{if(cell.value!==null&&cell.value!==''){rowCount=Math.max(rowCount,cell.row);columnCount=Math.max(columnCount,cell.col);}}));
        if(rowCount*columnCount>2_000_000)throw new Error('This CSV range is too large to export safely. Undo distant cell edits or use an XLSX workbook.');
        for (let r = 1; r <= rowCount; r++) {
          const values = [];
          for (let c = 1; c <= columnCount; c++) {
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
