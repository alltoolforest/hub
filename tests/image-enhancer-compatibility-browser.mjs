import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { aiInferenceDimensions, tileCorePlan } from '../assets/js/image-enhancer-tiles.js';
import { resolveContentRoute } from '../assets/js/image-enhancer-routing.js';

const ROOT = process.cwd();
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'], ['.js','text/javascript; charset=utf-8'], ['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'], ['.css','text/css; charset=utf-8'], ['.svg','image/svg+xml'],
  ['.png','image/png'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'], ['.webp','image/webp'], ['.wasm','application/wasm']
]);

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let filePath = resolve(ROOT, '.' + pathname);
    if (!(filePath === ROOT || filePath.startsWith(ROOT + sep))) throw new Error('bad path');
    let info;
    try { info = await stat(filePath); } catch { info = null; }
    if (info?.isDirectory()) filePath = resolve(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
  }
});
await new Promise(resolveListen => server.listen(4177, '127.0.0.1', resolveListen));

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);

async function installGeneratedFile(page, { type, name, width, height, transparent = false, quality = 0.9 }) {
  await page.evaluate(async ({ type, name, width, height, transparent, quality }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (!transparent) {
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = '#2255aa';
    ctx.fillRect(Math.floor(width / 2), 0, Math.ceil(width / 2), height);
    ctx.fillStyle = '#ee8844';
    ctx.fillRect(Math.floor(width / 2), Math.floor(height / 2), Math.ceil(width / 2), Math.ceil(height / 2));
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error(`Could not create ${type}`)), type, quality));
    const input = document.querySelector('input[type=file]');
    const file = new File([blob], name, { type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { type, name, width, height, transparent, quality });
  await page.waitForFunction(([w, h, fileName]) => {
    const summary = document.querySelector('#enhancer-source-info')?.textContent || '';
    const selected = document.querySelector('.selected-files')?.textContent || '';
    return summary.includes(`${w.toLocaleString()} × ${h.toLocaleString()}`) && selected.includes(fileName);
  }, [width, height, name]);
}

async function waitCanonical(page, width, height) {
  await page.waitForFunction(([w, h]) => {
    const text = document.querySelector('#status')?.textContent || '';
    return !!document.querySelector('#downloads a[download]') && text.includes(`${w.toLocaleString()} × ${h.toLocaleString()}`);
  }, [width, height], { timeout: 30000 });
  return page.evaluate(async () => {
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    const blob = await (await fetch(link.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const result = [bitmap.width, bitmap.height, link.download, blob.type];
    bitmap.close();
    return result;
  });
}

async function testDesktopFormats() {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:4177/images/enhance/', { waitUntil: 'networkidle' });
    const accept = await page.locator('input[type=file]').getAttribute('accept');
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']) assert.ok(accept?.includes(ext), `Input accept list must include ${ext}`);

    const cases = [
      { type: 'image/jpeg', name: 'compat-photo.jpg', transparent: false },
      { type: 'image/png', name: 'compat-alpha.png', transparent: true },
      { type: 'image/webp', name: 'compat-alpha.webp', transparent: true }
    ];
    for (const item of cases) {
      await installGeneratedFile(page, { ...item, width: 40, height: 30 });
      const summary = (await page.locator('#enhancer-source-info').textContent()) || '';
      assert.match(summary, /40 × 30/);
      if (item.transparent) assert.match(summary, /transparency detected/);
      else assert.doesNotMatch(summary, /transparency detected/);

      await page.locator('#enhancer-mode-upscale').click();
      await page.locator('#enhancer-scale').selectOption('2');
      await page.locator('#enhancer-run').click();
      const output = await waitCanonical(page, 80, 60);
      assert.deepEqual(output.slice(0, 2), [80, 60]);
      assert.equal(output[3], 'image/png', 'Canonical enhancer result remains PNG before optional export conversion.');
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
    }

    assert.equal(consoleErrors.length, 0, `Desktop format console errors:\n${consoleErrors.join('\n')}`);
  } finally {
    await page.close();
  }
}

async function testMobileSafety() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:4177/images/enhance/', { waitUntil: 'networkidle' });

    await installGeneratedFile(page, { type: 'image/png', name: 'mobile-ai.png', width: 480, height: 360, transparent: false });
    await page.locator('#enhancer-mode-upscale').click();
    await page.locator('#enhancer-scale').selectOption('2');
    await page.evaluate(() => {
      window.__mobileHeartbeat = 0;
      window.__mobileHeartbeatTimer = setInterval(() => { window.__mobileHeartbeat += 1; }, 25);
    });
    await page.locator('#enhancer-run').click();
    const mobileOutput = await waitCanonical(page, 960, 720);
    assert.deepEqual(mobileOutput.slice(0, 2), [960, 720]);
    const mobileStatus = (await page.locator('#status').textContent()) || '';
    assert.match(mobileStatus, /Upscaled 2× .*background AI/, `Mobile AI must use the background worker path: ${mobileStatus}`);
    const mobileHeartbeat = await page.evaluate(() => {
      clearInterval(window.__mobileHeartbeatTimer);
      return window.__mobileHeartbeat;
    });
    assert.ok(mobileHeartbeat >= 4, `Mobile AI must keep the event loop responsive; heartbeat=${mobileHeartbeat}`);
    assert.equal(await page.evaluate(() => window.ort?.env?.wasm?.proxy), true, 'Mobile AI must keep ONNX WASM proxy enabled.');

    await installGeneratedFile(page, { type: 'image/png', name: 'mobile-1mp.png', width: 1000, height: 1000, transparent: false });
    const summary = (await page.locator('#enhancer-source-info').textContent()) || '';
    assert.match(summary, /1,000 × 1,000/);

    const option2 = page.locator('#enhancer-scale option[value="2"]');
    const option4 = page.locator('#enhancer-scale option[value="4"]');
    assert.equal(await option2.isDisabled(), false, '2× mobile output must remain available.');
    assert.equal(await option4.isDisabled(), false, '4× 16 MP mobile output should be allowed by adaptive safety.');
    assert.match((await option4.textContent()) || '', /4× AI Upscale/);

    await page.locator('#enhancer-mode-upscale').click();
    await page.locator('#enhancer-output-mode').selectOption('dimensions');
    await page.locator('#enhancer-target-width').fill('5000');
    await page.locator('#enhancer-target-height').fill('');
    await page.waitForFunction(() => (document.querySelector('#enhancer-output-info')?.textContent || '').includes('too large for the current safety limit'));
    await page.locator('#enhancer-run').click();
    await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('too large for the current safety limit'));
    assert.equal(await page.locator('#downloads a[download]').count(), 0, 'Truly oversized mobile custom target must still be rejected safely.');

    await page.evaluate(() => {
      const input = document.querySelector('input[type=file]');
      const file = new File([new Uint8Array(1)], 'too-large-mobile.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { configurable: true, value: 121 * 1024 * 1024 });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('below 120 MB'));
    assert.match((await page.locator('.selected-files').textContent()) || '', /Could not open/);

    assert.equal(consoleErrors.length, 0, `Mobile safety console errors:\n${consoleErrors.join('\n')}`);
  } finally {
    await context.close();
  }
}

try {
  assert.deepEqual(tileCorePlan({ webgpu: false, isMobile: false }), [128, 96, 72, 48]);
  assert.deepEqual(tileCorePlan({ webgpu: false, isMobile: true }), [96, 72, 56, 48]);
  assert.deepEqual(tileCorePlan({ webgpu: true, isMobile: false }), [160, 112, 80, 56]);
  assert.deepEqual(aiInferenceDimensions(960, 1280, 960, 1280, 4), { width: 480, height: 640 }, 'Desktop 1× must retain at least half-resolution source detail for AI restoration.');
  assert.deepEqual(aiInferenceDimensions(960, 1280, 1920, 2560, 4), { width: 720, height: 960 }, 'Desktop 2× must retain a 75% linear source working image.');
  assert.deepEqual(aiInferenceDimensions(960, 1280, 960, 1280, 4, { isMobile: true }), { width: 384, height: 512 }, 'Mobile 1× keeps a bounded quality floor without reverting to full-source inference.');
  assert.deepEqual(aiInferenceDimensions(960, 1280, 1920, 2560, 4, { isMobile: true }), { width: 576, height: 768 }, 'Mobile 2× keeps a bounded 60% linear quality floor.');
  assert.deepEqual(aiInferenceDimensions(960, 1280, 3840, 5120, 4), { width: 960, height: 1280 });
  assert.deepEqual(aiInferenceDimensions(960, 1280, 5760, 7680, 4), { width: 960, height: 1280 }, 'AI input must never pre-enlarge beyond the source for outputs above the model native scale.');

  const softOneX = resolveContentRoute('auto', {
    falseResolution: false, lowResolution: false, recoveryScore: 0.24,
    softness: 0.50, lowDetail: 0.52, jpegArtifacts: 0.10, noise: 0.10
  }, 1, { isMobile: false, wasm: true, webgpu: false });
  assert.equal(softOneX.id, 'low-resolution', 'Soft 1× photos must not be routed to the conservative high-fidelity path.');

  const cleanPhoto = resolveContentRoute('auto', {
    falseResolution: false, lowResolution: false, recoveryScore: 0.12,
    softness: 0.16, lowDetail: 0.20, jpegArtifacts: 0.08, noise: 0.12
  }, 1, { isMobile: false, wasm: true, webgpu: false });
  assert.equal(cleanPhoto.id, 'high-fidelity', 'Genuinely clean sources should retain the conservative fidelity route.');
  await testDesktopFormats();
  await testMobileSafety();
  console.log('PASS: JPG/PNG/WebP input decoding, transparency detection, real mobile worker-backed AI, mobile responsiveness, adaptive 16 MP-class output safety, professional file-size allowance and tile plans verified.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
