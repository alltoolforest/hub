import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROCESSING_SPECS } from '../assets/js/enhance-unblur-specs.js';

const enhancement = await readFile(new URL('../assets/js/enhance-unblur-enhancement-engine.js', import.meta.url), 'utf8');
const deblur = await readFile(new URL('../assets/js/enhance-unblur-deblur-engine.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../assets/js/enhance-unblur.js', import.meta.url), 'utf8');

assert.notEqual(PROCESSING_SPECS.enhancement.sourceOfTruth, PROCESSING_SPECS.deblur.sourceOfTruth);
assert.match(PROCESSING_SPECS.enhancement.sourceOfTruth, /This is retouching, not face generation/);
assert.match(PROCESSING_SPECS.deblur.sourceOfTruth, /leave that area slightly soft instead/);

assert.match(enhancement, /general-x4/);
assert.match(enhancement, /identity-preserving restoration guard/i);
assert.match(enhancement, /learnedRestorationUsed/);
assert.doesNotMatch(enhancement, /deblur-nafnet/);

assert.match(deblur, /deblur-nafnet/);
assert.doesNotMatch(deblur, /general-x4/);

assert.match(controller, /if \(mode === 'enhancement'\)/);
assert.match(controller, /enhancementEngine\.process/);
assert.match(controller, /deblurEngine\.process/);
assert.match(controller, /result\.canvas\.width !== sourceImage\.width/);
assert.doesNotMatch(controller, /images\/enhance\//);

console.log('Enhance/Unblur isolation contract: PASS');
