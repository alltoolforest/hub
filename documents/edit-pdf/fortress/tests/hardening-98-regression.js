import { inferSourceFontTraits, isCoverageFailure } from '../src/fonts/font-fallback-policy.js';
import { deletedVisualLineCount, expandDeletionCompactionTransactions } from '../src/export/deletion-compaction-plan.js';
import { validateDependencySession, assertMoveDependencySafety } from '../src/transaction-dependency-graph.js';
import { resolveListSemanticUnit, listRunKey } from '../src/export/list-semantic-units.js';
import { assessVisualGeometry, compareVisualGeometry } from '../src/export/visual-geometry-validator.js';

function fail(message){throw new Error(message||'Assertion failed');}
function assert(condition,message){if(!condition)fail(message);}
function equal(actual,expected,message){if(actual!==expected)fail(`${message||'Values differ'}: expected ${expected}, got ${actual}`);}
function same(actual,expected,message){if(JSON.stringify(actual)!==JSON.stringify(expected))fail(`${message||'Values differ'}\nexpected ${JSON.stringify(expected)}\nactual ${JSON.stringify(actual)}`);}
function run(text,x,y,{size=11,advance=8,index=0}={}){return {text,x,y,fontSize:size,advance,operatorIndex:index,streamIndex:0};}
function insert(id,pageIndex=0){return {id,kind:'INSERT_TEXT',pageIndex,replacementUnicode:id};}
function deletion(id,pageIndex=0,lines=1){return {id,kind:'REPLACE_TEXT',pageIndex,originalUnicode:'old',replacementUnicode:'',block:{id:`b-${id}`,text:'old',fontSize:11,bounds:{x:80,y:500,width:300,height:lines*14},lines:Array.from({length:lines},(_,i)=>({text:`line ${i+1}`,y:600-i*14,minX:80,maxX:360,fontSize:11}))}};}
function rect(text,left,top,right,bottom,baseline=(top+bottom)/2){return {text,left,top,right,bottom,baseline,angle:0};}

export function runHardening98Regressions(){
  const cases=[];
  const test=(name,fn)=>{fn();cases.push({name,ok:true});};

  test('T98-FONT-01 Cambria subset keeps serif/bold fallback traits',()=>{
    const traits=inferSourceFontTraits({fontName:'ABCDEF+Cambria-Bold'});equal(traits.family,'serif');equal(traits.bold,true);
  });
  test('T98-FONT-02 glyph coverage failures are explicit',()=>{
    equal(isCoverageFailure('CHARACTER_NOT_AVAILABLE_IN_FONT'),true);equal(isCoverageFailure('LAYOUT_COLLISION'),false);
  });
  test('T98-DELETE-01 wrapped deletion counts every visual line',()=>equal(deletedVisualLineCount(deletion('d',0,3)),3));
  test('T98-DELETE-02 wrapped deletion expands only for compaction',()=>{
    const expanded=expandDeletionCompactionTransactions([deletion('d',0,3)]);equal(expanded.length,3);same(expanded.map(x=>x.compactionLineIndex),[0,1,2]);
  });
  test('T98-GRAPH-01 same-page grow/shrink combination is identified',()=>{
    const result=validateDependencySession([insert('i'),deletion('d')]);equal(result.ok,false);equal(result.conflicts[0].code,'MIXED_GROW_SHRINK_SAME_PAGE_UNSUPPORTED');
  });
  test('T98-GRAPH-02 moving before later contraction fails closed',()=>{
    let code='';try{assertMoveDependencySafety([insert('i'),deletion('d')],'i');}catch(error){code=error?.code||'';}equal(code,'MOVE_DEPENDENCY_CONTRACTION_UNSAFE');
  });
  test('T98-LIST-01 wrapped bullet owns marker and continuation',()=>{
    const runs=[run('•',60,600,{index:1}),run('First line',82,600,{index:2}),run('continued',82,586,{index:3}),run('•',60,572,{index:4}),run('Next',82,572,{index:5})];
    const unit=resolveListSemanticUnit({runs,claimed:new Set([listRunKey(runs[1])]),baseline:600,left:82,size:11});assert(unit.ok);equal(unit.marker.operatorIndex,1);same(unit.continuationRuns.map(x=>x.operatorIndex),[3]);
  });
  test('T98-LIST-02 unrelated paragraph is not absorbed',()=>{
    const runs=[run('•',60,600,{index:1}),run('Bullet',82,600,{index:2}),run('Paragraph',82,548,{index:3})];
    const unit=resolveListSemanticUnit({runs,claimed:new Set([listRunKey(runs[1])]),baseline:600,left:82,size:11});assert(unit.ok);equal(unit.continuationRuns.length,0);
  });
  test('T98-VISUAL-01 normal same-baseline fragments do not collide',()=>{
    const geometry=assessVisualGeometry([rect('Hello',10,10,55,22,20),rect('world',50,10,95,22,20.1)],{width:200,height:200});equal(geometry.collisions.length,0);
  });
  test('T98-VISUAL-02 new inter-line overlap is rejected',()=>{
    const baseline=assessVisualGeometry([rect('A',10,10,100,22,20),rect('B',10,32,90,44,42)],{width:200,height:200});
    const output=assessVisualGeometry([rect('A',10,10,100,22,20),rect('B',20,16,90,28,26)],{width:200,height:200});
    const compared=compareVisualGeometry(output,baseline);equal(compared.ok,false);equal(compared.failures[0].code,'VISUAL_TEXT_COLLISION');
  });
  test('T98-VISUAL-03 duplicate overlay text is rejected',()=>{
    const baseline=assessVisualGeometry([rect('Name',10,10,80,24,21)],{width:200,height:200});
    const output=assessVisualGeometry([rect('Name',10,10,80,24,21),rect('Name',10.1,10.1,80.1,24.1,21.1)],{width:200,height:200});
    equal(compareVisualGeometry(output,baseline).failures[0].code,'VISUAL_DUPLICATE_TEXT');
  });
  test('T98-VISUAL-04 page clipping is rejected',()=>{
    const baseline=assessVisualGeometry([rect('Safe',10,10,60,22,20)],{width:200,height:200});
    const output=assessVisualGeometry([rect('Safe',10,10,60,22,20),rect('Clip',180,30,230,42,40)],{width:200,height:200});
    equal(compareVisualGeometry(output,baseline).failures[0].code,'VISUAL_TEXT_OUT_OF_BOUNDS');
  });

  return cases;
}
