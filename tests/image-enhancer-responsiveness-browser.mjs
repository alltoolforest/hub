import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'], ['.js','text/javascript; charset=utf-8'], ['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'], ['.css','text/css; charset=utf-8'], ['.svg','image/svg+xml'],
  ['.png','image/png'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'], ['.webp','image/webp'], ['.wasm','application/wasm']
]);

function crc32(buf) {
  let crc = 0xffffffff;
  for (const value of buf) {
    crc ^= value;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}
function png(width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 4;
      const cx = x - width * 0.5;
      const cy = y - height * 0.42;
      const face = Math.exp(-((cx * cx) / (width * width * 0.055) + (cy * cy) / (height * height * 0.08)));
      raw[p] = Math.max(0, Math.min(255, Math.round(65 + x * 0.18 + face * 105)));
      raw[p + 1] = Math.max(0, Math.min(255, Math.round(55 + y * 0.11 + face * 82)));
      raw[p + 2] = Math.max(0, Math.min(255, Math.round(75 + ((x + y) % 47) + face * 58)));
      raw[p + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

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
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
});
await new Promise(resolveListen => server.listen(4183, '127.0.0.1', resolveListen));

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1728, height: 887 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
});
const page = await context.newPage();
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', error => errors.push(error.message));

async function startHeartbeat() {
  await page.evaluate(() => {
    clearInterval(window.__enhancerResponsivenessTimer);
    window.__enhancerResponsiveness = { count: 0, maxGap: 0, last: performance.now() };
    window.__enhancerResponsivenessTimer = setInterval(() => {
      const now = performance.now();
      const state = window.__enhancerResponsiveness;
      state.maxGap = Math.max(state.maxGap, now - state.last);
      state.last = now;
      state.count++;
    }, 50);
  });
}

async function stopHeartbeat() {
  return page.evaluate(() => {
    clearInterval(window.__enhancerResponsivenessTimer);
    const state = window.__enhancerResponsiveness || { count: 0, maxGap: Infinity };
    delete window.__enhancerResponsivenessTimer;
    return state;
  });
}

async function outputInfo() {
  return page.evaluate(async () => {
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!link) return null;
    const blob = await (await fetch(link.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const result = { width: bitmap.width, height: bitmap.height, name: link.download, type: blob.type };
    bitmap.close();
    return result;
  });
}

async function waitForResult(pattern, timeout) {
  await page.waitForFunction(source => {
    const status = document.querySelector('#status')?.textContent || '';
    return !!document.querySelector('#downloads a[download]') && new RegExp(source).test(status);
  }, pattern.source, { timeout });
  return (await page.locator('#status').textContent()) || '';
}

try {
  await page.goto('http://127.0.0.1:4183/images/enhance/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('input[type=file]').setInputFiles({
    name: 'realistic-portrait.png',
    mimeType: 'image/png',
    buffer: png(452, 678)
  });
  await page.waitForFunction(() => (document.querySelector('#enhancer-source-info')?.textContent || '').includes('452 × 678'));

  await page.locator('#enhancer-mode-enhance').click();
  assert.equal(await page.getByLabel('Photo type').isVisible(), true);
  assert.equal(await page.getByLabel('Enhancement strength').isVisible(), true);
  assert.equal(await page.getByLabel('Sharpness').isVisible(), true);
  const enhancePanelText = await page.locator('.fields').first().textContent();
  assert.doesNotMatch(enhancePanelText || '', /Fidelity|Recovery|reconstruction|quality-aware/i, 'Enhance controls must use simple user-facing language.');

  await startHeartbeat();
  await page.locator('#enhancer-run').click();
  const enhanceStatus = await waitForResult(/Enhanced · original size/, 180000);
  const enhancePulse = await stopHeartbeat();
  const enhanced = await outputInfo();
  assert.deepEqual([enhanced?.width, enhanced?.height, enhanced?.type], [452, 678, 'image/png']);
  assert.match(enhanced?.name || '', /-enhanced\.png$/);
  assert.match(enhanceStatus, /photographic tone/);
  assert.ok(enhancePulse.count >= 5, `Enhance heartbeat too low: ${JSON.stringify(enhancePulse)}`);
  assert.ok(enhancePulse.maxGap < 3000, `Enhance blocked the page too long: ${JSON.stringify(enhancePulse)}`);

  await page.locator('#enhancer-mode-upscale').click();
  await page.locator('#enhancer-scale').selectOption('4');
  await startHeartbeat();
  await page.locator('#enhancer-run').click();
  const upscaleStatus = await waitForResult(/Upscaled 4×/, 300000);
  const upscalePulse = await stopHeartbeat();
  const upscaled = await outputInfo();
  assert.deepEqual([upscaled?.width, upscaled?.height, upscaled?.type], [1808, 2712, 'image/png']);
  assert.match(upscaled?.name || '', /-upscaled-4x\.png$/);
  assert.match(upscaleStatus, /background AI/);
  assert.ok(upscalePulse.count >= 10, `4× heartbeat too low: ${JSON.stringify(upscalePulse)}`);
  assert.ok(upscalePulse.maxGap < 3000, `4× upscale blocked the page too long: ${JSON.stringify(upscalePulse)}`);

  assert.equal(await page.evaluate(() => window.ort?.env?.wasm?.proxy), true, 'Production desktop Chrome must use worker-backed WASM.');
  assert.equal(errors.length, 0, `Desktop responsiveness console errors:\n${errors.join('\n')}`);
  console.log(`PASS: realistic 452×678 Enhance and 1808×2712 4× Upscale remained responsive. Enhance maxGap=${enhancePulse.maxGap.toFixed(0)}ms, Upscale maxGap=${upscalePulse.maxGap.toFixed(0)}ms.`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
