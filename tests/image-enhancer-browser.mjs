import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'], ['.js','text/javascript; charset=utf-8'], ['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'], ['.css','text/css; charset=utf-8'], ['.svg','image/svg+xml'],
  ['.png','image/png'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'], ['.webp','image/webp'], ['.wasm','application/wasm']
]);

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}
function png(width, height, transparent = false) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 4;
      raw[p] = (x * 11 + y * 3) & 255;
      raw[p + 1] = (x * 5 + y * 13) & 255;
      raw[p + 2] = (x * 17 + y * 7) & 255;
      raw[p + 3] = transparent && x < Math.ceil(width / 2) ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
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
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
  }
});
await new Promise(resolveListen => server.listen(4173, '127.0.0.1', resolveListen));

const launchOptions = { headless: true, args: ['--disable-gpu'] };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
const consoleErrors = [];
const diagnostics = [];
page.on('console', msg => {
  const line = `console:${msg.type()}: ${msg.text()}`;
  if (msg.type() === 'error') consoleErrors.push(line);
  if (['error','warning'].includes(msg.type())) diagnostics.push(line);
});
page.on('pageerror', err => { consoleErrors.push(`pageerror: ${err.message}`); diagnostics.push(`pageerror: ${err.message}`); });
page.on('requestfailed', req => diagnostics.push(`requestfailed: ${req.url()} :: ${req.failure()?.errorText || 'unknown'}`));
page.on('response', res => { if (res.status() >= 400) diagnostics.push(`http ${res.status()}: ${res.url()}`); });

async function upload(name, width, height, transparent = false) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: png(width, height, transparent) });
  await page.waitForFunction(([w, h]) => document.querySelector('#enhancer-source-info')?.textContent?.includes(`${w} × ${h}`), [width, height]);
}

async function waitForTerminal(scale) {
  try {
    await page.waitForFunction(() => {
      const output = document.querySelector('#downloads a[download]');
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Enhance image');
      const text = document.querySelector('#status')?.textContent || '';
      return !!output || (!!button && !button.disabled && !/^(Downloading|Preparing|Enhancing|Encoding|Processing|AI unavailable)/.test(text));
    }, null, { timeout: 90000 });
  } catch (error) {
    const statusText = await page.locator('#status').textContent().catch(() => 'status unavailable');
    console.error(`DIAGNOSTIC scale=${scale} timeout status=${statusText}`);
    console.error(diagnostics.join('\n'));
    throw error;
  }
  return (await page.locator('#status').textContent()) || '';
}

async function latestOutputInfo() {
  return page.evaluate(async () => {
    const a = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!a) return null;
    const blob = await (await fetch(a.href)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const alpha = ctx.getImageData(0, 0, 1, 1).data[3];
    const result = [bmp.width, bmp.height, a.download, alpha];
    bmp.close();
    return result;
  });
}

async function runAiScale(scale, expected, requiredStatus = /AI super-resolution/) {
  await page.locator('#enhancer-scale').selectOption(String(scale));
  await page.getByRole('button', { name: 'Enhance image' }).click();
  const statusText = await waitForTerminal(scale);
  console.log(`DIAGNOSTIC scale=${scale} terminal status=${statusText}`);
  assert.match(statusText, requiredStatus, `Expected real AI output, got terminal status: ${statusText}\n${diagnostics.join('\n')}`);
  const info = await latestOutputInfo();
  assert.deepEqual(info?.slice(0, 3), expected);
  return { statusText, info };
}

try {
  await page.goto('http://127.0.0.1:4173/images/enhance/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhancer-scale');

  await upload('core-test.png', 24, 16);
  await runAiScale(1, [24, 16, 'core-test-enhanced.png']);
  await runAiScale(2, [48, 32, 'core-test-upscaled-2x.png']);
  await runAiScale(4, [96, 64, 'core-test-upscaled-4x.png']);

  await upload('tile-test.png', 110, 70);
  const tiled = await runAiScale(2, [220, 140, 'tile-test-upscaled-2x.png'], /AI super-resolution · 2 tiles/);
  assert.match(tiled.statusText, /wasm/);

  await upload('alpha-test.png', 24, 16, true);
  await page.locator('#enhancer-scale').selectOption('2');
  await page.getByRole('button', { name: 'Enhance image' }).click();
  const fallbackStatus = await waitForTerminal(2);
  console.log(`DIAGNOSTIC transparent terminal status=${fallbackStatus}`);
  assert.match(fallbackStatus, /Standard high-quality enlargement\. AI enhancement was not used\./);
  const alphaInfo = await latestOutputInfo();
  assert.deepEqual(alphaInfo?.slice(0, 3), [48, 32, 'alpha-test-enlarged-2x.png']);
  assert.equal(alphaInfo?.[3], 0, 'Transparent source alpha must remain transparent in fallback output.');

  assert.equal(consoleErrors.length, 0, `Browser console errors:\n${consoleErrors.join('\n')}`);
  console.log('PASS: Real-ESRGAN/WASM 1x/2x/4x, multi-tile stitching, CSP isolation and transparent fallback all verified.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
