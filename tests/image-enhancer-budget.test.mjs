import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRestorationBudget, RestorationBudgetError } from '../assets/js/image-enhancer-budget.js';
import { estimateTileCount, tileCorePlan, isMemoryPressureError } from '../assets/js/image-enhancer-tiles.js';

const source = await readFile(new URL('../assets/js/image-enhancer.js', import.meta.url), 'utf8');
function engineClass(name, end) {
  const code = source.slice(source.indexOf(`class ${name}`), source.indexOf(end, source.indexOf(`class ${name}`)));
  return new Function('EnhancementEngine', 'createRestorationBudget', 'estimateTileCount', 'tileCorePlan', 'isMemoryPressureError', `return (${code})`)(class {}, createRestorationBudget, estimateTileCount, tileCorePlan, isMemoryPressureError);
}
const Deblur = engineClass('OnnxDeblurEngine', '\nfunction clampByte');
const SR = engineClass('OnnxSuperResolutionEngine', '\nclass OnnxDeblurEngine');

test('612 and 624 tile mobile workloads rejected before downloading a model', async () => {
  for (const [width, height, total] of [[4352, 2304, 612], [3328, 3072, 624]]) {
    assert.equal(estimateTileCount(width, height, 128), total);
    const engine = new Deblur(null, {isMobile: true}, null);
    let initialized = false;
    engine.initialize = async () => { initialized = true; };
    await assert.rejects(engine.process({ image: {width, height} }), RestorationBudgetError);
    assert.equal(initialized, false);
  }
});
test('small deblur still reaches actual tiled engine with a shared budget', async () => {
  const engine = new Deblur(null, {isMobile: true}, null);
  engine.initialize = async () => {};
  engine.processTiled = async (image, core, signal, progress, retry, budget) => {
    assert.equal(core, 128); budget.check(4); return 'inference';
  };
  assert.equal(await engine.process({image:{width:256,height:256}}), 'inference');
});
test('projection stops a slow 48-tile workload after two completed samples', () => {
  let time = 0;
  const budget = createRestorationBudget({isMobile:true}, () => time);
  budget.check(48); time = 1200; budget.check(48, 1);
  time = 2200; assert.throws(() => budget.check(48, 2), RestorationBudgetError);
});
test('fast workload admitted; fully completed result never discarded for lateness', () => {
  let time = 0;
  const budget = createRestorationBudget({isMobile:true}, () => time);
  time = 100; budget.check(48, 2);
  time = 22000; budget.check(48, 48);
});
test('elapsed budget applies even to first slow tile and cannot be retried as memory pressure', () => {
  let time = 0;
  const budget = createRestorationBudget({isMobile:true}, () => time);
  time = 21000;
  assert.throws(() => budget.check(8, 1), RestorationBudgetError);
  assert.equal(isMemoryPressureError(new RestorationBudgetError()), false);
});
test('invalid plans fail; mobile and desktop ceilings differ', () => {
  for(const total of [NaN, Infinity, -1, 0, 1.2, 65]) assert.throws(() => createRestorationBudget({isMobile:true}).check(total));
  createRestorationBudget({isMobile:true}).check(64);
  createRestorationBudget({isMobile:false}).check(256);
});
test('existing upscale keeps its path; 1x enhancement receives a budget', async () => {
  for (const scale of [1,2,4]) {
    const engine = new SR(null,{isMobile:true,workers:true},{available:true});
    engine.initialize = async () => {};
    engine.processTiled = async args => { assert.equal(!!args.budget, scale === 1); return 'ai'; };
    assert.equal(await engine.process({image:{width:256,height:256},scale,width:256*scale,height:256*scale}), 'ai');
  }
});

const {canRefineLocally} = await import('../assets/js/image-enhancer-routing.js');
test('clear-photo shortcut requires clean diagnosis, not the selected label alone', () => {
  const clean = {diagnosis:{confidence:{blur:0.1,noise:0.1,compression:0.1,underexposure:0,overexposure:0,lowResolution:0,falseResolution:0,badLighting:0}}, softness:0.1, recoveryScore:0.1};
  assert.equal(canRefineLocally('high-fidelity', clean), true);
  for (const damage of ['noise','compression','underexposure','overexposure','lowResolution']) {
    assert.equal(canRefineLocally('high-fidelity',{...clean,diagnosis:{confidence:{...clean.diagnosis.confidence,[damage]:0.8}}}),false);
  }
  assert.equal(canRefineLocally('high-fidelity',null),false);
  assert.equal(canRefineLocally('high-fidelity',{...clean,likelyBlurred:true}),false);
  assert.equal(canRefineLocally('high-fidelity',clean,2),false);
  assert.equal(canRefineLocally('portrait',clean),false);
});
