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
function opaquePng(width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 4;
      raw[p] = (x * 11 + y * 3) & 255;
      raw[p + 1] = (x * 5 + y * 13) & 255;
      raw[p + 2] = (x * 17 + y * 7) & 255;
      raw[p + 3] = 255;
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
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
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

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

try {
  await page.goto('http://127.0.0.1:4173/images/enhance/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhancer-scale');
  const source = opaquePng(24, 16);
  await page.locator('input[type=file]').setInputFiles({ name: 'core-test.png', mimeType: 'image/png', buffer: source });
  await page.waitForFunction(() => document.querySelector('#enhancer-source-info')?.textContent?.includes('24 × 16'));

  await page.locator('#enhancer-scale').selectOption('1');
  await page.getByRole('button', { name: 'Enhance image' }).click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('AI super-resolution'), null, { timeout: 180000 });
  let dims = await page.evaluate(async () => {
    const a = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    const bmp = await createImageBitmap(await (await fetch(a.href)).blob());
    const result = [bmp.width, bmp.height, a.download]; bmp.close(); return result;
  });
  assert.deepEqual(dims, [24, 16, 'core-test-enhanced.png']);

  await page.locator('#enhancer-scale').selectOption('2');
  await page.getByRole('button', { name: 'Enhance image' }).click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('AI super-resolution'), null, { timeout: 180000 });
  dims = await page.evaluate(async () => {
    const a = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    const bmp = await createImageBitmap(await (await fetch(a.href)).blob());
    const result = [bmp.width, bmp.height, a.download]; bmp.close(); return result;
  });
  assert.deepEqual(dims, [48, 32, 'core-test-upscaled-2x.png']);

  assert.equal(consoleErrors.length, 0, `Browser console errors:\n${consoleErrors.join('\n')}`);
  console.log('PASS: isolated enhancer loaded; Real-ESRGAN/WASM produced valid 1x and 2x AI outputs under production CSP.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
