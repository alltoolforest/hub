import assert from 'node:assert/strict';
import {EFFECT,transactionStructuralEffect,buildTransactionDependencyGraph,downstreamStructuralDependencies,assertMoveDependencySafety,validateDependencySession} from '../src/transaction-dependency-graph.js';
const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const insert=(id,page=0)=>({id,kind:'INSERT_TEXT',pageIndex:page,replacementUnicode:id});
const deletion=(id,page=0)=>({id,kind:'REPLACE_TEXT',pageIndex:page,originalUnicode:'old',replacementUnicode:'',block:{text:'old'}});
const replace=(id,page=0)=>({id,kind:'REPLACE_TEXT',pageIndex:page,originalUnicode:'old',replacementUnicode:'new',block:{text:'old'}});

test('effects classify grow shrink and neutral replacements',()=>{assert.equal(transactionStructuralEffect(insert('a')),EFFECT.GROW);assert.equal(transactionStructuralEffect(deletion('d')),EFFECT.SHRINK);assert.equal(transactionStructuralEffect(replace('r')),EFFECT.NONE);});
test('later structural transactions depend on prior same-page structural edits',()=>{const g=buildTransactionDependencyGraph([insert('a'),replace('r'),insert('b'),insert('x',1)]);assert.deepEqual(g.byId.get('b').dependsOn,['a']);assert.deepEqual(g.byId.get('x').dependsOn,[]);});
test('downstream query ignores neutral and other-page edits',()=>{const deps=downstreamStructuralDependencies([insert('a'),replace('r'),insert('x',1),insert('b')],'a');assert.deepEqual(deps.map(n=>n.id),['b']);});
test('move fails closed when a later deletion depends on geometry',()=>{assert.throws(()=>assertMoveDependencySafety([insert('a'),deletion('d')],'a'),e=>e?.code==='MOVE_DEPENDENCY_CONTRACTION_UNSAFE');});
test('same-page grow plus shrink session is identified before export',()=>{const result=validateDependencySession([insert('a'),deletion('d')]);assert.equal(result.ok,false);assert.equal(result.conflicts[0].code,'MIXED_GROW_SHRINK_SAME_PAGE_UNSUPPORTED');});
test('grow and shrink on different pages are independently safe',()=>{assert.equal(validateDependencySession([insert('a',0),deletion('d',2)]).ok,true);});
console.log(`PASS ${cases.length}/${cases.length}`);for(const name of cases)console.log(`✓ ${name}`);
