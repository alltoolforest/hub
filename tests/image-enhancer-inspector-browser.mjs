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
      raw[p] = (x * 19 + y * 5) & 255;
      raw[p + 1] = (x * 3 + y * 17) & 255;
      raw[p + 2] = (x * 11 + y * 7) & 255;
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
await new Promise(resolveListen => server.listen(4175, '127.0.0.1', resolveListen));

const launchOptions = { headless: true, args: ['--disable-gpu'] };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

try {
  await page.goto('http://127.0.0.1:4175/images/enhance/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhancer-inspector', { state: 'attached' });
  assert.equal(await page.locator('#enhancer-inspector').isHidden(), true, 'Inspector must stay hidden before a result exists.');

  await page.locator('input[type=file]').setInputFiles({ name: 'inspect-test.png', mimeType: 'image/png', buffer: png(60, 40) });
  await page.waitForFunction(() => (document.querySelector('#enhancer-source-info')?.textContent || '').includes('60 × 40'));
  await page.locator('#enhancer-mode-upscale').click();
  await page.locator('#enhancer-scale').selectOption('2');
  await page.locator('#enhancer-run').click();
  await page.waitForSelector('#downloads a[download]');
  await page.waitForFunction(() => !document.querySelector('#enhancer-inspector')?.hidden);

  assert.equal(await page.locator('#enhancer-compare-split').inputValue(), '50');
  assert.equal(await page.locator('#enhancer-inspect-zoom').inputValue(), '1');
  const beforeSize = await page.locator('canvas[aria-label="Original inspection preview"]').evaluate(c => [c.width, c.height]);
  const afterSize = await page.locator('canvas[aria-label="Enhanced inspection preview"]').evaluate(c => [c.width, c.height]);
  assert.deepEqual(beforeSize, afterSize, 'Before and after inspection canvases must share synchronized display dimensions.');
  assert.ok(beforeSize[0] > 0 && beforeSize[1] > 0, 'Inspection canvases must be rendered.');

  await page.locator('#enhancer-compare-split').fill('25');
  const clip = await page.locator('canvas[aria-label="Enhanced inspection preview"]').evaluate(c => c.style.clipPath);
  assert.match(clip, /75%/, '25% split must reveal 25% of the enhanced layer.');

  await page.locator('#enhancer-inspect-zoom').fill('2');
  await page.waitForFunction(() => document.querySelector('#enhancer-compare-stage')?.style.transform.includes('scale(2)'));
  assert.equal(await page.locator('#enhancer-zoom-value').textContent(), '2×');

  const viewport = page.locator('#enhancer-compare-viewport');
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  assert.ok(box, 'Comparison viewport must be measurable.');
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.62, { steps: 4 });
  await page.mouse.up();
  const movedTransform = await page.locator('#enhancer-compare-stage').evaluate(node => node.style.transform);
  assert.doesNotMatch(movedTransform, /translate\(0px, 0px\)/, 'Dragging must pan the synchronized comparison stage.');
  assert.match(movedTransform, /scale\(2\)/, 'Panning must preserve synchronized zoom.');

  await page.getByRole('button', { name: 'Reset view' }).click();
  const resetTransform = await page.locator('#enhancer-compare-stage').evaluate(node => node.style.transform);
  assert.equal(resetTransform, 'translate(0px, 0px) scale(1)');
  assert.equal(await page.locator('#enhancer-compare-split').inputValue(), '50');

  await viewport.scrollIntoViewIfNeeded();
  const clickBox = await viewport.boundingBox();
  await page.mouse.click(clickBox.x + clickBox.width * 0.7, clickBox.y + clickBox.height * 0.35);
  await page.waitForFunction(() => (document.querySelector('#enhancer-region-info')?.textContent || '').includes('Region centre:'));
  const regionInfo = await page.locator('#enhancer-region-info').textContent();
  assert.match(regionInfo || '', /matched before\/after crop/);
  const regionBefore = await page.locator('#enhancer-region-before').evaluate(c => [c.width, c.height]);
  const regionAfter = await page.locator('#enhancer-region-after').evaluate(c => [c.width, c.height]);
  assert.deepEqual(regionBefore, [260, 180]);
  assert.deepEqual(regionAfter, [260, 180]);

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#enhancer-inspector')?.hidden === true);
  assert.equal(await page.locator('#downloads a[download]').count(), 0, 'Core reset must clear results while inspector hides cleanly.');

  assert.equal(consoleErrors.length, 0, `Browser console errors:\n${consoleErrors.join('\n')}`);
  console.log('PASS: before/after split, synchronized zoom/pan, matched region preview, reset view and core reset/hide behavior verified.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
