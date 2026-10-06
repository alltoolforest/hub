import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from './summarize.mjs';
test('excluded numerical failures cannot be reported as cleanup wins or losses', () => {
  const path = (mae, numericalAdmission = 'accepted') => ({route: 'test', stages: [
    {name: 'raw-deblur', numericalAdmission}, {name: 'final-guard', mae},
  ]});
  const result = summarize([
    {id: 'bad-cleanup', paths: [path(10), path(1, 'rejected:unstable')]},
    {id: 'bad-direct', paths: [path(10, 'rejected:unstable'), path(1)]},
    {id: 'better', paths: [path(10), path(9)]},
    {id: 'worse', paths: [path(10), path(11)]},
    {id: 'tie', paths: [path(10), path(10)]},
  ]);
  assert.equal(result.comparisons, 5);
  assert.equal(result.rejectedPaths.length, 2);
  assert.equal(result.admittedPairs, 3);
  assert.equal(result.cleanupBetter, 1);
  assert.equal(result.cleanupWorse, 1);
  assert.equal(result.cleanupTie, 1);
});
