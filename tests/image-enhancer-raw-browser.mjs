import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const RAW_FIXTURE = process.env.RAW_FIXTURE || '/tmp/example-sony.ARW';
const RAW = await readFile(RAW_FIXTURE);
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
      name: 'fixture.ARW',
      mimeType: 'application/octet-stream',
      buffer: RAW
    });
    await page.waitForFunction(() => {
      const text = document.querySelector('#enhancer-source-info')?.textContent || '';
      return text.includes('6,240 × 4,168') || text.includes('6240 × 4168');
    }, null, { timeout: 120000 });

    const summary = (await page.locator('#enhancer-source-info').textContent()) || '';
    assert.match(summary, /6,240 × 4,168|6240 × 4168/, `${name}: decoded RAW dimensions must be 6240×4168. Summary: ${summary}`);
    assert.match(summary, /background AI ready|standard fallback only/);
    await page.locator('#enhancer-mode-enhance').click();
    assert.equal(await page.locator('#enhancer-run').isDisabled(), false, `${name}: decoded RAW must enter the normal Enhance pipeline.`);
    assert.equal(errors.length, 0, `${name} RAW console errors:\n${errors.join('\n')}`);
    console.log(`PASS ${name}: real Sony ARW decoded locally at 6240×4168 and entered the Enhance pipeline.`);
  } finally {
    await browser.close();
  }
}

try {
  await run('chrome', chromium);
  await run('firefox', firefox);
  await run('webkit', webkit);
  console.log('PASS: real high-resolution camera RAW decode works in Chrome, Firefox and WebKit without COOP/COEP.');
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}
