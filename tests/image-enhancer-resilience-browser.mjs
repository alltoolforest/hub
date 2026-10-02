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
      raw[p + 1] = (x * 7 + y * 17) & 255;
      raw[p + 2] = (x * 19 + y * 3) & 255;
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
await new Promise(resolveListen => server.listen(4178, '127.0.0.1', resolveListen));

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);

async function upload(page, name, width = 110, height = 70) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: png(width, height) });
  await page.waitForFunction(([w, h]) => (document.querySelector('#enhancer-source-info')?.textContent || '').includes(`${w} × ${h}`), [width, height]);
}

async function waitResult(page, pattern, timeout = 90000) {
  await page.waitForFunction(source => {
    const text = document.querySelector('#status')?.textContent || '';
    return !!document.querySelector('#downloads a[download]') && new RegExp(source).test(text);
  }, pattern.source, { timeout });
  return (await page.locator('#status').textContent()) || '';
}

async function outputDimensions(page) {
  return page.evaluate(async () => {
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!link) return null;
    const bitmap = await createImageBitmap(await (await fetch(link.href)).blob());
    const result = [bitmap.width, bitmap.height, link.download];
    bitmap.close();
    return result;
  });
}

async function testDeepMemoryRetries() {
  const retryContext = await browser.newContext();
  await retryContext.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message, transfer) {
        if (message?.type === 'pack-tile' && message.width > 105) {
          throw new RangeError('out of memory two-stage worker retry test');
        }
        return super.postMessage(message, transfer);
      }
    };
  });
  const retryPage = await retryContext.newPage();
  const retryErrors = [];
  retryPage.on('console', msg => { if (msg.type() === 'error') retryErrors.push(msg.text()); });
  retryPage.on('pageerror', err => retryErrors.push(err.message));
  try {
    await retryPage.goto('http://127.0.0.1:4178/images/enhance/', { waitUntil: 'networkidle' });
    await upload(retryPage, 'retry-twice.png', 300, 220);
    await retryPage.locator('#enhancer-mode-upscale').click();
    await retryPage.locator('#enhancer-scale').selectOption('2');
    await retryPage.locator('#enhancer-run').click();
    const status = await waitResult(retryPage, /Upscaled 2× .*memory retry ×2/, 120000);
    assert.match(status, /background AI/);
    assert.deepEqual(await outputDimensions(retryPage), [600, 440, 'retry-twice-upscaled-2x.png']);
    assert.equal(retryErrors.length, 0, `Retry console errors:\n${retryErrors.join('\n')}`);
  } finally {
    await retryContext.close();
  }

  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message, transfer) {
        if (message?.type === 'pack-tile') {
          throw new RangeError('out of memory exhausted worker retry test');
        }
        return super.postMessage(message, transfer);
      }
    };
  });
  const fallbackPage = await fallbackContext.newPage();
  const fallbackErrors = [];
  fallbackPage.on('console', msg => { if (msg.type() === 'error') fallbackErrors.push(msg.text()); });
  fallbackPage.on('pageerror', err => fallbackErrors.push(err.message));
  try {
    await fallbackPage.goto('http://127.0.0.1:4178/images/enhance/', { waitUntil: 'networkidle' });
    await upload(fallbackPage, 'retry-exhausted.png');
    await fallbackPage.locator('#enhancer-mode-upscale').click();
    await fallbackPage.locator('#enhancer-scale').selectOption('2');
    await fallbackPage.locator('#enhancer-run').click();
    const status = await waitResult(fallbackPage, /Enlarged 2× .*standard fallback used/, 120000);
    assert.doesNotMatch(status, /background AI/);
    assert.deepEqual(await outputDimensions(fallbackPage), [220, 140, 'retry-exhausted-enlarged-2x.png']);
    assert.equal(fallbackErrors.length, 0, `Fallback console errors:\n${fallbackErrors.join('\n')}`);
  } finally {
    await fallbackContext.close();
  }
}

async function testCancellationDuringModelLoad() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:4178/images/enhance/', { waitUntil: 'networkidle' });
    await upload(page, 'cancel-load.png', 40, 30);
    await page.locator('#enhancer-mode-upscale').click();
    await page.locator('#enhancer-scale').selectOption('2');

    await page.evaluate(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const href = String(input?.url || input);
        if (href.includes('realesr-general-x4v3.onnx')) {
          return new Promise((resolve, reject) => {
            const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
            if (init.signal?.aborted) return abort();
            init.signal?.addEventListener('abort', abort, { once: true });
          });
        }
        return originalFetch(input, init);
      };
      window.__restoreResilienceFetch = () => {
        window.fetch = originalFetch;
        delete window.__restoreResilienceFetch;
      };
    });

    try {
      await page.locator('#enhancer-run').click();
      await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('Downloading AI model'));
      assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), false);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForFunction(() => (document.querySelector('#status')?.textContent || '').includes('Processing cancelled'));
      assert.equal(await page.locator('#downloads a[download]').count(), 0, 'Cancelled model load must not create an output.');
      assert.equal(await page.locator('#enhancer-run').isDisabled(), false, 'Controls must recover after cancellation.');
    } finally {
      await page.evaluate(() => window.__restoreResilienceFetch?.());
    }

    assert.equal(errors.length, 0, `Cancellation console errors:\n${errors.join('\n')}`);
  } finally {
    await context.close();
  }
}

async function testEnhanceFallbackIsNotNoop() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  try {
    await page.goto('http://127.0.0.1:4178/images/enhance/', { waitUntil: 'networkidle' });
    await upload(page, 'local-fallback.png', 140, 100);
    await page.locator('#enhancer-mode-enhance').click();
    await page.locator('#enhancer-content').selectOption('general');
    await page.locator('#enhancer-restoration').selectOption('recovery');
    await page.locator('#enhancer-sharpen').selectOption('auto');

    await page.evaluate(() => {
      const inference = window.ort?.InferenceSession;
      const originalCreate = inference?.create?.bind(inference);
      if (!inference || !originalCreate) throw new Error('ONNX Runtime missing for fallback injection.');
      inference.create = async () => { throw new Error('Injected AI engine failure'); };
      window.__restoreEnhancerCreate = () => {
        inference.create = originalCreate;
        delete window.__restoreEnhancerCreate;
      };
    });

    try {
      await page.locator('#enhancer-run').click();
      const status = await waitResult(page, /Enhanced · original size .*local fallback used safely/);
      assert.doesNotMatch(status, /background AI/);
      assert.deepEqual(await outputDimensions(page), [140, 100, 'local-fallback-enhanced.png']);

      const metrics = await page.evaluate(async () => {
        const source = document.querySelector('canvas[aria-label="Source image preview"]');
        const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
        const bitmap = await createImageBitmap(await (await fetch(link.href)).blob());
        const sample = input => {
          const canvas = document.createElement('canvas');
          canvas.width = 140;
          canvas.height = 100;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(input, 0, 0, 140, 100);
          return ctx.getImageData(0, 0, 140, 100).data;
        };
        const before = sample(source);
        const after = sample(bitmap);
        bitmap.close();
        let delta = 0;
        for (let i = 0; i < before.length; i += 4) {
          const y0 = before[i] * 0.2126 + before[i + 1] * 0.7152 + before[i + 2] * 0.0722;
          const y1 = after[i] * 0.2126 + after[i + 1] * 0.7152 + after[i + 2] * 0.0722;
          delta += Math.abs(y1 - y0);
        }
        return { lumaMae: delta / (before.length / 4) };
      });
      assert.ok(metrics.lumaMae >= 1.0, `Local Enhance fallback must be visibly non-no-op: ${JSON.stringify(metrics)}`);
    } finally {
      await page.evaluate(() => window.__restoreEnhancerCreate?.());
    }

    assert.equal(errors.length, 0, `Local fallback console errors:\n${errors.join('\n')}`);
  } finally {
    await context.close();
  }
}

try {
  await testDeepMemoryRetries();
  await testCancellationDuringModelLoad();
  await testEnhanceFallbackIsNotNoop();
  console.log('PASS: two-stage memory retry, exhausted-memory upscale fallback, model-download cancellation and non-no-op local Enhance fallback verified.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
