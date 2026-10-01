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
function png(width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 4;
      raw[p] = (x * 13 + y * 5) & 255;
      raw[p + 1] = (x * 7 + y * 11) & 255;
      raw[p + 2] = (x * 17 + y * 3) & 255;
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
await new Promise(resolveListen => server.listen(4174, '127.0.0.1', resolveListen));

const launchOptions = { headless: true, args: ['--disable-gpu'] };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

async function outputDimensions() {
  return page.evaluate(async () => {
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!link) return null;
    const bmp = await createImageBitmap(await (await fetch(link.href)).blob());
    const result = [bmp.width, bmp.height, link.download];
    bmp.close();
    return result;
  });
}

async function runStandardTarget(expectedWidth, expectedHeight) {
  await page.locator('#enhancer-content').selectOption('text-logo');
  await page.getByRole('button', { name: 'Enhance image' }).click();
  await page.waitForFunction(([w, h]) => {
    const status = document.querySelector('#status')?.textContent || '';
    const link = document.querySelector('#downloads a[download]');
    return !!link && status.includes(`${w.toLocaleString()} × ${h.toLocaleString()} pixels`) && status.includes('Standard high-quality enlargement');
  }, [expectedWidth, expectedHeight], { timeout: 30000 });
  const dims = await outputDimensions();
  assert.deepEqual(dims?.slice(0, 2), [expectedWidth, expectedHeight]);
  return dims;
}

try {
  await page.goto('http://127.0.0.1:4174/images/enhance/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhancer-output-mode');
  await page.waitForSelector('#enhancer-scale');

  assert.equal(await page.locator('#enhancer-output-mode').inputValue(), 'scale');
  assert.equal(await page.locator('#enhancer-scale').inputValue(), '2');

  await page.locator('input[type=file]').setInputFiles({ name: 'planner-test.png', mimeType: 'image/png', buffer: png(24, 16) });
  await page.waitForFunction(() => (document.querySelector('#enhancer-source-info')?.textContent || '').includes('24 × 16'));
  await page.waitForFunction(() => (document.querySelector('#enhancer-output-info')?.textContent || '').includes('48 × 32'));

  await page.locator('#enhancer-output-mode').selectOption('dimensions');
  await page.locator('#enhancer-target-width').fill('60');
  await page.locator('#enhancer-target-height').fill('');
  await page.waitForFunction(() => (document.querySelector('#enhancer-output-info')?.textContent || '').includes('60 × 40'));
  assert.equal(await page.locator('#enhancer-scale').evaluate(node => node.closest('.field').hidden), true);
  await runStandardTarget(60, 40);

  await page.locator('#enhancer-output-mode').selectOption('longest-edge');
  await page.locator('#enhancer-longest-edge').fill('72');
  await page.waitForFunction(() => (document.querySelector('#enhancer-output-info')?.textContent || '').includes('72 × 48'));
  await runStandardTarget(72, 48);

  await page.locator('#enhancer-output-mode').selectOption('print');
  await page.locator('#enhancer-print-width').fill('0.2');
  await page.locator('#enhancer-print-height').fill('');
  await page.locator('#enhancer-print-unit').selectOption('in');
  await page.locator('#enhancer-ppi').fill('300');
  await page.waitForFunction(() => {
    const text = document.querySelector('#enhancer-output-info')?.textContent || '';
    return text.includes('60 × 40') && text.includes('PPI') && text.includes('does not create detail');
  });
  await runStandardTarget(60, 40);

  const beforeInvalid = await page.locator('#downloads a[download]').count();
  await page.locator('#enhancer-output-mode').selectOption('dimensions');
  await page.locator('#enhancer-target-width').fill('99999');
  await page.locator('#enhancer-target-height').fill('');
  await page.getByRole('button', { name: 'Enhance image' }).click();
  await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('too large for the current safety limit'));
  assert.equal(await page.locator('#downloads a[download]').count(), beforeInvalid, 'Invalid oversized target must not start processing or replace the existing result.');

  await page.locator('#enhancer-target-width').fill('10');
  await page.getByRole('button', { name: 'Enhance image' }).click();
  await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('smaller than the source'));
  assert.equal(await page.locator('#downloads a[download]').count(), beforeInvalid, 'Downscale target must be rejected by the enhancer planner.');

  await page.getByRole('button', { name: 'Reset' }).click();
  assert.equal(await page.locator('#enhancer-output-mode').inputValue(), 'scale');
  assert.equal(await page.locator('#enhancer-scale').inputValue(), '2');
  assert.equal(await page.locator('#enhancer-target-width').inputValue(), '');
  assert.equal(await page.locator('#enhancer-ppi').inputValue(), '300');
  assert.equal(await page.locator('#enhancer-scale').evaluate(node => node.closest('.field').hidden), false);

  assert.equal(consoleErrors.length, 0, `Browser console errors:\n${consoleErrors.join('\n')}`);
  console.log('PASS: custom dimensions, longest-edge, print/PPI planning, safety rejection, reset and existing standard route integration verified.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
