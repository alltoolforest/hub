import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectTable, rasterBlank, reconstructTable} from '../assets/js/scanned-pdf-ocr-structure.js';

test('uniform near-white scans are blank but faint glyphs remain visible', () => {
 const image=new Uint8ClampedArray(100*100*4).fill(252);
 assert.equal(rasterBlank(image),true);
 for(let i=40;i<90;i++)image[i*4]=244;
 assert.equal(rasterBlank(image),false);
});

test('aligned wrapped descriptions and observed non-sequential numbers retain their row', async () => {
 const word=(text,x,y)=>({text,x,y,h:12,w:text.length*6,confidence:96});
 const words=[
  word('Code',10,10),word('Description',90,10),word('Count',250,10),word('Amount',315,10),
  word('A-310',10,50),word('Valve',90,50),word('007',250,50),word('-31.50',315,50),
  word('assembly',90,66),
  word('A-122',10,90),word('Filter',90,90),word('19',250,90),word('17.01',315,90),
  word('A-485',10,130),word('Filter',90,130),word('17.01',315,130),
  word('A-918',10,170),word('Sensor',90,170),word('007',250,170),word('-15.05',315,170),
  word('A-525',10,210),word('Valve',90,210),word('4',250,210),word('3.15',315,210),
  word('A-826',10,250),word('Filter',90,250),word('1',250,250),word('-4.50',315,250),
 ];
 const table=detectTable(words,words.map(w=>w.text).join(' '));
 assert.ok(table);
 const result=await reconstructTable(table,async ()=>null,{check(){}});
 assert.equal(result.text.split('\n')[1],'A-310\tValve assembly\t007\t-31.50');
 assert.equal(result.text.split('\n')[3],'A-485\tFilter\t\t17.01');
 assert.equal(result.text.split('\n')[4],'A-918\tSensor\t007\t-15.05');
});
