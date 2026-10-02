import { chromium } from 'playwright';
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
await new Promise(resolveListen => server.listen(4180, '127.0.0.1', resolveListen));

const launchOptions = { headless: true, args: ['--disable-gpu'] };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

function dimensionsFromSummary(summary) {
  const match = String(summary).match(/([\d,]+) × ([\d,]+)/);
  assert.ok(match, `Decoded source dimensions missing from summary: ${summary}`);
  return [Number(match[1].replaceAll(',', '')), Number(match[2].replaceAll(',', ''))];
}

async function openFixture(name, mimeType) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType, buffer: fixture });
  await page.waitForFunction(fileName => {
    const summary = document.querySelector('#enhancer-source-info')?.textContent || '';
    const selected = document.querySelector('.selected-files')?.textContent || '';
    return (selected.includes(fileName) && /[\d,]+ × [\d,]+/.test(summary)) || selected.includes('Could not open the selected file.');
  }, name, { timeout: 30000 });

  const selected = (await page.locator('.selected-files').textContent()) || '';
  const status = (await page.locator('#status').textContent()) || '';
  if (selected.includes('Could not open the selected file.')) {
    throw new Error(`HEIC/HEIF decode failed for ${name}. UI status: ${status}. Browser errors: ${consoleErrors.join(' | ') || 'none'}`);
  }

  const summary = (await page.locator('#enhancer-source-info').textContent()) || '';
  const [width, height] = dimensionsFromSummary(summary);
  assert.ok(width > 0 && height > 0, `${name} decoded to invalid dimensions.`);
  return { width, height, summary };
}

async function processAtOneX(name, width, height) {
  const oneX = page.locator('#enhancer-scale option[value="1"]');
  assert.equal(await oneX.isDisabled(), false, `${name} fixture must fit the desktop 1× safety limit.`);
  await page.locator('#enhancer-mode-enhance').click();
  await page.locator('#enhancer-content').selectOption('text-logo');
  await page.locator('#enhancer-run').click();
  await page.waitForFunction(([w, h]) => {
    const status = document.querySelector('#status')?.textContent || '';
    return !!document.querySelector('#downloads a[download]') && status.includes(`${w.toLocaleString()} × ${h.toLocaleString()} pixels`);
  }, [width, height], { timeout: 60000 });

  const result = await page.evaluate(async () => {
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    const blob = await (await fetch(link.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const value = [bitmap.width, bitmap.height, blob.type, link.download];
    bitmap.close();
    return value;
  });
  assert.deepEqual(result.slice(0, 3), [width, height, 'image/png']);
  assert.match(result[3], /-enhanced\.png$/);
  const status = (await page.locator('#status').textContent()) || '';
  assert.match(status, /Standard high-quality enlargement\. AI deliberately not used\./);
}

try {
  await page.goto('http://127.0.0.1:4180/images/enhance/', { waitUntil: 'networkidle' });

  const heic = await openFixture('real-input.heic', 'image/heic');
  await processAtOneX('HEIC', heic.width, heic.height);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();

  const heif = await openFixture('real-input.heif', 'image/heif');
  assert.deepEqual([heif.width, heif.height], [heic.width, heic.height], 'HEIF extension must decode the same pinned HEIC container consistently.');
  await processAtOneX('HEIF', heif.width, heif.height);

  assert.equal(consoleErrors.length, 0, `HEIC/HEIF browser console errors:\n${consoleErrors.join('\n')}`);
  console.log(`PASS: real pinned HEIC/HEIF decode and 1× canonical processing verified at ${heic.width} × ${heic.height}.`);
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
