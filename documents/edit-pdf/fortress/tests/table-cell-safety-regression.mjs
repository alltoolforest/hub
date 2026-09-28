import assert from 'node:assert/strict';
import {inferContainingTableCell,inferContainingTableCellAtPoint,replacementWidthLimit,tableCellInsertionLimits} from '../src/export/table-cell-geometry.js';
const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const textRect={left:120,right:175,bottom:500,top:514,width:55,height:14,cx:147.5,cy:507};

test('small enclosing rectangle is recognized as a table cell',()=>{
  const cell=inferContainingTableCell([{left:100,right:200,bottom:480,top:530,kind:'CELL'}],textRect,{pageWidth:595,pageHeight:842});
  assert.ok(cell);assert.equal(cell.left,100);assert.equal(cell.right,200);assert.equal(cell.confidence,'RECTANGULAR_CELL');
});

test('page-sized decorative border is not treated as a table cell',()=>{
  const cell=inferContainingTableCell([{left:10,right:585,bottom:10,top:832,kind:'CELL'}],textRect,{pageWidth:595,pageHeight:842});
  assert.equal(cell,null);
});

test('four grid boundaries infer a cell when no rectangle operator exists',()=>{
  const shapes=[
    {left:100,right:101,bottom:470,top:540,kind:'VERTICAL'},
    {left:200,right:201,bottom:470,top:540,kind:'VERTICAL'},
    {left:90,right:210,bottom:480,top:481,kind:'HORIZONTAL'},
    {left:90,right:210,bottom:530,top:531,kind:'HORIZONTAL'},
  ];
  const cell=inferContainingTableCell(shapes,textRect,{pageWidth:595,pageHeight:842});
  assert.ok(cell);assert.equal(cell.confidence,'GRID_BOUNDARIES');assert.ok(cell.right>199&&cell.left<102);
});

test('cell-aware replacement width stops before right border',()=>{
  const block={bounds:{x:120,y:500,width:55,height:14},lines:[{minX:120,maxX:175}],tableCell:{left:100,right:200,bottom:480,top:530,padding:3}};
  const result=replacementWidthLimit(block,0,55);
  assert.equal(result.cellAware,true);assert.equal(result.limit,77);assert.equal(result.reason,'TABLE_CELL_WIDTH_OVERFLOW');
});

test('ordinary text keeps existing visual overflow policy',()=>{
  const block={bounds:{x:120,y:500,width:55,height:14},lines:[{minX:120,maxX:175}]};
  const result=replacementWidthLimit(block,0,55,{maxVisualOverflow:1.12});
  assert.equal(result.cellAware,false);assert.ok(Math.abs(result.limit-61.6)<.001);
});

test('Add Text point inside a cell inherits that cell boundary',()=>{
  const shapes=[{left:100,right:220,bottom:470,top:540,kind:'CELL'}];
  const cell=inferContainingTableCellAtPoint(shapes,{x:125,y:505},{pageWidth:595,pageHeight:842});
  assert.ok(cell);assert.equal(cell.left,100);assert.equal(cell.right,220);
});

test('short Add Text fits entirely inside a detected cell',()=>{
  const cell={left:100,right:220,bottom:470,top:540,padding:3};
  const result=tableCellInsertionLimits(cell,{x:125,y:505,fontSize:11,lineHeight:13.2,lineCount:2,minWidth:40});
  assert.equal(result.ok,true);assert.equal(result.cellAware,true);assert.ok(result.availableWidth>80);
});

test('multiline Add Text that crosses the row boundary is refused',()=>{
  const cell={left:100,right:220,bottom:480,top:520,padding:3};
  const result=tableCellInsertionLimits(cell,{x:125,y:505,fontSize:11,lineHeight:13.2,lineCount:4,minWidth:40});
  assert.equal(result.ok,false);assert.equal(result.reason,'TABLE_CELL_INSERT_BOTTOM_OVERFLOW');
});

console.log(`PASS ${cases.length}/${cases.length}`);for(const name of cases)console.log(`✓ ${name}`);
