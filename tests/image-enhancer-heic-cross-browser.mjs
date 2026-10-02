import { firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const FIXTURE_URL = 'https://raw.githubusercontent.com/alexcorvi/heic2any/169513b18329dbcb4dd5f86550aac6e975f0acf9/demo/1.heic';
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'], ['.js','text/javascript; charset=utf-8'], ['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'], ['.css','text/css; charset=utf-8'], ['.svg','image/svg+xml'],
  ['.png','image/png'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'], ['.webp','image/webp'], ['.wasm','application/wasm']
]);

const fixtureResponse = await fetch(FIXTURE_URL, { redirect: 'follow' });
assert.equal(fixtureResponse.ok, true, `Pinned HEIC fixture fetch failed: ${fixtureResponse.status}`);
const fixture = Buffer.from(await fixtureResponse.arrayBuffer());
assert.ok(fixture.length > 1024, 'Pinned HEIC fixture is unexpectedly small.');

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
await new Promise(resolveListen => server.listen(4182, '127.0.0.1', resolveListen));

async function auditEngine(name, engine) {
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:4182/images/enhance/', { waitUntil: 'networkidle' });
    await page.locator('input[type=file]').setInputFiles({ name: `${name}.heic`, mimeType: 'image/heic', buffer: fixture });
    await page.waitForFunction(() => {
      const summary = document.querySelector('#enhancer-source-info')?.textContent || '';
      return summary.includes('1,440 × 960') || summary.includes('1440 × 960');
    }, null, { timeout: 60000 });

    await page.locator('#enhancer-mode-enhance').click();
    await page.locator('#enhancer-content').selectOption('text-logo');
    await page.locator('#enhancer-run').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#status')?.textContent || '';
      return !!document.querySelector('#downloads a[download]') &&
        (status.includes('1,440 × 960 pixels') || status.includes('1440 × 960 pixels')) &&
        status.includes('Local quality enhancement');
    }, null, { timeout: 60000 });

    const filename = await page.locator('#downloads a[download]').getAttribute('download');
    assert.match(filename || '', /-enhanced\.png$/);
    assert.equal(errors.length, 0, `${name} HEIC console errors:\n${errors.join('\n')}`);
    console.log(`PASS: ${name} real HEIC decode + canonical 1× processing under production CSP.`);
  } finally {
    await browser.close();
  }
}

try {
  await auditEngine('Firefox', firefox);
  await auditEngine('WebKit', webkit);
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}
