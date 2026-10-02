import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const DNG = Buffer.from('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', 'base64');
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
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
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
});
await new Promise(resolveListen => server.listen(4184, '127.0.0.1', resolveListen));

async function outputDims(page) {
  return page.evaluate(async () => {
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!link) return null;
    const blob = await (await fetch(link.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const result = [bitmap.width, bitmap.height, blob.type, link.download];
    bitmap.close();
    return result;
  });
}

async function run(name, launcher) {
  const browser = await launcher.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:4184/images/enhance/', { waitUntil: 'networkidle', timeout: 90000 });
    const accept = await page.locator('input[type=file]').getAttribute('accept');
    for (const ext of ['.cr2','.cr3','.nef','.arw','.dng','.raf','.orf','.rw2']) {
      assert.ok(accept?.includes(ext), `${name}: RAW accept list must include ${ext}`);
    }
    await page.locator('input[type=file]').setInputFiles({
      name: 'fixture.dng',
      mimeType: 'image/x-adobe-dng',
      buffer: DNG
    });
    await page.waitForFunction(() => {
      const text = document.querySelector('#enhancer-source-info')?.textContent || '';
      return text.includes('256 × 168');
    }, null, { timeout: 120000 });

    await page.locator('#enhancer-mode-enhance').click();
    await page.locator('#enhancer-content').selectOption('text-logo');
    await page.locator('#enhancer-restoration').selectOption('fidelity');
    await page.locator('#enhancer-sharpen').selectOption('low');
    await page.locator('#enhancer-run').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#status')?.textContent || '';
      return !!document.querySelector('#downloads a[download]') && status.includes('Enhanced · original size');
    }, null, { timeout: 120000 });

    const dims = await outputDims(page);
    assert.deepEqual(dims?.slice(0, 3), [256, 168, 'image/png']);
    assert.match(dims?.[3] || '', /-enhanced\.png$/);
    assert.equal(errors.length, 0, `${name} RAW console errors:\n${errors.join('\n')}`);
    console.log(`PASS ${name}: DNG decoded locally and entered Enhance pipeline at 256×168.`);
  } finally {
    await browser.close();
  }
}

try {
  await run('chrome', chromium);
  await run('firefox', firefox);
  await run('webkit', webkit);
  console.log('PASS: camera RAW DNG decode works in Chrome, Firefox and WebKit without COOP/COEP.');
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}
