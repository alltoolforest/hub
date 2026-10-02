import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'],
  ['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],
  ['.svg','image/svg+xml'],
  ['.png','image/png'],
  ['.jpg','image/jpeg'],
  ['.jpeg','image/jpeg'],
  ['.webp','image/webp'],
  ['.wasm','application/wasm']
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
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    res.end(body);
  } catch {
    res.writeHead(404, {'content-type':'text/plain'});
    res.end('Not found');
  }
});
await new Promise(resolveServer => server.listen(4192, '127.0.0.1', resolveServer));

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();

try {
  await page.goto('http://127.0.0.1:4192/images/enhance/', { waitUntil: 'domcontentloaded', timeout: 90000 });

  const result = await page.evaluate(async () => {
    const { analyzeSourceImage } = await import('/assets/js/image-enhancer-restoration.js?task1-diagnosis=1');

    function makeBase(width = 1280, height = 960) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
      ctx.fillStyle = 'rgb(128,128,128)';
      ctx.fillRect(0, 0, width, height);

      const cell = 64;
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          const light = ((x / cell + y / cell) & 1) === 0;
          const v = light ? 166 : 92;
          ctx.fillStyle = `rgb(${v},${Math.round(v * 0.97)},${Math.round(v * 0.93)})`;
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = light ? 'rgb(72,76,82)' : 'rgb(196,190,178)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 8, y + 12);
          ctx.lineTo(Math.min(width, x + cell - 8), Math.min(height, y + cell - 12));
          ctx.stroke();
        }
      }
      return canvas;
    }

    function transform(source, filter, width = source.width, height = source.height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = filter;
      ctx.drawImage(source, 0, 0, width, height);
      ctx.filter = 'none';
      return canvas;
    }

    function addNoise(source, amplitude = 44) {
      const canvas = transform(source, 'none');
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let state = 0x12345678;
      for (let p = 0; p < image.data.length; p += 4) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const n = (((state >>> 8) & 0xffff) / 65535 - 0.5) * amplitude * 2;
        for (let c = 0; c < 3; c++) {
          image.data[p + c] = Math.max(0, Math.min(255, Math.round(image.data[p + c] + n)));
        }
      }
      ctx.putImageData(image, 0, 0);
      return canvas;
    }

    function uneven(source) {
      const canvas = transform(source, 'none');
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, canvas.width * 0.48, canvas.height);
      return canvas;
    }

    async function blobOf(canvas, type = 'image/png', quality = 1) {
      return new Promise((resolveBlob, reject) => {
        canvas.toBlob(blob => blob ? resolveBlob(blob) : reject(new Error('encode failed')), type, quality);
      });
    }

    async function analyzeCanvas(canvas, name = 'fixture.png', type = 'image/png', quality = 1) {
      const blob = await blobOf(canvas, type, quality);
      const file = new File([blob], name, { type });
      const bitmap = await createImageBitmap(blob);
      try {
        return await analyzeSourceImage(bitmap, file);
      } finally {
        bitmap.close();
      }
    }

    const base = makeBase();
    const blurred = transform(base, 'blur(9px)');
    const noisy = addNoise(base);
    const under = transform(base, 'brightness(0.26)');
    const over = transform(base, 'brightness(2.35)');
    const lowContrast = transform(base, 'contrast(0.16)');
    const unevenLight = uneven(base);
    const lowResolution = transform(base, 'none', 320, 240);
    const mixed = transform(under, 'none', 320, 240);

    const cleanAnalysis = await analyzeCanvas(base);
    const blurAnalysis = await analyzeCanvas(blurred, 'blur.png');
    const noiseAnalysis = await analyzeCanvas(noisy, 'noise.png');
    const underAnalysis = await analyzeCanvas(under, 'under.png');
    const overAnalysis = await analyzeCanvas(over, 'over.png');
    const contrastAnalysis = await analyzeCanvas(lowContrast, 'contrast.png');
    const unevenAnalysis = await analyzeCanvas(unevenLight, 'uneven.png');
    const lowResAnalysis = await analyzeCanvas(lowResolution, 'lowres.png');
    const mixedAnalysis = await analyzeCanvas(mixed, 'mixed.png');

    // Compression uses an actual low-quality JPEG so file-size and blocking evidence both participate.
    const jpegBlob = await blobOf(base, 'image/jpeg', 0.05);
    const jpegFile = new File([jpegBlob], 'compressed.jpg', { type: 'image/jpeg' });
    const jpegBitmap = await createImageBitmap(jpegBlob);
    let compressionAnalysis;
    try {
      compressionAnalysis = await analyzeSourceImage(jpegBitmap, jpegFile);
    } finally {
      jpegBitmap.close();
    }

    const pick = a => ({
      diagnosis: a.diagnosis,
      exposure: a.exposure,
      likelyBlurred: a.likelyBlurred,
      noise: a.noise,
      jpegArtifacts: a.jpegArtifacts,
      lowResolution: a.lowResolution,
      falseResolution: a.falseResolution,
      recommendedProfile: a.recommendedProfile
    });

    return {
      clean: pick(cleanAnalysis),
      blur: pick(blurAnalysis),
      noise: pick(noiseAnalysis),
      under: pick(underAnalysis),
      over: pick(overAnalysis),
      lowContrast: pick(contrastAnalysis),
      uneven: pick(unevenAnalysis),
      lowResolution: pick(lowResAnalysis),
      mixed: pick(mixedAnalysis),
      compression: pick(compressionAnalysis),
      frozen: Object.isFrozen(cleanAnalysis.diagnosis) &&
        Object.isFrozen(cleanAnalysis.diagnosis.confidence) &&
        Object.isFrozen(cleanAnalysis.exposure)
    };
  });

  const c = entry => entry.diagnosis.confidence;

  assert.equal(result.clean.diagnosis.version, 1);
  assert.equal(result.frozen, true, 'Diagnosis structures must be immutable.');

  for (const [name, fixture] of Object.entries(result)) {
    if (!fixture?.diagnosis) continue;
    for (const [key, value] of Object.entries(fixture.diagnosis.confidence)) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name}.${key} confidence out of range: ${value}`);
    }
  }

  assert.ok(c(result.blur).blur >= c(result.clean).blur + 0.12,
    `Blur confidence did not separate blurred source: clean=${c(result.clean).blur} blur=${c(result.blur).blur}`);
  assert.equal(result.blur.likelyBlurred, true, 'Known blurred fixture must retain legacy blur routing.');

  assert.ok(c(result.noise).noise >= c(result.clean).noise + 0.18,
    `Noise confidence did not separate noisy source: clean=${c(result.clean).noise} noise=${c(result.noise).noise}`);

  assert.ok(c(result.under).underexposure >= 0.55,
    `Underexposure confidence too low: ${c(result.under).underexposure}`);
  assert.ok(c(result.over).overexposure >= 0.55,
    `Overexposure confidence too low: ${c(result.over).overexposure}`);
  assert.ok(c(result.lowContrast).lowContrast >= 0.65,
    `Low-contrast confidence too low: ${c(result.lowContrast).lowContrast}`);
  assert.ok(c(result.uneven).unevenLighting >= 0.35,
    `Uneven-lighting confidence too low: ${c(result.uneven).unevenLighting}`);
  assert.ok(c(result.lowResolution).lowResolution >= 0.75,
    `Low-resolution confidence too low: ${c(result.lowResolution).lowResolution}`);
  assert.ok(c(result.compression).compression >= c(result.clean).compression + 0.12,
    `Compression confidence did not separate JPEG damage: clean=${c(result.clean).compression} jpeg=${c(result.compression).compression}`);

  assert.equal(result.mixed.diagnosis.mixed, true,
    `Mixed fixture was not classified as mixed: ${JSON.stringify(result.mixed.diagnosis)}`);
  assert.ok(result.mixed.diagnosis.mixedConfidence >= 0.45,
    `Mixed-degradation confidence too low: ${result.mixed.diagnosis.mixedConfidence}`);

  // Task 1 is diagnostic only: existing legacy routing fields remain present.
  for (const fixture of Object.values(result)) {
    if (!fixture?.diagnosis) continue;
    assert.ok(['fidelity','balanced','recovery'].includes(fixture.recommendedProfile));
    assert.equal(typeof fixture.likelyBlurred, 'boolean');
  }

  console.log('Image Enhancer Task 1 degradation diagnosis audit passed.');
  console.log(JSON.stringify({
    clean: c(result.clean),
    blur: c(result.blur),
    noise: c(result.noise),
    under: c(result.under),
    over: c(result.over),
    lowContrast: c(result.lowContrast),
    uneven: c(result.uneven),
    lowResolution: c(result.lowResolution),
    compression: c(result.compression),
    mixed: result.mixed.diagnosis
  }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolveServer => server.close(resolveServer));
}
