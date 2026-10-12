import test from'node:test';import assert from'node:assert/strict';import{validateFaces,facePolicy}from'../assets/js/photo-faces.js';
test('missing detector never fabricates bounds',()=>{assert.deepEqual(validateFaces(undefined,100,100),[]);assert.equal(facePolicy([]).newTextureStagesAllowed,false);});
test('multiple rectangles copied',()=>{const f=[{x:2,y:3,width:20,height:30},{x:50,y:50,width:30,height:30}],o=validateFaces(f,100,100);assert.deepEqual(o,f);assert.notEqual(o[0],f[0]);});
test('bad geometry rejected',()=>{for(const f of[{x:-1,y:0,width:10,height:10},{x:0,y:0,width:101,height:10},{x:0,y:0,width:NaN,height:10}])assert.throws(()=>validateFaces([f],100,100));assert.throws(()=>validateFaces(Array(65).fill({}),100,100));});
