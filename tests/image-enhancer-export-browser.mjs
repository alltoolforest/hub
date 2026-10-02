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
function transparentPng(width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 4;
      raw[p] = 220;
      raw[p + 1] = 40;
      raw[p + 2] = 80;
      raw[p + 3] = x < Math.ceil(width / 2) ? 0 : 255;
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
await new Promise(resolveListen => server.listen(4176, '127.0.0.1', resolveListen));

const launchOptions = { headless: true, args: ['--disable-gpu'] };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

async function exportInfo() {
  return page.evaluate(async () => {
    const link = [...document.querySelectorAll('#enhancer-export-downloads a[download]')].at(-1);
    if (!link) return null;
    const blob = await (await fetch(link.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    const result = {
      type: blob.type,
      width: bitmap.width,
      height: bitmap.height,
      name: link.download,
      size: blob.size,
      rgba: [...pixel]
    };
    bitmap.close();
    return result;
  });
}

async function createExport(format, quality, background) {
  await page.locator('#enhancer-export-format').selectOption(format);
  if (quality != null) await page.locator('#enhancer-export-quality').fill(String(quality));
  if (background) await page.locator('#enhancer-jpeg-background').fill(background);
  await page.getByRole('button', { name: 'Create export copy' }).click();
  await page.waitForFunction(() => document.querySelector('#enhancer-export-downloads a[download]'));
  return exportInfo();
}

try {
  await page.goto('http://127.0.0.1:4176/images/enhance/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhancer-export-panel', { state: 'attached' });
  await page.waitForSelector('#enhancer-export-format', { state: 'attached' });

  assert.equal(await page.locator('#enhancer-export-panel').isHidden(), true, 'Export settings must stay hidden until a processed result exists.');
  assert.equal(await page.locator('#enhancer-export-format').inputValue(), 'png');
  assert.equal(await page.locator('#enhancer-export-panel button').filter({ hasText: 'Create export copy' }).isDisabled(), true);
  assert.equal(await page.locator('#enhancer-export-quality').evaluate(node => node.closest('.field').hidden), true);
  assert.equal(await page.locator('#enhancer-jpeg-background').evaluate(node => node.closest('.field').hidden), true);

  await page.locator('input[type=file]').setInputFiles({
    name: 'export-alpha.png', mimeType: 'image/png', buffer: transparentPng(24, 16)
  });
  await page.waitForFunction(() => (document.querySelector('#enhancer-source-info')?.textContent || '').includes('24 × 16'));

  assert.equal(await page.locator('#enhancer-export-panel').isHidden(), true);

  await page.locator('#enhancer-mode-upscale').click();
  await page.locator('#enhancer-scale').selectOption('2');
  await page.locator('#enhancer-run').click();
  await page.waitForSelector('#downloads a[download]');
  await page.waitForFunction(() => document.querySelector('#enhancer-export-panel')?.hidden === false);
  assert.equal(await page.getByRole('button', { name: 'Create export copy' }).isDisabled(), false);

  const pngResult = await createExport('png');
  assert.equal(pngResult.type, 'image/png');
  assert.deepEqual([pngResult.width, pngResult.height], [48, 32]);
  assert.match(pngResult.name, /\.png$/i);
  assert.equal(pngResult.rgba[3], 0, 'PNG export must preserve transparent source pixels.');
  assert.match((await page.locator('#enhancer-export-info').textContent()) || '', /PNG copy ready/);
  assert.equal(await page.locator('#enhancer-export-quality').evaluate(node => node.closest('.field').hidden), true);

  await page.locator('#enhancer-export-format').selectOption('webp');
  assert.equal(await page.locator('#enhancer-export-quality').evaluate(node => node.closest('.field').hidden), false);
  assert.equal(await page.locator('#enhancer-jpeg-background').evaluate(node => node.closest('.field').hidden), true);
  await page.locator('#enhancer-export-quality').fill('75');
  assert.match((await page.locator('#enhancer-export-info').textContent()) || '', /75% quality/);
  await page.getByRole('button', { name: 'Create export copy' }).click();
  await page.waitForFunction(() => document.querySelector('#enhancer-export-downloads a[download]')?.download.endsWith('.webp'));
  const webpResult = await exportInfo();
  assert.equal(webpResult.type, 'image/webp');
  assert.deepEqual([webpResult.width, webpResult.height], [48, 32]);
  assert.match(webpResult.name, /\.webp$/i);
  assert.equal(webpResult.rgba[3], 0, 'WebP export must preserve transparency.');

  await page.locator('#enhancer-export-format').selectOption('jpeg');
  assert.equal(await page.locator('#enhancer-export-quality').evaluate(node => node.closest('.field').hidden), false);
  assert.equal(await page.locator('#enhancer-jpeg-background').evaluate(node => node.closest('.field').hidden), false);
  await page.locator('#enhancer-export-quality').fill('80');
  await page.locator('#enhancer-jpeg-background').fill('#00ff00');
  assert.match((await page.locator('#enhancer-export-info').textContent()) || '', /flattened onto #00FF00/);
  await page.getByRole('button', { name: 'Create export copy' }).click();
  await page.waitForFunction(() => document.querySelector('#enhancer-export-downloads a[download]')?.download.endsWith('.jpg'));
  const jpgResult = await exportInfo();
  assert.equal(jpgResult.type, 'image/jpeg');
  assert.deepEqual([jpgResult.width, jpgResult.height], [48, 32]);
  assert.match(jpgResult.name, /\.jpg$/i);
  assert.equal(jpgResult.rgba[3], 255, 'JPG export must be opaque.');
  assert.ok(jpgResult.rgba[1] > 170 && jpgResult.rgba[0] < 100 && jpgResult.rgba[2] < 100,
    `Transparent pixel should be flattened near green; got ${jpgResult.rgba.join(',')}`);
  assert.match((await page.locator('#enhancer-export-info').textContent()) || '', /Transparency flattened onto #00FF00/);

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#downloads a[download]') === null);
  assert.equal(await page.locator('#enhancer-export-format').inputValue(), 'png');
  assert.equal(await page.locator('#enhancer-export-quality').inputValue(), '92');
  assert.equal((await page.locator('#enhancer-jpeg-background').inputValue()).toLowerCase(), '#ffffff');
  assert.equal(await page.locator('#enhancer-export-downloads a[download]').count(), 0);
  assert.equal(await page.locator('#enhancer-export-panel button').filter({ hasText: 'Create export copy' }).isDisabled(), true);
  assert.equal(await page.locator('#enhancer-export-panel').isHidden(), true, 'Reset must hide the export panel again.');

  assert.equal(consoleErrors.length, 0, `Browser console errors:\n${consoleErrors.join('\n')}`);
  console.log('PASS: PNG/JPG/WebP export, lossy quality controls, transparency preservation, JPEG flattening and reset behavior verified.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
