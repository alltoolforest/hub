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
function png(width, height, transparent = false) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 4;
      raw[p] = (x * 11 + y * 3) & 255;
      raw[p + 1] = (x * 5 + y * 13) & 255;
      raw[p + 2] = (x * 17 + y * 7) & 255;
      raw[p + 3] = transparent && x < Math.ceil(width / 2) ? 0 : 255;
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
await new Promise(resolveListen => server.listen(4173, '127.0.0.1', resolveListen));

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
const consoleErrors = [];
const diagnostics = [];
page.on('console', msg => {
  const line = `console:${msg.type()}: ${msg.text()}`;
  if (msg.type() === 'error') consoleErrors.push(line);
  if (['error','warning'].includes(msg.type())) diagnostics.push(line);
});
page.on('pageerror', err => { consoleErrors.push(`pageerror: ${err.message}`); diagnostics.push(`pageerror: ${err.message}`); });
page.on('requestfailed', req => diagnostics.push(`requestfailed: ${req.url()} :: ${req.failure()?.errorText || 'unknown'}`));
page.on('response', res => { if (res.status() >= 400) diagnostics.push(`http ${res.status()}: ${res.url()}`); });

async function upload(name, width, height, transparent = false) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: png(width, height, transparent) });
  await page.waitForFunction(([w, h]) => {
    const text = document.querySelector('#enhancer-source-info')?.textContent || '';
    return text.includes(`${w} × ${h}`) && text.includes('Analysis:');
  }, [width, height]);
}

async function waitForTerminal(scale) {
  try {
    await page.waitForFunction(() => {
      const output = document.querySelector('#downloads a[download]');
      const button = document.querySelector('#enhancer-run');
      const text = document.querySelector('#status')?.textContent || '';
      return !!output || (!!button && !button.disabled && !/^(Downloading|Preparing|Enhancing|Encoding|Processing|AI unavailable|Sharpening|Retrying|Memory pressure)/.test(text));
    }, null, { timeout: 90000 });
  } catch (error) {
    const statusText = await page.locator('#status').textContent().catch(() => 'status unavailable');
    console.error(`DIAGNOSTIC scale=${scale} timeout status=${statusText}`);
    console.error(diagnostics.join('\n'));
    throw error;
  }
  return (await page.locator('#status').textContent()) || '';
}

async function latestOutputInfo() {
  return page.evaluate(async () => {
    const a = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!a) return null;
    const blob = await (await fetch(a.href)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const pixels = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const alpha = pixels[3];
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i++) {
      hash ^= pixels[i];
      hash = Math.imul(hash, 16777619);
    }
    const result = [bmp.width, bmp.height, a.download, alpha, hash >>> 0];
    bmp.close();
    return result;
  });
}

async function sourcePreviewHash() {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label="Source image preview"]');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i++) {
      hash ^= pixels[i];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
}

async function latestOutputPerceptualMetrics() {
  return page.evaluate(async () => {
    const source = document.querySelector('canvas[aria-label="Source image preview"]');
    const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
    if (!source || !link) return null;
    const blob = await (await fetch(link.href)).blob();
    const bitmap = await createImageBitmap(blob);
    const sampleW = Math.max(32, Math.min(256, source.width));
    const sampleH = Math.max(32, Math.round(sampleW * source.height / source.width));

    const sample = input => {
      const canvas = document.createElement('canvas');
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(input, 0, 0, sampleW, sampleH);
      return ctx.getImageData(0, 0, sampleW, sampleH).data;
    };

    const before = sample(source);
    const after = sample(bitmap);
    bitmap.close();

    const gray = rgba => {
      const out = new Float32Array(sampleW * sampleH);
      for (let i = 0, p = 0; i < out.length; i++, p += 4) {
        out[i] = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722;
      }
      return out;
    };
    const beforeGray = gray(before);
    const afterGray = gray(after);

    let lumaDelta = 0;
    for (let i = 0; i < beforeGray.length; i++) lumaDelta += Math.abs(beforeGray[i] - afterGray[i]);
    const lumaMae = lumaDelta / beforeGray.length;

    const edgeEnergy = values => {
      let sum = 0;
      let count = 0;
      for (let y = 0; y < sampleH - 1; y++) {
        for (let x = 0; x < sampleW - 1; x++) {
          const i = y * sampleW + x;
          sum += Math.abs(values[i + 1] - values[i]) + Math.abs(values[i + sampleW] - values[i]);
          count += 2;
        }
      }
      return count ? sum / count : 0;
    };

    const beforeEdge = edgeEnergy(beforeGray);
    const afterEdge = edgeEnergy(afterGray);
    return {
      lumaMae,
      beforeEdge,
      afterEdge,
      edgeRatio: beforeEdge > 0.001 ? afterEdge / beforeEdge : 1
    };
  });
}

async function runAiScale(scale, expected, content = 'general', profile = 'auto', sharpen = 'auto', requiredStatus = /background AI/) {
  if (Number(scale) === 1) {
    await page.locator('#enhancer-mode-enhance').click();
    await page.locator('#enhancer-content').selectOption(content);
    await page.locator('#enhancer-restoration').selectOption(profile);
    await page.locator('#enhancer-sharpen').selectOption(sharpen);
  } else {
    await page.locator('#enhancer-mode-upscale').click();
    await page.locator('#enhancer-scale').selectOption(String(scale));
  }
  await page.locator('#enhancer-run').click();
  const statusText = await waitForTerminal(scale);
  console.log(`DIAGNOSTIC scale=${scale} content=${content} profile=${profile} sharpen=${sharpen} terminal status=${statusText}`);
  assert.match(statusText, requiredStatus, `Expected real AI output, got terminal status: ${statusText}\n${diagnostics.join('\n')}`);
  const info = await latestOutputInfo();
  assert.deepEqual(info?.slice(0, 3), expected);
  return { statusText, info };
}

async function testUnsafeWebGpuIsNotSelected() {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const fakeAdapter = { limits: { maxTextureDimension2D: 16384 } };
    const fakeGpu = { requestAdapter: async () => fakeAdapter };
    try {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: fakeGpu });
    } catch {
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => fakeGpu });
    }
  });
  const testPage = await context.newPage();
  try {
    await testPage.goto('http://127.0.0.1:4173/images/enhance/', { waitUntil: 'networkidle' });
    await testPage.evaluate(() => {
      const inference = window.ort?.InferenceSession;
      const originalCreate = inference?.create?.bind(inference);
      if (!inference || !originalCreate) throw new Error('ONNX Runtime was not available for provider audit.');
      window.__enhancerProviders = [];
      inference.create = async (model, options = {}) => {
        window.__enhancerProviders.push([...(options.executionProviders || [])]);
        if (options.executionProviders?.includes('webgpu')) throw new Error('Unsafe WebGPU provider was selected.');
        return originalCreate(model, options);
      };
    });
    await testPage.locator('input[type=file]').setInputFiles({
      name: 'provider-audit.png', mimeType: 'image/png', buffer: png(160, 120)
    });
    await testPage.waitForFunction(() => (document.querySelector('#enhancer-source-info')?.textContent || '').includes('160 × 120'));
    await testPage.locator('#enhancer-mode-enhance').click();
    await testPage.locator('#enhancer-content').selectOption('general');
    await testPage.locator('#enhancer-restoration').selectOption('balanced');
    await testPage.locator('#enhancer-sharpen').selectOption('off');
    await testPage.locator('#enhancer-run').click();
    await testPage.waitForFunction(() => {
      const text = document.querySelector('#status')?.textContent || '';
      return !!document.querySelector('#downloads a[download]') && /background AI/.test(text);
    }, null, { timeout: 90000 });
    const providers = await testPage.evaluate(() => window.__enhancerProviders);
    assert.ok(providers.length >= 1, 'AI provider audit must observe session creation.');
    assert.equal(providers.some(list => list.includes('webgpu')), false, 'Production must not auto-select WebGPU.');
    assert.equal(providers.some(list => list.includes('wasm')), true, 'Production must use worker-backed WASM.');
    assert.equal(await testPage.evaluate(() => window.ort?.env?.wasm?.proxy), true, 'WASM proxy worker must be enabled.');
  } finally {
    await context.close();
  }
}

try {
  await page.goto('http://127.0.0.1:4173/images/enhance/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#enhancer-mode-enhance');
  await page.waitForSelector('#enhancer-mode-upscale');
  await page.waitForSelector('#enhancer-scale', { state: 'attached' });
  await page.waitForSelector('#enhancer-content', { state: 'attached' });
  assert.equal(await page.locator('.fields').first().isHidden(), true, 'Task controls must stay hidden until Enhance or Upscale is chosen.');
  await page.locator('#enhancer-mode-enhance').click();
  assert.equal(await page.locator('#enhancer-content').isVisible(), true, 'Enhance mode must show enhancement controls.');
  assert.equal(await page.locator('#enhancer-scale').isVisible(), false, 'Enhance mode must hide upscale controls.');
  await page.locator('#enhancer-mode-upscale').click();
  assert.equal(await page.locator('#enhancer-scale').isVisible(), true, 'Upscale mode must show resolution controls.');
  assert.equal(await page.locator('#enhancer-content').isVisible(), false, 'Upscale mode must hide enhancement-only controls.');

  await upload('core-test.png', 24, 16);
  const summary = await page.locator('#enhancer-source-info').textContent();
  assert.match(summary || '', /Analysis: .* profile recommended/);

  const originalHash = await sourcePreviewHash();
  const sharpOff = await runAiScale(1, [24, 16, 'core-test-enhanced.png'], 'high-fidelity', 'fidelity', 'off', /Enhanced · original size .*background AI/);
  const sharpMedium = await runAiScale(1, [24, 16, 'core-test-enhanced.png'], 'high-fidelity', 'fidelity', 'medium', /Enhanced · original size .*background AI/);
  assert.notEqual(sharpOff.info?.[4], originalHash, '1× AI restoration must materially change the encoded pixels from the source.');
  assert.notEqual(sharpOff.info?.[4], sharpMedium.info?.[4], 'Medium sharpening must materially change the encoded pixels compared with Off.');

  await runAiScale(2, [48, 32, 'core-test-upscaled-2x.png'], 'auto', 'auto', 'auto', /Upscaled 2× .*background AI/);
  await runAiScale(4, [96, 64, 'core-test-upscaled-4x.png'], 'auto', 'auto', 'auto', /Upscaled 4× .*background AI/);

  await page.locator('#enhancer-mode-enhance').click();
  await page.locator('#enhancer-content').selectOption('text-logo');
  await page.locator('#enhancer-restoration').selectOption('auto');
  await page.locator('#enhancer-sharpen').selectOption('auto');
  await page.locator('#enhancer-run').click();
  const textStatus = await waitForTerminal(1);
  console.log(`DIAGNOSTIC text/logo terminal status=${textStatus}`);
  assert.match(textStatus, /Enhanced · original size .*background-safe local processing/);
  assert.doesNotMatch(textStatus, /background AI/);
  const textInfo = await latestOutputInfo();
  assert.deepEqual(textInfo?.slice(0, 3), [24, 16, 'core-test-enhanced.png']);

  await page.locator('#enhancer-mode-upscale').click();
  await page.locator('#enhancer-scale').selectOption('2');
  await page.locator('#enhancer-run').click();
  const autoStatus = await waitForTerminal(2);
  console.log(`DIAGNOSTIC auto-route terminal status=${autoStatus}`);
  assert.match(autoStatus, /Upscaled 2× .*background AI/);

  await upload('tile-test.png', 500, 350);
  const realisticOriginalHash = await sourcePreviewHash();
  const realistic1x = await runAiScale(1, [500, 350, 'tile-test-enhanced.png'], 'general', 'recovery', 'auto', /Enhanced · original size .*background AI/);
  assert.notEqual(realistic1x.info?.[4], realisticOriginalHash, 'Realistic 1× restoration must materially change pixels from the source.');
  const perceptual1x = await latestOutputPerceptualMetrics();
  console.log(`DIAGNOSTIC realistic-1x perceptual lumaMae=${perceptual1x?.lumaMae?.toFixed(3)} edgeRatio=${perceptual1x?.edgeRatio?.toFixed(3)}`);
  assert.ok((perceptual1x?.lumaMae || 0) >= 1.75, `1× restoration must be perceptually different, not merely hash-different: ${JSON.stringify(perceptual1x)}`);
  assert.ok((perceptual1x?.edgeRatio || 0) >= 1.01, `Soft-image 1× restoration must produce measurable detail/edge gain: ${JSON.stringify(perceptual1x)}`);

  await page.evaluate(() => {
    window.__enhancerHeartbeat = 0;
    window.__enhancerHeartbeatTimer = setInterval(() => { window.__enhancerHeartbeat += 1; }, 25);
  });
  const tiled = await runAiScale(2, [1000, 700, 'tile-test-upscaled-2x.png'], 'auto', 'auto', 'auto', /Upscaled 2× .*background AI/);
  const heartbeat = await page.evaluate(() => {
    clearInterval(window.__enhancerHeartbeatTimer);
    return window.__enhancerHeartbeat;
  });
  assert.ok(heartbeat >= 4, `WASM worker path must keep the UI event loop responsive; heartbeat=${heartbeat}`);
  assert.equal(await page.evaluate(() => window.ort?.env?.wasm?.proxy), true, 'WASM proxy worker must stay enabled in production.');
  assert.match(tiled.statusText, /background AI/);

  await upload('memory-test.png', 300, 220);
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.getImageData;
    let failed = false;
    proto.getImageData = function(...args) {
      if (!failed && this.canvas.width > 100 && this.canvas.height > 50) {
        failed = true;
        throw new RangeError('out of memory injected test');
      }
      return original.apply(this, args);
    };
    window.__restoreEnhancerGetImageData = () => {
      proto.getImageData = original;
      delete window.__restoreEnhancerGetImageData;
    };
  });
  try {
    const retried = await runAiScale(2, [600, 440, 'memory-test-upscaled-2x.png'], 'auto', 'auto', 'auto', /AI super-resolution.*memory retry ×1 · 96px tiles/);
    assert.match(retried.statusText, /wasm/);
  } finally {
    await page.evaluate(() => window.__restoreEnhancerGetImageData?.());
  }

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await page.locator('#enhancer-scale').inputValue(), '2');
  assert.equal(await page.locator('#enhancer-content').inputValue(), 'auto');
  assert.equal(await page.locator('#enhancer-restoration').inputValue(), 'auto');
  assert.equal(await page.locator('#enhancer-sharpen').inputValue(), 'auto');
  assert.equal(await page.locator('.fields').first().isHidden(), true, 'Reset must return to the task chooser.');
  assert.equal(await page.locator('#enhancer-run').isDisabled(), true, 'Reset must require a fresh Enhance/Upscale choice.');

  await upload('alpha-test.png', 24, 16, true);
  await page.locator('#enhancer-mode-upscale').click();
  await page.locator('#enhancer-scale').selectOption('2');
  await page.locator('#enhancer-run').click();
  const fallbackStatus = await waitForTerminal(2);
  console.log(`DIAGNOSTIC transparent terminal status=${fallbackStatus}`);
  assert.match(fallbackStatus, /Enlarged 2× .*standard fallback used/);
  const alphaInfo = await latestOutputInfo();
  assert.deepEqual(alphaInfo?.slice(0, 3), [48, 32, 'alpha-test-enlarged-2x.png']);
  assert.equal(alphaInfo?.[3], 0, 'Transparent source alpha must remain transparent in fallback output.');

  await testUnsafeWebGpuIsNotSelected();

  assert.equal(consoleErrors.length, 0, `Browser console errors:\n${consoleErrors.join('\n')}`);
  console.log('PASS: separated Enhance/Upscale pipelines, simple controls, real AI 1x/2x/4x, perceptual 1× quality gate, worker-backed pixel conversion/finishing, forced WASM proxy provider, adaptive memory retry, CSP isolation, reset and transparent upscale fallback verified.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
