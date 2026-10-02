import { chromium } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const FIXTURE_URL = 'https://raw.githubusercontent.com/alexcorvi/heic2any/169513b18329dbcb4dd5f86550aac6e975f0acf9/demo/1.heic';
const DECODER_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/csp/heic-to.js';
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://cdn.jsdelivr.net blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";

const fixtureResponse = await fetch(FIXTURE_URL, { redirect: 'follow' });
assert.equal(fixtureResponse.ok, true, `Pinned HEIC fixture fetch failed: ${fixtureResponse.status}`);
const fixture = Buffer.from(await fixtureResponse.arrayBuffer());
assert.ok(fixture.length > 1024, 'Pinned HEIC fixture is unexpectedly small.');

const server = createServer((req, res) => {
  if (req.url === '/fixture.heic') {
    res.writeHead(200, { 'content-type': 'image/heic', 'content-length': fixture.length, 'cache-control': 'no-store' });
    res.end(fixture);
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store'
  });
  res.end('<!doctype html><meta charset="utf-8"><title>HEIC candidate audit</title><main>HEIC candidate audit</main>');
});
await new Promise(resolve => server.listen(4181, '127.0.0.1', resolve));

const launchOptions = { headless: true, args: ['--disable-gpu'] };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

try {
  await page.goto('http://127.0.0.1:4181/', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async ({ decoderUrl }) => {
    const response = await fetch(decoderUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Candidate decoder fetch failed (${response.status}).`);
    const sourceBytes = new Uint8Array(await response.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', sourceBytes);
    const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    const source = new TextDecoder().decode(sourceBytes);
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    let mod;
    try {
      mod = await import(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    if (typeof mod.heicTo !== 'function' || typeof mod.isHeic !== 'function') {
      throw new Error(`Candidate decoder exports are invalid: ${Object.keys(mod).join(', ')}`);
    }

    const fixtureBlob = await fetch('/fixture.heic').then(r => r.blob());
    const detected = await mod.isHeic(fixtureBlob);
    if (!detected) throw new Error('Candidate decoder did not recognize the pinned HEIC fixture.');

    const started = performance.now();
    const output = await Promise.race([
      mod.heicTo({ blob: fixtureBlob, type: 'image/png', quality: 1 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Candidate HEIC decode exceeded 45 seconds.')), 45000))
    ]);
    const elapsedMs = performance.now() - started;
    if (!(output instanceof Blob)) throw new Error('Candidate decoder did not return a Blob.');
    if (output.type !== 'image/png') throw new Error(`Candidate decoder returned ${output.type || 'unknown MIME'} instead of image/png.`);
    const bitmap = await createImageBitmap(output);
    const value = {
      sha256,
      sourceBytes: sourceBytes.byteLength,
      outputBytes: output.size,
      width: bitmap.width,
      height: bitmap.height,
      elapsedMs: Math.round(elapsedMs)
    };
    bitmap.close();
    return value;
  }, { decoderUrl: DECODER_URL });

  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.sourceBytes > 1_000_000, 'Candidate decoder source size is unexpectedly small.');
  assert.ok(result.outputBytes > 0, 'Candidate decoder output is empty.');
  assert.ok(result.width > 0 && result.height > 0, 'Candidate decoder returned invalid dimensions.');
  assert.equal(consoleErrors.length, 0, `Candidate browser console errors:\n${consoleErrors.join('\n')}`);
  console.log(`PASS: heic-to 1.5.2 CSP candidate decoded real HEIC to ${result.width} × ${result.height} in ${result.elapsedMs} ms; source ${result.sourceBytes} bytes; SHA-256 ${result.sha256}.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
