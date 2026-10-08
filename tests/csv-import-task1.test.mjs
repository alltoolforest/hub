import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCsvBytes,inspectCsv,formatImportSummary} from '../assets/js/csv-import.js';

const encoder=new TextEncoder();
test('UTF-8 Unicode decodes without changing values',()=>{
  const decoded=decodeCsvBytes(encoder.encode('name,amount\nJosé,-125.50'));
  assert.equal(decoded.encoding,'utf-8');
  assert.equal(decoded.text,'name,amount\nJosé,-125.50');
});
test('UTF-8 BOM detected and stripped',()=>{
  const bytes=new Uint8Array([0xef,0xbb,0xbf,...encoder.encode('a,b')]);
  assert.equal(decodeCsvBytes(bytes).text,'a,b');
});
test('invalid UTF-8 prompts for explicit encoding',()=>{
  assert.throws(()=>decodeCsvBytes(new Uint8Array([0x80])),/not valid UTF-8/);
  assert.equal(decodeCsvBytes(new Uint8Array([0x80]),'windows-1252').text,'€');
});
test('malformed quote fails before editing',()=>{
  const parser={parse:()=>({data:[['a']],errors:[{type:'Quotes',row:0}],meta:{}})};
  assert.throws(()=>inspectCsv(parser,'ignored'),/Malformed quoted/);
});
test('irregular column widths produce non-destructive warning',()=>{
  const parser={parse:()=>({data:[['a','b'],['c']],errors:[],meta:{delimiter:',',linebreak:'\n'}})};
  const result=inspectCsv(parser,'a,b\nc',{header:true});
  assert.equal(result.rows[1].length,1);
  assert.equal(result.diagnostics.irregularRows,1);
  assert.match(formatImportSummary(result.diagnostics),/Warnings/);
});
test('auto delimiter diagnostic is reported',()=>{
  const parser={parse:()=>({data:[['abc']],errors:[{type:'Delimiter',code:'UndetectableDelimiter',message:'Could not detect delimiter'}],meta:{delimiter:','}})};
  const result=inspectCsv(parser,'abc');
  assert.ok(result.diagnostics.warnings.some(x=>x.includes('Delimiter')));
});
