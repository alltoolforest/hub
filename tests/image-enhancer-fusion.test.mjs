import test from 'node:test';
import assert from 'node:assert/strict';
import { createFaceRetentionMasks, faceRetentionLimitAt, faceSafetyAiLimitAt } from '../assets/js/image-enhancer-face-safety.js';

const face = { x: 40, y: 30, width: 80, height: 100, score: 1 };
const analysis = { diagnosis: { confidence: { blur: 1 } } };

test('existing radial retention is represented by the same ceiling', () => {
  const [mask] = createFaceRetentionMasks([face], 200, 200, analysis);
  for (const [radius, opacity] of [[0, 1], [.52, .86], [.78, .44], [1, 0]]) {
    assert.ok(Math.abs(faceRetentionLimitAt(mask.cx + radius * mask.rx, mask.cy, [mask]) - (1 - .30 * opacity)) < 1e-12);
  }
});

test('fusion retains both limits without multiplying away valid reconstruction', () => {
  const masks = createFaceRetentionMasks([face], 200, 200, analysis);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const a = faceSafetyAiLimitAt(x, y, [face]);
    const b = faceRetentionLimitAt(x, y, masks);
    const fused = Math.min(a, b);
    assert.ok(fused <= a && fused <= b && fused >= a * b - 1e-12);
  }
  assert.ok(Math.min(faceSafetyAiLimitAt(80, 80, [face]), faceRetentionLimitAt(80, 80, masks)) > .60);
});

test('clipped and overlapping faces stay finite and use the stricter mask', () => {
  const clipped = { ...face, x: -20, y: -30 };
  const a = createFaceRetentionMasks([face], 200, 200, analysis);
  const b = createFaceRetentionMasks([clipped], 200, 200, analysis);
  for (let y = 0; y < 200; y += 3) for (let x = 0; x < 200; x += 3) {
    assert.equal(faceRetentionLimitAt(x, y, [...a, ...b]), Math.min(faceRetentionLimitAt(x, y, a), faceRetentionLimitAt(x, y, b)));
  }
});

test('empty and invalid masks do not change a non-face image', () => {
  assert.deepEqual(createFaceRetentionMasks([{ ...face, width: NaN }, { ...face, width: -2 }], 200, 200, analysis), []);
  assert.equal(faceRetentionLimitAt(20, 20, []), 1);
  assert.equal(faceRetentionLimitAt(199, 199, createFaceRetentionMasks([face], 200, 200, analysis)), 1);
});
