import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cropFromPercent,cropToPercent,cropToPixels} from '../assets/js/application-prep-crop.js';

const js=readFileSync(new URL('../assets/js/application-prep.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/application-prep.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../documents/application-document-prep/index.html',import.meta.url),'utf8');

test('crop is normalized from keyboard-accessible percentage fields',()=>{
 assert.deepEqual(cropFromPercent('10','20','60','50'),{x:.1,y:.2,w:.6,h:.5});
 assert.deepEqual(cropFromPercent(0,0,100,100),{x:0,y:0,w:1,h:1});
 assert.deepEqual(cropToPixels(cropFromPercent(10,20,60,50),1000,800),
   {x:100,y:160,w:600,h:400});
});
test('invalid, empty and out-of-bounds crop values are rejected',()=>{
 for(const values of [
  ['',0,50,50],[0,'',50,50],[0,0,'',100],[0,0,100,''],
  [0,0,0,50],[0,0,100,0],[-1,0,50,50],[0,-1,50,50],
  [90,0,11,20],[0,80,30,21],[100,0,1,5],
  ['nan',1,10,10],[1,1,Infinity,5]
 ])assert.throws(()=>cropFromPercent(...values),/numeric|0–100/);
});
test('crop rounding and source size bounds are handled',()=>{
 const c={x:.1234567,y:.249991,w:.666667,h:.500012};
 const rounded=cropToPercent(c);
 assert.deepEqual(rounded,{x:12.35,y:25,w:66.67,h:50});
 const px=cropToPixels(cropFromPercent(80,80,20,20),101,51);
 assert.ok(px.x+px.w<=101&&px.y+px.h<=51);
 assert.deepEqual(cropToPercent(null),{x:0,y:0,w:100,h:100});
 assert.throws(()=>cropToPixels(cropFromPercent(0,0,.01,.01),100,100),/too small/);
});
test('workflow modes provide context without changing user values',()=>{
 for(const mode of ['photo','signature','document'])assert.match(js,new RegExp(mode+":'"));
 assert.match(js,/const updateGuidance=\(\)=>/);
 assert.match(js,/\$\('#app-workflow'\)\.addEventListener\('change',updateGuidance\)/);
 assert.doesNotMatch(js,/modeHints\[[^\]]+\]\s*=\s*read\('width'\)/);
});
test('core requirements visible while nonessential settings are progressive',()=>{
 for(const id of ['width','height','fit','format','target'])assert.match(js,new RegExp("add\\('"+id+"'"));
 assert.match(js,/const advanced=el\('details'/);
 assert.match(js,/advanced\.append\(el\('summary'/);
 assert.match(js,/advancedFields\.append\(fieldWrap\)/);
 assert.match(js,/advancedFields\.append\(check\)/);
 assert.match(js,/advanced\.append\(advancedFields\);root\.append\(advanced\)/);
 assert.match(js,/const ratio=\$\('#lock-ratio'\)/);
});
test('numeric crop has labels, actual action and shared pointer crop path',()=>{
 for(const id of ['app-crop-x','app-crop-y','app-crop-w','app-crop-h'])
   assert.match(js,new RegExp("field\\('"+id+"'"));
 assert.match(js,/action\('Apply crop values',\(\)=>applyCrop\(cropFromPercent\(/);
 assert.match(js,/action\('Use full image',/);
 assert.match(js,/applyCrop\(selection\)/);
 assert.match(js,/function applyCrop\(c\)/);
 assert.match(js,/cropToPixels\(c,image.width,image.height\)/);
 assert.match(js,/syncCropFields\(\);showSource\(\);refreshRequirements\(\)/);
});
test('new upload, clear crop and reset synchronize controls',()=>{
 assert.match(js,/resetCropFields\(\);cropPanel\.hidden=false/);
 assert.match(js,/cropHelp\.textContent='Full image selected/);
 assert.match(js,/resetCropFields\(\);refreshRequirements\(\);resultDetails\.hidden=true/);
 assert.match(js,/function syncCropFields\(\)/);
});
test('preview and completed output show source and verified result facts',()=>{
 assert.match(js,/requirements\.textContent='Source: '/);
 assert.match(js,/Actual file size is checked after export/);
 assert.match(js,/resultDetails\.textContent='Ready: '/);
 assert.match(js,/resultDetails\.textContent='Ready: single-page A4 PDF/);
 assert.match(js,/resultDetails\.hidden=false/);
 assert.match(js,/validateEncodedBlob\(blob,type,c.width,c.height,target\)/);
 assert.match(js,/validatePdfPages\(doc\)/);
});
test('CSS and HTML are tool-scoped and mobile-specific',()=>{
 assert.match(html,/assets\/css\/application-prep\.css/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/app-crop-fields/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 for(const selector of css.split('\n').filter(s=>s.includes('{')&&!s.startsWith('@')&&!s.trim().startsWith('/*'))){
   // Continuation declarations and closing braces are not selectors.
   if(selector.startsWith('body'))assert.match(selector,/body\[data-tool="application-document-prep"\]/);
 }
});
test('frozen tool processing and Task 1 data validators remain unchanged',()=>{
 assert.match(js,/import \{encodeTarget\} from '\.\/images\.js'/);
 assert.match(js,/sourcePixelLimit\(mobile\(\)\)/);
 assert.match(js,/checkPixels\(candidate.width,candidate.height,limit/);
 assert.match(js,/validateEncodedBlob\(blob,type,c.width,c.height,target\)/);
 assert.match(js,/validateEncodedBlob\(blob,'application\/pdf',c.width,c.height,target\)/);
 assert.match(js,/finally\{if\(c\)c.width=c.height=0;\}/);
});
