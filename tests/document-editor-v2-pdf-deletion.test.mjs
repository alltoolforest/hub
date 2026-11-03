import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const {PDFDocument}=globalThis.PDFLib,{applyUpwardCompaction}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/upward-compaction-v3.js');
test('upward line advance matches the actual font row despite different PDF.js document prefixes',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([300,300]);for(const [text,y]of [['Heading stays',260],['Following first row',160],['Following second row',140]])page.drawText(text,{x:40,y,size:12});
 const tx={id:'delete',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'Removed row',replacementUnicode:'',block:{text:'Removed row',fontName:'g_d999_f1',bounds:{x:40,y:177,width:110,height:13},fontSize:12,lines:[{y:180,fontSize:12,fontName:'g_d999_f1'}]}};
 const bytes=await doc.save(),result=await applyUpwardCompaction({bytes,reflowMetrics:[]},[tx]);assert.equal(result.upwardCompactionShift,20);assert.equal(result.reflowMetrics[0].flowSlices[0].dy,20);
});
test('removing one row from a multiline native block closes that row while preserving its remaining first row',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([300,300]);for(const [text,y]of [['Kept first row',200],['Following row',160]])page.drawText(text,{x:40,y,size:12});
 const tx={id:'partial',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'Kept first row\nRemoved row',replacementUnicode:'Kept first row',block:{fontName:'g_d999_f1',bounds:{x:40,y:177,width:110,height:36},fontSize:12,lines:[{y:200,minX:40,maxX:150,fontSize:12,fontName:'g_d999_f1'},{y:180,minX:40,maxX:150,fontSize:12,fontName:'g_d999_f1'}]}};
 const result=await applyUpwardCompaction({bytes:await doc.save(),reflowMetrics:[]},[tx]);assert.equal(result.upwardCompactionCount,1);assert.equal(result.upwardCompactionShift,20);
});
test('deleting a complete multiline native block releases every visual row',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([300,300]);for(const [text,y]of [['Fixed heading',270],['Following row',180]])page.drawText(text,{x:40,y,size:12});
 const tx={id:'whole',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'First removed row\nSecond removed row',replacementUnicode:'',block:{fontName:'g_d999_f1',bounds:{x:40,y:197,width:110,height:36},fontSize:12,lines:[{y:220,minX:40,maxX:150,fontSize:12,fontName:'g_d999_f1'},{y:200,minX:40,maxX:150,fontSize:12,fontName:'g_d999_f1'}]}};
 const result=await applyUpwardCompaction({bytes:await doc.save(),reflowMetrics:[]},[tx]);assert.equal(result.upwardCompactionCount,2);assert.equal(result.upwardCompactionShift,40);
});
test('explicit upward object maps retain protection against overlap with the fixed upper slice',async()=>{
 const {assertObjectLayout}=await import('../assets/js/document-editor-v2/pdf-object-layout.js'),metric={pageIndex:0,direction:'UP',mode:'SAME_PAGE_UPWARD_COMPACTION',shiftY:20,cutY:200,footerGuardTop:20,bandLeft:20,bandRight:280,flowSlices:[{sourcePageIndex:0,destinationPageIndex:0,left:20,right:280,bottom:20,top:200,dy:20}]};
 assert.throws(()=>assertObjectLayout([{id:'image',kind:'image',pageIndex:0,x:40,y:180,width:30,height:15}],{reflowMetrics:[metric]},1,1),/conflict/);
});
test('reflow graphics inspection excludes clipped-out copies inside embedded page slices',async()=>{
 const {collectGraphicsBounds}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/graphics-flow-guard.js'),O={paintFormXObjectBegin:74,paintFormXObjectEnd:75,constructPath:91,fill:22,endPath:28};
 const result=collectGraphicsBounds({fnArray:[74,91,91,75,91],argsArray:[[[1,0,0,1,0,-50],[0,0,100,100]],[22,[],[10,160,90,180]],[22,[],[10,20,90,40]],null,[22,[],[10,160,90,180]]]},O);
 assert.equal(result.ok,true);assert.deepEqual(result.boxes,[[10,-30,90,-10],[10,160,90,180]]);
});
test('explicit clipping intersects paint bounds and malformed clipping stays protected',async()=>{
 const {collectGraphicsBounds}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/graphics-flow-guard.js'),O={clip:29,constructPath:91,fill:22,endPath:28};
 assert.deepEqual(collectGraphicsBounds({fnArray:[29,91,91],argsArray:[null,[28,[],[0,0,100,100]],[22,[],[90,90,120,120]]]},O).boxes,[[90,90,100,100]]);
 assert.equal(collectGraphicsBounds({fnArray:[29,91],argsArray:[null,[28,[],null]]},O).ok,false);
});
