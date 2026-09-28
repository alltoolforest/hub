import assert from 'node:assert/strict';
import {inferContainingTableCellAtPoint,tableCellInsertionLimits} from '../src/export/table-cell-geometry.js';

// Geometry captured from the real BE PF CLAIM acceptance fixture.
// Only non-sensitive vector coordinates are retained in the public regression.
const shapes=[{left:370,right:515,bottom:487.14,top:522.14,kind:'CELL'}];
const cell=inferContainingTableCellAtPoint(shapes,{x:420,y:510},{pageWidth:595,pageHeight:842});
assert.ok(cell,'Expected the real PF Claim row cell to be detected.');
assert.equal(cell.confidence,'RECTANGULAR_CELL');

const oneLine=tableCellInsertionLimits(cell,{x:420,y:510,fontSize:9,lineHeight:10.8,lineCount:1,minWidth:40});
assert.equal(oneLine.ok,true,'A short in-cell insertion should fit.');
assert.ok(oneLine.availableWidth>90);

const threeLines=tableCellInsertionLimits(cell,{x:420,y:510,fontSize:9,lineHeight:10.8,lineCount:3,minWidth:40});
assert.equal(threeLines.ok,false,'A multiline insertion crossing the row boundary must be refused.');
assert.equal(threeLines.reason,'TABLE_CELL_INSERT_BOTTOM_OVERFLOW');

console.log('PASS 3/3');
console.log('✓ real PF Claim cell detected');
console.log('✓ short in-cell Add Text accepted');
console.log('✓ row-crossing Add Text refused');
