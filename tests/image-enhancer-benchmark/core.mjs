import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, isAbsolute } from 'node:path';
export const BASELINE = '92d05302002e12924fab766b784cda2ea97d3f37';
export const COHORTS = ['defocus','motion','pixelation','jpeg','old-damage','old-faded','low-light','overexposure','grayscale','clean'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateManifest(manifest) {
  const errors = [], blockers = [], ids = new Set(), groups = new Set(), hashes = new Set();
  const sources = manifest.sources || [];
  if (manifest.version !== 1) errors.push('Unsupported manifest version');
  const counts = Object.fromEntries(COHORTS.map(c => [c, { development: 0, heldout: 0 }]));
  let portraits = 0, mixed = 0, real = 0, paired = 0;
  for (const s of sources) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.id || '') || ids.has(s.id)) errors.push('Invalid/duplicate source id');
    ids.add(s.id);
    if (!s.sourceGroup || groups.has(s.sourceGroup)) errors.push(`${s.id}: duplicate/missing original group; variants cannot count as sources`);
    groups.add(s.sourceGroup);
    if (!/^[a-f0-9]{64}$/.test(s.sha256 || '') || hashes.has(s.sha256)) errors.push(`${s.id}: duplicate/invalid source hash`);
    hashes.add(s.sha256);
    if (!COHORTS.includes(s.cohort) || !['development','heldout'].includes(s.split)) errors.push(`${s.id}: invalid cohort/split`);
    else counts[s.cohort][s.split]++;
    if (!['mild','moderate','severe'].includes(s.severity) || !['recoverable','uncertain','unrecoverable','control'].includes(s.recoverability)) errors.push(`${s.id}: predeclared severity/recoverability missing`);
    if (!['real-damage','synthetic-paired','clean-control','grayscale-control'].includes(s.origin)) errors.push(`${s.id}: origin missing`);
    if (s.origin === 'real-damage') real++;
    if (s.origin === 'synthetic-paired') {
      paired++;
      if (!s.reference?.path || !/^[a-f0-9]{64}$/.test(s.reference?.sha256 || '') || !s.recipe?.version || !Number.isInteger(s.recipe?.seed)) errors.push(`${s.id}: paired reference/recipe/seed missing`);
    }
    if (!s.path || isAbsolute(s.path) || s.path.split(/[\\/]/).includes('..')) errors.push(`${s.id}: unsafe/missing fixture path`);
    if (s.rights?.status !== 'cleared' || !s.rights?.basis || !s.rights?.evidence || !s.rights?.reviewer || !s.rights?.reviewedAt) errors.push(`${s.id}: permission review incomplete`);
    if (!['private','redistributable'].includes(s.rights?.visibility)) errors.push(`${s.id}: visibility missing`);
    if (s.tags?.includes('portrait')) portraits++;
    if (s.tags?.includes('mixed')) mixed++;
  }
  if (sources.length !== 100) blockers.push(`Need 100 independent sources; admitted ${sources.length}`);
  for (const c of COHORTS) if (counts[c].development !== 7 || counts[c].heldout !== 3) blockers.push(`${c}: need 7 development + 3 heldout sources`);
  if (portraits < 30) blockers.push(`Need >=30 portraits; admitted ${portraits}`);
  if (mixed < 15) blockers.push(`Need >=15 mixed examples; admitted ${mixed}`);
  if (!real || !paired) blockers.push('Need both genuinely damaged and paired synthetic photographs');
  for (const tag of ['multiple-faces','hair','fabric','text-object']) if (!sources.some(s=>s.tags?.includes(tag))) blockers.push(`Missing ${tag} coverage`);
  if (manifest.diversityReview?.complete !== true || !manifest.diversityReview?.reviewer || !manifest.diversityReview?.evidence) blockers.push('Human review of skin-tone, age and content diversity outstanding');
  return { ready: !errors.length && !blockers.length, errors, blockers, counts, portraits, mixed, independentSources: sources.length };
}
export async function fixturePath(root, relative) {
  if (!relative || isAbsolute(relative)) throw new Error('Fixture paths must be relative');
  const base = await realpath(root), path = await realpath(resolve(base, relative));
  if (!path.startsWith(base + sep)) throw new Error('Fixture escapes private root');
  return path;
}
export async function validateFiles(manifest, root) {
  for (const s of manifest.sources) for (const asset of [s, ...(s.reference ? [s.reference] : [])]) {
    const path = await fixturePath(root, asset.path);
    if (sha256(await readFile(path)) !== asset.sha256) throw new Error(`Fixture hash mismatch for ${s.id}`);
  }
}
export function datasetLock(manifest, contract) {
  const validation = validateManifest(manifest);
  if (!validation.ready) throw new Error('Incomplete dataset cannot be locked');
  return { version: 1, baseline: BASELINE, manifestSha256: sha256(JSON.stringify(manifest)), contractSha256: sha256(contract) };
}
export function checkLock(manifest, contract, lock) {
  const actual = datasetLock(manifest, contract);
  if (JSON.stringify(actual) !== JSON.stringify(lock)) throw new Error('Dataset/contract changed after lock');
}
// Only a test server uses this transform. Production files remain byte-for-byte unchanged.
export function instrument(source) {
  const rules = [
    ['      const faceRegions = await resolveFaceSafety(signal, requestedContent);', '$&\n      globalThis.__enhancerBenchmark?.("original", image, { analysis });', 1],
    ['        // Preserve photographed texture/identity', '        globalThis.__enhancerBenchmark?.("model-output", result.canvas, { backend: result.backend, model: "deblur-nafnet" });\n$&', 1],
    ['      result.canvas = blendForFidelity(result.canvas, image,', '      globalThis.__enhancerBenchmark?.("model-output", result.canvas, { backend: result.backend, model: "general-x4" });\n$&', 2],
    ['        result.canvas = blended;', '$&\n        globalThis.__enhancerBenchmark?.("face-region", result.canvas);', 1],
    ["      result.canvas = await applyRegionAwarePass(result.canvas, faceRegions, 'enhance', signal);", '$&\n      globalThis.__enhancerBenchmark?.("face-region", result.canvas);', 1],
    ['result.canvas = faceGuard.canvas;', '$&\n      globalThis.__enhancerBenchmark?.("face-safety", result.canvas);', 3],
    ['result.canvas = finished.canvas;', '$&\n      globalThis.__enhancerBenchmark?.("finishing", result.canvas);', 5],
    ['      return guarded;', '      globalThis.__enhancerBenchmark?.("final-guard", guarded.canvas, { guardStages: guarded.stages, initial: guarded.initialAnalysis, final: guarded.analysis });\n$&', 1]
  ];
  for (const [needle,replacement,count] of rules) {
    const actual = source.split(needle).length-1;
    if (actual !== count) throw new Error(`Instrumentation anchor drift: ${needle} expected ${count}, found ${actual}`);
    source = source.replaceAll(needle, replacement);
  }
  return source;
}
export function reviewSummary(manifest, reviews) {
  const rows = COHORTS.map(cohort=>{
    const cases = manifest.sources.filter(s=>s.split==='heldout' && s.cohort===cohort && s.recoverability==='recoverable');
    const votes = cases.map(s=>reviews.find(r=>r.id===s.id));
    const complete = cases.length>0 && votes.every(r=>r && ['improved','tie','worse'].includes(r.verdict) && typeof r.severeFailure==='boolean' && r.reviewer);
    const improved = votes.filter(r=>r?.verdict==='improved').length;
    return { cohort, n:cases.length, improved, ties:votes.filter(r=>r?.verdict==='tie').length, worse:votes.filter(r=>r?.verdict==='worse').length, status:!complete?'not-evaluated':votes.some(r=>r.severeFailure)?'fail':improved/cases.length>=.8?'pass':'fail' };
  });
  return { cohorts:rows, note:'Usefulness only. Identity, clean/control, severe-input, colorization, reference and runtime gates require separate review; this summary never grants launch readiness.' };
}
