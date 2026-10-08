import {$,$$,el,field,read,action,notice,setupStatus,status,fileInput,bindFile,checkFile,load,output,downloads,clearOutputs,safeName,copy,openPDF,url} from './core.js';
import {safeCell} from './math.js';
export function sanitizeDocument(purifier,html){return purifier.sanitize(html,{ALLOWED_TAGS:['p','br','h1','h2','h3','h4','strong','b','em','i','u','s','ul','ol','li','table','thead','tbody','tr','td','th','blockquote','span'],ALLOWED_ATTR:['colspan','rowspan'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,FORBID_TAGS:['script','style','iframe','object','embed','form','input','svg','math','img','a'],FORBID_ATTR:['style','src','srcdoc','href'],KEEP_CONTENT:true})}
function textOfCell(v){if(v===null||v===undefined)return '';if(typeof v==='object'){if('result'in v)return v.result??'';if(v.richText)return v.richText.map(x=>x.text).join('');if(v.text)return v.text;if(v instanceof Date)return v.toISOString().slice(0,10);return ''}return v}
export async function mount(root,slug){let filename='document.docx',kind='docx',workbook=null,activeSheet=0,sheets=[],parser=null,purifier=null;
const input=fileInput(root,slug==='docx-viewer'?'.docx':slug==='csv-cleaner'?'.csv':'.docx,.xlsx,.csv,.txt,.pdf,.doc,.xls,.ppt,.pptx,.jpg,.jpeg,.png,.webp',false,slug==='csv-cleaner'?'Open a CSV file':slug==='docx-viewer'?'Open a Word document':'Open your document');
const csvImport=slug==='csv-cleaner'?await import('./csv-import.js'):null;
const csvClean=slug==='csv-cleaner'?await import('./csv-cleaning.js'):null;
const csvPaging=slug==='csv-cleaner'?await import('./csv-table-page.js'):null;
const csvOps=slug==='csv-cleaner'?await import('./csv-operations.js'):null;
let csvView={search:'',filterColumn:-1,filterText:'',sortColumn:-1,descending:false};
let csvSelectedRow=null;
const csvHistory=csvClean?new csvClean.CsvHistory():null;
let csvCleanActions=null;
let csvRefreshControls=()=>{};
let csvResetViewControls=()=>{};
let csvPreparedExportVersion=-1, csvChangeVersion=0;
let lastCsvFile=null, csvHasHeader=false, csvDirty=false;
const csvEditStatus=csvClean?el('p',{class:'csv-edit-status',role:'status','aria-live':'polite'}):null;
function markCsvDirty(){if(!csvClean)return;csvDirty=true;csvChangeVersion++;if(csvPreparedExportVersion!==-1){clearOutputs();csvPreparedExportVersion=-1;}if(csvEditStatus)csvEditStatus.textContent='Unsaved changes — export CSV or XLSX to save.';}
if(csvClean)window.addEventListener('beforeunload',event=>{if(!csvDirty)return;event.preventDefault();event.returnValue='';});
const csvOptions=el('div',{class:'fields',hidden:slug!=='csv-cleaner'});
const csvReport=el('pre',{class:'notice',hidden:true,style:'white-space:pre-wrap;overflow-wrap:anywhere','role':'status','aria-live':'polite'});
if(csvImport){
  csvOptions.append(field('csv-encoding','Text encoding','select','auto',{options:csvImport.ENCODINGS}),
                    field('csv-delimiter','Field delimiter','select','auto',{options:csvImport.DELIMITERS}),
                    field('csv-header','First row','select','no',{options:[['no','Data (no header)'],['yes','Column headers']]}));
  root.append(csvOptions,csvReport);
  csvOptions.addEventListener('change',async()=>{
    if(!lastCsvFile)return;
    try{if(csvDirty&&!window.confirm('Changing import settings reloads the original file and discards edits. Continue?'))return;status('Re-reading CSV with selected import options…');await loadFile(lastCsvFile);status('CSV import options applied.');}
    catch(e){status(e.message||String(e),true);}
  });
}
if(!csvClean)notice(root,'Word content reflows as you edit. Complex layouts, headers, footers and images may be simplified. Spreadsheet charts, macros, connections, formulas and advanced formatting are not preserved; imported formulas are shown as cached values. Keep your original.');
if(slug==='document-editor')root.append(el('a',{class:'button',href:url('documents/edit-pdf/'),text:'Open visual PDF Editor ↗'}));
const toolbar=el('div',{class:'toolbar'}),editor=el('div',{id:'editor',class:'editor',contenteditable:'true',role:'textbox','aria-label':'Editable document','aria-multiline':'true'}),sheetControls=el('div',{class:'fields',hidden:true}),grid=el('div',{class:'table-wrap',hidden:true});
for(const [label,cmd,arg]of [['Bold','bold'],['Italic','italic'],['Underline','underline'],['Bullets','insertUnorderedList'],['Numbered list','insertOrderedList'],['Heading','formatBlock','h2'],['Paragraph','formatBlock','p'],['Undo','undo'],['Redo','redo']]){const b=el('button',{type:'button',text:label});b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>{editor.focus();document.execCommand(cmd,false,arg)});toolbar.append(b)}
root.append(toolbar,editor,sheetControls,grid);if(csvClean){toolbar.hidden=true;editor.hidden=true;}const selector=field('sheet-select','Worksheet','select','',{options:[]});sheetControls.append(selector);
async function ensureSanitizer(){return purifier||=await load('purify')}
async function setHTML(html){editor.innerHTML=sanitizeDocument(await ensureSanitizer(),html)}
editor.addEventListener('paste',async e=>{e.preventDefault();const plain=e.clipboardData.getData('text/plain');document.execCommand('insertText',false,plain)});
editor.addEventListener('drop',e=>e.preventDefault());
function renderSheets(){sheetControls.hidden=!!csvClean;grid.hidden=false;editor.hidden=toolbar.hidden=true;$('#sheet-select').replaceChildren(...sheets.map((s,i)=>el('option',{value:i,text:s.name})));$('#sheet-select').value=String(activeSheet);renderTable()}
let csvPage=0;
const csvPageBar=csvClean?el('div',{class:'csv-navigation'}):null;
let csvEditHint=null;
if(csvClean){grid.classList.add('csv-table-shell');grid.setAttribute('role','region');grid.setAttribute('aria-label','Scrollable CSV data table');grid.setAttribute('tabindex','0');
 csvEditHint=el('p',{class:'csv-edit-hint',text:'Swipe or scroll sideways to see more columns. Tap or focus a cell to edit; use Tab to move between cells. Changes stay in this browser until exported.'});
 grid.before(csvEditHint);grid.after(csvEditStatus);}
if(csvPageBar){csvPageBar.setAttribute('aria-label','CSV page navigation');grid.after(csvPageBar);}
function renderTable(){
 const rows=sheets[activeSheet].rows;
 if(!csvClean){
   grid.replaceChildren();const table=el('table'),body=el('tbody'),cols=Math.max(1,...rows.map(r=>r.length));const head=el('tr');head.append(el('th',{text:'#'}));
   for(let j=0;j<cols;j++)head.append(el('th',{text:columnName(j)}));table.append(el('thead',{},head));
   rows.forEach((row,i)=>{const tr=el('tr');tr.append(el('th',{text:i+1}));
     for(let j=0;j<cols;j++){const td=el('td',{contenteditable:'true',role:'textbox','aria-label':`${columnName(j)}${i+1}`,text:row[j]??''});
       td.addEventListener('input',()=>{rows[i][j]=td.textContent});
       td.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});tr.append(td)}body.append(tr)});
   table.append(body);grid.append(table);return;
 }
 // Only the current CSV page is materialized; the entire model remains available for export.
 const cols=rows.reduce((n,row)=>Math.max(n,row.length),1),first=csvHasHeader?1:0;
 const visible=csvOps.viewIndices(rows,{...csvView,header:csvHasHeader});
 const windowPage=csvPaging.pageWindow(visible.length,false,csvPage);
 const {count,pages,from,to}=windowPage;
 csvPage=windowPage.page;
 const table=el('table'),head=el('tr'),body=el('tbody');
 table.setAttribute('aria-label','CSV rows');
 head.append(el('th',{text:'#',scope:'col'}));
 for(let j=0;j<cols;j++)head.append(el('th',{text:csvHasHeader?String(rows[0]?.[j]??'')||columnName(j):columnName(j),scope:'col'}));
 table.append(el('thead',{},head));
 for(let k=from;k<to;k++){
   const i=visible[k];
   const tr=el('tr');tr.append(el('th',{text:i+1,scope:'row'}));
   for(let j=0;j<cols;j++){
     const td=el('td',{contenteditable:'true',role:'textbox','aria-label':`Row ${i+1}, ${csvHasHeader?String(rows[0]?.[j]??'')||columnName(j):'column '+columnName(j)}`,text:rows[i]?.[j]??''});
     td.dataset.row=String(i);td.dataset.col=String(j);tr.append(td);
   }body.append(tr);
 }
 table.append(body);grid.replaceChildren(table);
 csvPageBar.replaceChildren();
 const previous=el('button',{type:'button',text:'Previous page'});
 const next=el('button',{type:'button',text:'Next page'});
 previous.disabled=csvPage===0;next.disabled=csvPage>=pages-1;
 const summary=el('span',{role:'status','aria-live':'polite',text:`Showing ${count?from+1:0}–${to} of ${visible.length} matching rows (${rows.length-(csvHasHeader?1:0)} total); page ${csvPage+1} of ${pages}`});
 previous.addEventListener('click',()=>{csvSelectedRow=null;csvPage--;renderTable()});
 next.addEventListener('click',()=>{csvSelectedRow=null;csvPage++;renderTable()});
 csvPageBar.append(previous,summary,next);
}
if(csvClean){
 // Delegation avoids two listeners per editable cell and retains model indices across pages.
 let editRecorded=false;
 grid.addEventListener('focusin',e=>{
  const cell=e.target.closest('td[data-row][data-col]');
  if(cell)csvSelectedRow=Number(cell.dataset.row);
  if(!cell)return;

 });
 grid.addEventListener('focusout',e=>{if(e.target.matches('td[data-row][data-col]'))editRecorded=false});
 grid.addEventListener('input',e=>{
  const cell=e.target.closest('td[data-row][data-col]');if(!cell)return;
  const i=Number(cell.dataset.row),j=Number(cell.dataset.col);
  const rows=sheets[activeSheet]?.rows;
  if(rows&&rows[i]&&rows[i][j]!==cell.textContent){
    if(!editRecorded){csvHistory.record(rows);editRecorded=true;}
    rows[i][j]=cell.textContent;
    markCsvDirty();
  }
 });
 grid.addEventListener('paste',e=>{
  if(!e.target.closest('td[data-row][data-col]'))return;
  e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));
 });
}

$('#sheet-select').addEventListener('change',()=>{activeSheet=+read('sheet-select');renderTable()});
async function loadFile(file){const ext=checkFile(file,null,20);
 if(ext==='csv'&&csvImport){
  // Validate replacement off-state: errors must not discard the active CSV.
  const candidateParser=parser||await load('csv');
  const imported=await csvImport.importCsvFile(file,candidateParser,{
    encoding:read('csv-encoding'),delimiter:read('csv-delimiter'),
    header:read('csv-header')==='yes'
  });
  if(imported.rows.length>2000||imported.rows.some(r=>r.length>100))throw Error('For responsive editing, use at most 2,000 rows and 100 columns.');
  // Commit only after complete, successful validation.
  clearOutputs();parser=candidateParser;filename=file.name;kind='csv';
  activeSheet=0;
  csvHistory.reset();csvDirty=false;csvPreparedExportVersion=-1;csvChangeVersion=0;
  if(csvEditStatus)csvEditStatus.textContent='CSV loaded. No unsaved edits.';
  csvPage=0;csvView={search:'',filterColumn:-1,filterText:'',sortColumn:-1,descending:false};
  csvSelectedRow=null;csvResetViewControls();
  sheets=[{name:'Sheet1',rows:imported.rows}];
  csvHasHeader=imported.diagnostics.headerSelected;
  renderSheets();
  csvReport.hidden=false;
  csvReport.textContent=csvImport.formatImportSummary(imported.diagnostics);
  const reportDetails=csvReport.closest('details');if(reportDetails)reportDetails.open=imported.diagnostics.warnings.length>0;
  lastCsvFile=file;
  return;
 }
 
 clearOutputs();filename=file.name;if(['doc','xls','ppt'].includes(ext))throw Error('Legacy '+ext.toUpperCase()+' editing is not enabled. Open it in an office application and save as DOCX or XLSX first.');if(ext==='pptx')throw Error('PowerPoint files are recognized, but slide editing is not enabled. Use a presentation application.');if(['jpg','jpeg','png','webp'].includes(ext)){editor.hidden=true;const p=el('p',{},[el('a',{class:'button',href:url('documents/image-to-text/'),text:'Open Image to Text OCR'}),el('a',{class:'button',href:url('images/studio/'),text:'Open Image Studio'})]);root.prepend(p);throw Error('This is an image. Choose Image Studio or OCR using the links above.')}if(!['docx','xlsx','csv','txt','pdf'].includes(ext))throw Error('Supported editable files: DOCX, XLSX, CSV and TXT.');kind=ext;sheets=[];activeSheet=0;if(ext!=='csv')csvHasHeader=false;sheetControls.hidden=grid.hidden=true;editor.hidden=toolbar.hidden=false;
if(ext==='docx'){status('Loading Word engine…');const mammoth=await load('mammoth');const result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{convertImage:mammoth.images.imgElement(()=>Promise.resolve({src:''}))});await setHTML(result.value)}
else if(ext==='txt'){editor.replaceChildren(...(await file.text()).split('\n').map(line=>el('p',{text:line||'\u00a0'})))}
else if(ext==='pdf'){notice(root,'PDF text is reconstructed into a flowing document. Original layout is not retained. For visual edits, use Edit PDF. Scanned pages require OCR.');const doc=await openPDF(await file.arrayBuffer());const fragments=[];try{for(let i=1;i<=doc.numPages;i++){status(`Extracting page ${i} of ${doc.numPages}…`);const page=await doc.getPage(i),content=await page.getTextContent();let line='';for(const item of content.items){line+=item.str+' ';if(item.hasEOL){fragments.push(el('p',{text:line.trim()}));line=''}}if(line.trim())fragments.push(el('p',{text:line.trim()}));page.cleanup()}}finally{await doc.destroy()}if(!fragments.length)throw Error('This PDF has no selectable text. Use Scanned PDF to Text OCR, then paste the text here.');editor.replaceChildren(...fragments);kind='docx'}

else if(ext==='csv'){parser=await load('csv');const result=parser.parse(await file.text(),{skipEmptyLines:false});if(result.errors.some(e=>e.type==='Quotes'))throw Error('CSV contains malformed quotes. Check the source file.');if(result.data.length>2000||result.data.some(r=>r.length>100))throw Error('For responsive editing, use at most 2,000 rows and 100 columns.');sheets=[{name:'Sheet1',rows:result.data.length?result.data:[['']]}];renderSheets()}
else{status('Loading spreadsheet engine…');const Excel=await load('excel');workbook=new Excel.Workbook();await workbook.xlsx.load(await file.arrayBuffer());if(workbook.worksheets.length>20)throw Error('Use a workbook with at most 20 sheets.');for(const sheet of workbook.worksheets){if(sheet.rowCount>2000||sheet.columnCount>100)throw Error('For responsive editing, use at most 2,000 rows and 100 columns per sheet.');const rows=[];for(let i=1;i<=Math.max(1,sheet.rowCount);i++){const row=[];for(let j=1;j<=Math.max(1,sheet.columnCount);j++)row.push(textOfCell(sheet.getCell(i,j).value));rows.push(row)}sheets.push({name:sheet.name,rows})}if(!sheets.length)sheets=[{name:'Sheet1',rows:[['']]}];renderSheets()}}
bindFile(input,async files=>{if(csvDirty&&!window.confirm('You have unsaved CSV changes. Open another file and discard them?'))return;await loadFile(files[0]);cleanActions.hidden=!!csvClean||!sheets.length;if(csvCleanActions)csvCleanActions.hidden=!sheets.length;csvRefreshControls();$('#export-format').value=sheets.length?(kind==='csv'?'csv':'xlsx'):'docx';for(const o of $('#export-format').options)o.disabled=sheets.length?!['xlsx','csv'].includes(o.value):['xlsx','csv'].includes(o.value)});
const cleanActions=el('div',{class:'actions',hidden:true});cleanActions.append(action('Add row',()=>{if(!sheets.length)throw Error('Open a spreadsheet first.');const rows=sheets[activeSheet].rows;if(rows.length>=2000)throw Error('The editor supports up to 2,000 rows.');rows.push(Array(Math.max(1,...rows.map(r=>r.length))).fill(''));renderTable()}),action('Add column',()=>{if(!sheets.length)throw Error('Open a spreadsheet first.');if(sheets[activeSheet].rows[0].length>=100)throw Error('The editor supports up to 100 columns.');sheets[activeSheet].rows.forEach(r=>r.push(''));renderTable()}),action('Clean rows',()=>{if(!sheets.length)throw Error('Open a CSV or spreadsheet first.');sheets[activeSheet].rows=sheets[activeSheet].rows.map(r=>r.map(v=>typeof v==='string'?v.trim():v)).filter(r=>r.some(v=>String(v).trim()));if(!sheets[activeSheet].rows.length)sheets[activeSheet].rows=[['']];renderTable()}),action('Remove duplicates',()=>{if(!sheets.length)throw Error('Open a CSV or spreadsheet first.');const seen=new Set();sheets[activeSheet].rows=sheets[activeSheet].rows.filter(r=>{const key=JSON.stringify(r);if(seen.has(key))return false;seen.add(key);return true});renderTable()}));root.append(cleanActions);
if(csvClean){
  const controls=el('div',{class:'actions',hidden:true});csvCleanActions=controls;
  const report=el('p',{class:'status',role:'status','aria-live':'polite'});
  function rows(){if(!sheets.length)throw Error('Open a CSV first.');return sheets[activeSheet].rows;}
  for(const [label,kind] of [['Trim whitespace','trim'],['Remove blank rows','blank'],['Remove exact duplicates','duplicates']]){
    controls.append(action(label,()=>{
      const result=csvClean.transformRows(rows(),kind,{header:csvHasHeader});
      if(!result.changed&&!result.removed){report.textContent='No changes required.';return;}
      if(!window.confirm(result.description+'. Apply?')){report.textContent='Cancelled without changes.';return;}
      csvHistory.record(rows());sheets[activeSheet].rows=result.rows;markCsvDirty();renderTable();
      report.textContent='Applied: '+result.description.replace('will be','were')+'.';
    }));
  }
  controls.append(action('Undo',()=>{const prior=csvHistory.undo(rows());if(!prior)throw Error('Nothing to undo.');sheets[activeSheet].rows=prior;markCsvDirty();csvSelectedRow=null;renderTable();report.textContent='Undone.';}));
  controls.append(action('Redo',()=>{const next=csvHistory.redo(rows());if(!next)throw Error('Nothing to redo.');sheets[activeSheet].rows=next;markCsvDirty();csvSelectedRow=null;renderTable();report.textContent='Redone.';}));
  const find=field('csv-search','Find in any column','text','');
  const filterCol=field('csv-filter-column','Filter column (1-based; 0 for none)','number','0');
  const filterText=field('csv-filter-text','Filter contains','text','');
  const sortCol=field('csv-sort-column','Sort column (1-based; 0 for none)','number','0');
  const sortDir=field('csv-sort-direction','Sort direction','select','asc',{options:[['asc','Ascending'],['desc','Descending']]});
  const viewFields=el('div',{class:'fields'},[find,filterCol,filterText,sortCol,sortDir]);
  csvResetViewControls=()=>{for(const [id,value] of [['csv-search',''],['csv-filter-text',''],['csv-filter-column','0'],['csv-sort-column','0'],['csv-sort-direction','asc']]){const control=$('#'+id);if(control)control.value=value;}};
  const resetView=()=>{csvPage=0;csvSelectedRow=null;renderTable();};
  function updateView(){
    const max=csvOps.width(rows());
    const fc=Number(read('csv-filter-column')),sc=Number(read('csv-sort-column'));
    if(!Number.isInteger(fc)||!Number.isInteger(sc)||fc<0||sc<0||fc>max||sc>max)throw Error('Column numbers must be 0 to '+max+'.');
    csvView={search:String(read('csv-search')||''),filterColumn:fc-1,filterText:String(read('csv-filter-text')||''),sortColumn:sc-1,descending:read('csv-sort-direction')==='desc'};
    resetView();report.textContent='Table view updated. Hidden rows are preserved for export.';
  }
  controls.append(action('Apply search / filter / sort',updateView),
                  action('Clear view',()=>{
                    csvView={search:'',filterColumn:-1,filterText:'',sortColumn:-1,descending:false};
                    csvResetViewControls();resetView();report.textContent='All rows visible.';
                  }));
  function commit(next,description){csvHistory.record(rows());sheets[activeSheet].rows=next;markCsvDirty();csvPage=0;csvSelectedRow=null;renderTable();report.textContent=description;}
  controls.append(action('Add row',()=>commit(csvOps.addRow(rows()),'Blank row added.')),
    action('Delete selected row',()=>{
      if(csvSelectedRow===null)throw Error('Select an editable table cell first.');
      if(!window.confirm('Delete original row '+(csvSelectedRow+1)+'?'))return;
      commit(csvOps.deleteRow(rows(),csvSelectedRow,{header:csvHasHeader}),'Row deleted.');
    }),
    action('Add column',()=>commit(csvOps.addColumn(rows()),'Column added.')));
  const deleteCol=field('csv-delete-column','Delete column (1-based)','number','1');
  const dedupCols=field('csv-dedup-columns','Duplicate comparison columns (e.g. 1,3)','text','1');
  controls.append(action('Delete specified column',()=>{
    const col=Number(read('csv-delete-column'))-1;
    const next=csvOps.deleteColumn(rows(),col);
    if(!window.confirm('Delete column '+(col+1)+' from all rows?'))return;
    commit(next,'Column deleted.');
  }),action('Remove duplicates by columns',()=>{
    const cols=String(read('csv-dedup-columns')).split(',').map(x=>Number(x.trim())-1);
    const result=csvOps.removeDuplicateKeys(rows(),cols,{header:csvHasHeader});
    if(!result.removed){report.textContent='No matching duplicates.';return;}
    if(!window.confirm('Remove '+result.removed+' duplicate rows from the full dataset?'))return;
    commit(result.rows,result.removed+' duplicate rows removed.');
  }));
  root.append(viewFields,deleteCol,dedupCols,controls,report);
}
const exportFields=el('div',{class:'fields'});exportFields.append(field('export-format','Export format','select',slug==='csv-cleaner'?'csv':'docx',{options:[['docx','Word (.docx)'],['txt','Plain text (.txt)'],['html','HTML document'],['xlsx','Excel workbook (.xlsx)'],['csv','CSV (selected sheet)']]}));root.append(exportFields);
async function exportFile(){const ext=read('export-format');clearOutputs();if(['xlsx','csv'].includes(ext)){if(!sheets.length)throw Error('Open an XLSX or CSV file before spreadsheet export.');if(ext==='csv'){parser||=await load('csv');const rows=sheets[activeSheet].rows;
  if(csvClean){const risks=csvClean.csvExportCheck(rows);if(risks.length)throw Error('Export blocked: '+risks.length+' potentially executable spreadsheet formula values (first at row '+risks[0][0]+', column '+risks[0][1]+'). Use XLSX to preserve exact text safely.');}
  const text=parser.unparse(csvClean?rows:rows.map(r=>r.map(safeCell)));output(new Blob(['\ufeff',text],{type:'text/csv;charset=utf-8'}),safeName(filename,'-edited','csv'));if(csvClean){csvPreparedExportVersion=csvChangeVersion;csvEditStatus.textContent='CSV prepared. Choose Download below and confirm your device saved it.';}}else{const Excel=await load('excel'),book=new Excel.Workbook();for(const sheet of sheets){const s=book.addWorksheet(sheet.name.slice(0,31));for(const row of sheet.rows)s.addRow(row.map(v=>csvClean?csvClean.escapeForXlsx(v):typeof v==='string'?safeCell(v):v))}output(new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),safeName(filename,'-edited','xlsx'));if(csvClean){csvPreparedExportVersion=csvChangeVersion;csvEditStatus.textContent='XLSX prepared. Choose Download below and confirm your device saved it.';}}return}
if(sheets.length)throw Error('Choose XLSX or CSV for spreadsheet export.');const clean=sanitizeDocument(await ensureSanitizer(),editor.innerHTML);if(ext==='txt')output(new Blob([editor.innerText??editor.textContent],{type:'text/plain;charset=utf-8'}),safeName(filename,'-edited','txt'));else if(ext==='html')output(new Blob([`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Edited document</title><style>body{font:16px/1.6 system-ui;max-width:800px;margin:40px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px}</style></head><body>${clean}</body></html>`],{type:'text/html;charset=utf-8'}),safeName(filename,'-edited','html'));else{status('Preparing Word export…');const d=await load('docx');const holder=el('div');holder.innerHTML=clean;const children=toDocxBlocks(holder,d);const document=new d.Document({sections:[{properties:{},children:children.length?children:[new d.Paragraph('')]}]});output(await d.Packer.toBlob(document),safeName(filename,'-edited','docx'))}}
const exportActions=el('div',{class:'actions'},[action(csvClean?'Download cleaned file':'Export document',exportFile,true),action('Print / Save PDF',()=>{if(sheets.length)throw Error('Export a workbook as XLSX or CSV.');document.body.classList.add('print-editor');window.print()}),action('Copy text',()=>copy(sheets.length?sheets[activeSheet].rows.map(r=>r.join('\t')).join('\n'):(editor.innerText??editor.textContent))),action(csvClean?'Clear CSV workspace':'New blank document',()=>{if(csvDirty&&!window.confirm('Discard unsaved CSV edits and clear the workspace?'))return;editor.replaceChildren();editor.hidden=toolbar.hidden=!!csvClean;sheetControls.hidden=grid.hidden=true;sheets=[];cleanActions.hidden=true;$('#export-format').value=csvClean?'csv':'docx';for(const o of $('#export-format').options)o.disabled=['xlsx','csv'].includes(o.value);filename=csvClean?'data.csv':'document.docx';kind=csvClean?'csv':'docx';if(csvClean){csvDirty=false;csvPreparedExportVersion=-1;csvChangeVersion=0;csvPage=0;csvSelectedRow=null;csvHasHeader=false;lastCsvFile=null;csvView={search:'',filterColumn:-1,filterText:'',sortColumn:-1,descending:false};csvHistory.reset();csvResetViewControls();csvReport.hidden=true;csvReport.textContent='';csvPageBar.replaceChildren();csvEditStatus.textContent='';}clearOutputs();csvRefreshControls()})]);root.append(exportActions);notice(root,csvClean?'CSV export preserves values and blocks spreadsheet formula risks; XLSX stores imported values as literal strings. Export before leaving.':'CSV and XLSX exports protect formula-like text by prefixing it with an apostrophe. New spreadsheet formulas are treated as text. Use Export to retain your changes before leaving this page.');setupStatus(root);downloads(root);
if(csvClean){
  // Progressive disclosure: only CSV tool controls are regrouped; handlers and data stay untouched.
  const section=(label,opened=false)=>{const d=el('details',{class:'csv-control-section'});if(opened)d.open=true;d.append(el('summary',{text:label}));return d;};
  const importOptions=section('Import settings · encoding, delimiter, header');
  csvOptions.replaceWith(importOptions);importOptions.append(csvOptions);csvOptions.hidden=false;
  const importReport=section('Import details and warnings');
  csvReport.replaceWith(importReport);importReport.append(csvReport);
  const quick=el('div',{class:'actions'}),advanced=section('Find, filter and sort'),manage=section('Rows, columns and advanced duplicates'),extras=section('More actions');
  const basic=new Set(['Trim whitespace','Remove blank rows','Remove exact duplicates']);
  const history=new Set(['Undo','Redo']);
  const view=new Set(['Apply search / filter / sort','Clear view']);
  const management=new Set(['Add row','Delete selected row','Add column','Delete specified column','Remove duplicates by columns']);
  for(const b of [...csvCleanActions.querySelectorAll('button')]){
    if(basic.has(b.textContent))quick.append(b);
    else if(history.has(b.textContent))extras.append(b);
    else if(view.has(b.textContent))advanced.append(b);
    else if(management.has(b.textContent))manage.append(b);
  }
  const findField=$('#csv-search')?.closest('.fields');
  if(findField)advanced.prepend(findField);
  for(const id of ['csv-delete-column','csv-dedup-columns']){const item=$('#'+id)?.closest('.field');if(item)manage.append(item);}
  csvCleanActions.replaceWith(quick,advanced,manage);
  for(const button of [...exportActions.querySelectorAll('button')]){
    if(button.textContent==='Download cleaned file')continue;
    if(button.textContent==='Print / Save PDF'){button.remove();continue;}
    extras.append(button);
  }
  exportActions.after(extras);
  sheetControls.hidden=true;
  const showControls=()=>{const active=!!sheets.length;quick.hidden=!active;advanced.hidden=!active;manage.hidden=!active;exportFields.hidden=!active;exportActions.hidden=!active;extras.hidden=!active;importReport.hidden=!active;csvPageBar.hidden=!active;csvEditStatus.hidden=!active;csvEditHint.hidden=!active;};
  showControls();
  csvRefreshControls=showControls;
  $('#downloads').addEventListener('click',event=>{
    const anchor=event.target.closest('a[download]');if(!anchor)return;
    if(csvPreparedExportVersion!==csvChangeVersion){event.preventDefault();csvEditStatus.textContent='Data changed since export. Generate a fresh file before downloading.';return;}
    // Download initiation does not prove that the browser or device saved the file.
    // Keep the unsaved-change warning active until the user explicitly discards the data.
    csvEditStatus.textContent='Download requested. Confirm the file was saved; unsaved-change protection remains active.';
  });
}
}
function columnName(index){let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
export function toDocxBlocks(container,d){function runs(node,styles={}){if(node.nodeType===3)return [new d.TextRun({text:node.textContent,...styles})];if(node.nodeType!==1)return [];const next={...styles};if(['STRONG','B'].includes(node.tagName))next.bold=true;if(['EM','I'].includes(node.tagName))next.italics=true;if(node.tagName==='U')next.underline={};if(node.tagName==='BR')return [new d.TextRun({break:1})];return [...node.childNodes].flatMap(n=>runs(n,next))}const out=[];for(const n of container.childNodes){if(n.nodeType===3){if(n.textContent.trim())out.push(new d.Paragraph({children:runs(n)}));continue}if(n.tagName==='TABLE'){const rows=[...n.querySelectorAll('tr')].map(tr=>new d.TableRow({children:[...tr.children].map(td=>new d.TableCell({children:[new d.Paragraph({children:runs(td)})]}))}));if(rows.length)out.push(new d.Table({rows,width:{size:100,type:d.WidthType.PERCENTAGE}}))}else if(['UL','OL'].includes(n.tagName)){[...n.children].forEach((li,i)=>out.push(new d.Paragraph({children:[...(n.tagName==='OL'?[new d.TextRun(`${i+1}. `)]:[]),...runs(li)],...(n.tagName==='UL'?{bullet:{level:0}}:{})})))}else out.push(new d.Paragraph({children:runs(n),...(/^H[1-4]$/.test(n.tagName)?{heading:d.HeadingLevel['HEADING_'+n.tagName.slice(1)]}:{})}))}return out}
