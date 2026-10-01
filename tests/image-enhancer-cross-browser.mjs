import { firefox, webkit } from 'playwright';
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
      raw[p] = (x * 21 + y * 3) & 255;
      raw[p + 1] = (x * 5 + y * 17) & 255;
      raw[p + 2] = (x * 11 + y * 9) & 255;
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
await new Promise(resolveListen => server.listen(4179, '127.0.0.1', resolveListen));

async function pngDimensionsFromDownload(page) {
  return page.evaluate(async () => {
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!link) return null;
    const blob = await (await fetch(link.href)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [view.getUint32(16), view.getUint32(20), blob.type, link.download];
  });
}

async function runEngine(name, launcher) {
  const browser = await launcher.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  const warnings = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:4179/images/enhance/', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForSelector('#enhancer-scale');
    await page.locator('input[type=file]').setInputFiles({ name: `${name}-ai.png`, mimeType: 'image/png', buffer: png(12, 8) });
    await page.waitForFunction(() => (document.querySelector('#enhancer-source-info')?.textContent || '').includes('12 × 8'));
    await page.locator('#enhancer-scale').selectOption('1');
    await page.locator('#enhancer-content').selectOption('high-fidelity');
    await page.locator('#enhancer-restoration').selectOption('fidelity');
    await page.locator('#enhancer-sharpen').selectOption('off');
    await page.getByRole('button', { name: 'Enhance image' }).click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#status')?.textContent || '';
      return !!document.querySelector('#downloads a[download]') && (status.includes('AI super-resolution') || status.includes('AI enhancement was not used'));
    }, null, { timeout: 180000 });
    const status = (await page.locator('#status').textContent()) || '';
    assert.match(status, /AI super-resolution/, `${name} must execute the real WASM AI path, not standard fallback. Status: ${status}\nWarnings: ${warnings.join('\n')}\nErrors: ${errors.join('\n')}`);
    assert.match(status, /wasm/, `${name} must report the WASM compatibility backend.`);
    assert.deepEqual((await pngDimensionsFromDownload(page))?.slice(0, 3), [12, 8, 'image/png']);
    assert.equal(errors.length, 0, `${name} console errors:\n${errors.join('\n')}`);
    console.log(`PASS ${name}: real Real-ESRGAN/WASM 1x enhancement under production CSP.`);
  } finally {
    await browser.close();
  }
}

try {
  await runEngine('firefox', firefox);
  await runEngine('webkit', webkit);
  console.log('PASS: Firefox and WebKit real-WASM enhancer compatibility verified.');
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}
