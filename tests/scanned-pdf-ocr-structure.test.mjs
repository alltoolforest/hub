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
 const lowScore=await reconstructTable(table,async ()=>({text:'3',confidence:50,agreement:true}),{check(){}});
 assert.equal(lowScore.text.split('\n')[3],'A-485\tFilter\t3\t17.01');
 assert.equal(lowScore.uncertain,1);
});

test('large headerless runs retain every row and preserve text between tables',async()=>{
 const {detectFollowingTable}=await import('../assets/js/scanned-pdf-ocr-structure.js');
 const word=(text,x,y)=>({text,x,y,h:12,w:text.length*5,confidence:96});
 const rows=(count,offset)=>Array.from({length:count},(_,i)=>[
  word('X-'+i,10,offset+i*24),word('Valve',100,offset+i*24),
  word(i%2?'007':'9.2e-3',240,offset+i*24),word('$14.50',360,offset+i*24)
 ]).flat();
 const words=[...rows(131,10),word('Intervening note',10,3185),...rows(6,3250)];
 const first=detectTable(words,words.map(w=>w.text).join(' '));
 assert.equal(first.header.length,0);
 assert.equal(first.body.length,131);
 const second=detectFollowingTable(first);
 assert.equal(second.body.length,6);
 assert.equal(second.left[0].words[0].text,'Intervening note');
 const output=await reconstructTable(first,async()=>null,{check(){}});
 assert.match(output.text,/X-130\tValve\t9\.2e-3\t\$14\.50/);
});

test('budget exhaustion leaves cells editable and identifies their locations',async()=>{
 const make=(text,x)=>({text,x,y:0,w:12,h:12,confidence:96});
 const table={anchors:[10,100],header:[],height:12,step:24,numberColumns:[1],left:[],rightRows:[],
  body:[{y:20,cells:[[make('Item',10)],[]]},{y:44,cells:[[make('Other',10)],[]]}]};
 const result=await reconstructTable(table,async()=>assert.fail('budget must prevent OCR'),{check(){}},false,false,{take:()=>false});
 assert.equal(result.text,'Item\t\nOther\t');
 assert.equal(result.uncertain,2);
 assert.match(result.warnings[1],/Row 2, column 2: not verified/);
});

test('rupee evidence cannot change the numerical suffix or an observed sign',async()=>{
 const {corroboratedRupee,isNumeric,NUMERIC_WHITELIST}=await import('../assets/js/scanned-pdf-ocr-structure.js');
 const reading={text:'₹1,904.75',confidence:92,agreement:true};
 assert.equal(corroboratedRupee('31,904.75',reading),true);
 assert.equal(corroboratedRupee('1,904.75',reading),true);
 assert.equal(corroboratedRupee('-1,904.75',reading),false);
 assert.equal(corroboratedRupee('$1,904.75',reading),false);
 assert.equal(corroboratedRupee('1,905.75',reading),false);
 assert.equal(corroboratedRupee('1,904.75',{...reading,agreement:false}),false);
 for(const sample of ['($31.75)','1.2e-3','+2.25%','007','19.25¥']){
  assert.equal(isNumeric(sample),true);
  for(const character of sample)assert.ok(NUMERIC_WHITELIST.includes(character));
 }
});

test('a dark sparse mark prevents the blank-page shortcut',()=>{
 const image=new Uint8ClampedArray(600*1000*4).fill(255);
 image[20100*4]=178;
 assert.equal(rasterBlank(image),false);
});
