import assert from 'node:assert/strict';
import {inferSourceFontTraits,isCoverageFailure,fallbackReason} from '../src/fonts/font-fallback-policy.js';

const cases=[];
function test(name,fn){fn();cases.push(name);}

test('Cambria subset remains serif and bold',()=>{
  const traits=inferSourceFontTraits({fontName:'AAAAAA+Cambria-Bold'});
  assert.equal(traits.family,'serif');assert.equal(traits.bold,true);assert.equal(traits.italic,false);
});

test('Calibri remains sans',()=>{
  const traits=inferSourceFontTraits({sourceRuns:[{fontContext:{baseFont:'BBBBBB+Calibri'}}]});
  assert.equal(traits.family,'sans');assert.equal(traits.bold,false);
});

test('Courier remains mono italic',()=>{
  const traits=inferSourceFontTraits({fontName:'CourierNewPS-ItalicMT'});
  assert.equal(traits.family,'mono');assert.equal(traits.italic,true);
});

test('explicit formatting wins',()=>{
  const traits=inferSourceFontTraits({fontName:'Cambria'},{styleChanged:true,fontFamily:'sans',bold:true,italic:true});
  assert.deepEqual({family:traits.family,bold:traits.bold,italic:traits.italic},{family:'sans',bold:true,italic:true});
});

test('coverage failures are recognized',()=>{
  assert.equal(isCoverageFailure('CHARACTER_NOT_AVAILABLE_IN_FONT'),true);
  assert.equal(isCoverageFailure('LAYOUT_COLLISION'),false);
  assert.equal(fallbackReason({directReason:'CHARACTER_NOT_AVAILABLE_IN_FONT'}),'SOURCE_FONT_GLYPH_COVERAGE_INCOMPLETE');
});

test('font substitution blocks report explicit fallback reason',()=>{
  assert.equal(fallbackReason({directReason:null,block:{tier:'FONT_SUBSTITUTION'}}),'BLOCK_REQUIRES_FONT_SUBSTITUTION');
});

console.log(`PASS ${cases.length}/${cases.length}`);
for(const name of cases)console.log(`✓ ${name}`);
