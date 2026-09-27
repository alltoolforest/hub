import { buildLogicalBlocks } from '../src/text/text-blocks.js';

const out=document.getElementById('results');
const item=(str,x,y,width,size=12,fontName='F1')=>({str,transform:[size,0,0,size,x,y],width,height:size,fontName});
const texts=items=>buildLogicalBlocks(items).map(block=>block.text);

const cases=[
  {
    name:'whitespace spacer cannot bridge independent cells',
    items:[item('12.34',196,500,27),item(' ',228,500,38),item('5.5-7.7',272,500,48)],
    expected:['12.34','5.5-7.7'],
  },
  {
    name:'inflated short numeric width cannot swallow next cell',
    items:[item('12.34',196,500,82),item('5.5-7.7',272,500,48)],
    expected:['12.34','5.5-7.7'],
  },
  {
    name:'ordinary adjacent text runs remain one editable line',
    items:[item('Customer Support',90,500,95),item('Channels:',188,500,50),item('Chat, Phone, Email',242,500,104)],
    expected:['Customer Support Channels: Chat, Phone, Email'],
  },
  {
    name:'three table columns remain independent on one baseline',
    items:[item('TEST',80,500,28),item('12.34',196,500,27),item('5.5-7.7',272,500,48)],
    expected:['TEST','12.34','5.5-7.7'],
  },
  {
    name:'different baselines remain separate',
    items:[item('SECTION',90,620,52),item('Content line',90,600,72)],
    expected:['SECTION','Content line'],
  },
  {
    name:'normal compact number width is not unnecessarily changed',
    items:[item('Total',90,500,28),item('2026',122,500,27)],
    expected:['Total 2026'],
  },
];

let passed=0;
for(const test of cases){
  const actual=texts(test.items);
  const ok=JSON.stringify(actual)===JSON.stringify(test.expected);
  if(ok)passed++;
  const row=document.createElement('div');
  row.className=ok?'pass':'fail';
  row.textContent=`${ok?'PASS':'FAIL'} — ${test.name}${ok?'':` | expected ${JSON.stringify(test.expected)} got ${JSON.stringify(actual)}`}`;
  out.appendChild(row);
}

document.getElementById('summary').textContent=`${passed}/${cases.length} regression cases passed`;
if(passed!==cases.length)throw new Error(`Text clustering regression failed: ${passed}/${cases.length}`);
