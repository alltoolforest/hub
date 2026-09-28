import assert from 'node:assert/strict';
import {validateReplacementLayout} from '../src/editing/collision-detector.js';

function block(text,{minX=72,maxX=190,tableCell=null}={}){
  return {
    text,
    bounds:{x:minX,width:maxX-minX},
    lines:[{text,minX,maxX,bounds:{x:minX,width:maxX-minX}}],
    sourceLines:[[]],
    tableCell,
  };
}

const heading=validateReplacementLayout(block('WORK EXPERIENCE'),'PROFESSIONAL EXPERIENCE');
assert.equal(heading.ok,true,'A bounded ALL-CAPS heading expansion in open space should be allowed.');

const body=validateReplacementLayout(block('ordinary text'),'a substantially longer ordinary body replacement');
assert.equal(body.ok,false,'Ordinary body text must keep the conservative growth guard.');
assert.equal(body.reason,'LAYOUT_COLLISION');

const cell=validateReplacementLayout(
  block('WORK EXPERIENCE',{tableCell:{left:68,right:194,bottom:700,top:730,padding:2.5}}),
  'PROFESSIONAL EXPERIENCE',
);
assert.equal(cell.ok,false,'Heading expansion must never bypass a detected table-cell boundary.');
assert.equal(cell.reason,'TABLE_CELL_WIDTH_OVERFLOW');

const excessive=validateReplacementLayout(block('WORK EXPERIENCE'),'PROFESSIONAL EXPERIENCE AND RESPONSIBILITIES OVERVIEW');
assert.equal(excessive.ok,false,'Even headings must fail closed beyond the bounded expansion allowance.');
assert.equal(excessive.reason,'LAYOUT_COLLISION');

console.log('PASS 4/4');
console.log('✓ bounded single-line heading expansion is allowed');
console.log('✓ ordinary body growth remains conservative');
console.log('✓ table-cell width remains authoritative');
console.log('✓ excessive heading growth still fails closed');
