import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/editor.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/csv-cleaner.css',import.meta.url),'utf8');

test('re-import resets both view model and visible filter/sort fields',()=>{
 assert.match(source,/csvResetViewControls\(\);\s*csvPage=0/);
 for(const fragment of ["['csv-search','']","['csv-filter-text','']","['csv-filter-column','0']","['csv-sort-column','0']","['csv-sort-direction','asc']"])
   assert.ok(source.includes(fragment),fragment);
});

test('empty workspace hides all table-only controls',()=>{
 assert.match(source,/csvPageBar\.hidden=!active/);
 assert.match(source,/csvEditStatus\.hidden=!active/);
 assert.match(source,/csvEditHint\.hidden=!active/);
 assert.match(source,/importReport\.hidden=!active/);
 assert.match(source,/csvPageBar\.replaceChildren\(\)/);
 assert.match(source,/lastCsvFile=null/);
 assert.match(css,/body\[data-tool="csv-cleaner"\] \[hidden\]\{display:none!important\}/);
});

test('quick controls are limited to three cleaning actions',()=>{
 assert.match(source,/const basic=new Set\(\['Trim whitespace','Remove blank rows','Remove exact duplicates'\]\)/);
 assert.match(source,/else if\(history\.has\(b\.textContent\)\)extras\.append\(b\)/);
 assert.match(source,/const importReport=section\('Import details and warnings'\)/);
});

test('export is not marked downloaded until link is activated',()=>{
 const handlerStart=source.indexOf("$('#downloads').addEventListener('click'");
 const preparedStart=source.indexOf('async function exportFile()');
 assert.ok(handlerStart>preparedStart);
 const exportSource=source.slice(preparedStart,handlerStart);
 assert.doesNotMatch(exportSource,/CSV export prepared\. No unsaved edits/);
 assert.match(source,/csvPreparedExportVersion=csvChangeVersion/);
 assert.match(source,/csvDirty=false;\s*csvEditStatus\.textContent='Download requested/);
 assert.match(source,/clearOutputs\(\);csvPreparedExportVersion=-1/);
});

test('stale row selection is cleared after page and view changes',()=>{
 assert.match(source,/csvSelectedRow=null;csvPage--;renderTable/);
 assert.match(source,/csvSelectedRow=null;csvPage\+\+;renderTable/);
 assert.match(source,/const resetView=\(\)=>\{csvPage=0;csvSelectedRow=null;renderTable\(\);\}/);
});

test('unrelated document editing path remains preserved',()=>{
 assert.match(source,/if\(!csvClean\)\{/);
 assert.match(source,/csvClean\?'Clear CSV workspace':'New blank document'/);
 assert.match(source,/editor\.hidden=toolbar\.hidden=!!csvClean/);
});
