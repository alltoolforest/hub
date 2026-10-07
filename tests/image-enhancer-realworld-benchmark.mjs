import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
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
    let info; try { info = await stat(filePath); } catch { info = null; }
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
await new Promise(r => server.listen(4195, '127.0.0.1', r));

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
const diagnostics = [];
page.on('console', m => { if (['error','warning'].includes(m.type())) diagnostics.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => diagnostics.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => diagnostics.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText || 'unknown'}`));

function fromDataUrl(url) {
  return Buffer.from(url.split(',')[1], 'base64');
}

try {
  await page.goto('http://127.0.0.1:4195/images/enhance/', { waitUntil: 'networkidle', timeout: 90000 });

  const fixtures = await page.evaluate(async () => {
    const response = await fetch('/tests/fixtures/nafnet-natural-sharp.png', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Natural benchmark fixture failed to load (${response.status}).`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const width = 192, height = 128;

    const target = document.createElement('canvas');
    target.width = width; target.height = height;
    const tctx = target.getContext('2d', { willReadFrequently: true, alpha: false });
    const srcRatio = bitmap.width / bitmap.height;
    const dstRatio = width / height;
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    if (srcRatio > dstRatio) {
      sw = Math.round(bitmap.height * dstRatio);
      sx = Math.round((bitmap.width - sw) / 2);
    } else {
      sh = Math.round(bitmap.width / dstRatio);
      sy = Math.round((bitmap.height - sh) / 2);
    }
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    bitmap.close();

    const clone = () => {
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      const ctx = c.getContext('2d', { willReadFrequently: true, alpha: false });
      ctx.drawImage(target, 0, 0);
      return c;
    };

    const filtered = filter => {
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      const ctx = c.getContext('2d', { willReadFrequently: true, alpha: false });
      ctx.filter = filter;
      ctx.drawImage(target, 0, 0);
      ctx.filter = 'none';
      return c;
    };

    const noisy = amplitude => {
      const c = clone();
      const ctx = c.getContext('2d', { willReadFrequently: true, alpha: false });
      const image = ctx.getImageData(0, 0, width, height);
      let state = 0x4f27a1c3;
      for (let p = 0; p < image.data.length; p += 4) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const n = ((((state >>> 8) & 0xffff) / 65535) - 0.5) * amplitude * 2;
        for (let ch = 0; ch < 3; ch++) {
          image.data[p + ch] = Math.max(0, Math.min(255, Math.round(image.data[p + ch] + n)));
        }
      }
      ctx.putImageData(image, 0, 0);
      return c;
    };

    const lowres = () => {
      const tiny = document.createElement('canvas');
      tiny.width = 72; tiny.height = 48;
      const tinyCtx = tiny.getContext('2d', { alpha: false });
      tinyCtx.imageSmoothingEnabled = true;
      tinyCtx.imageSmoothingQuality = 'medium';
      tinyCtx.drawImage(target, 0, 0, tiny.width, tiny.height);
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      const ctx = c.getContext('2d', { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(tiny, 0, 0, width, height);
      return c;
    };

    const mixed = () => {
      const base = filtered('blur(2.1px) brightness(0.74) contrast(0.88)');
      const ctx = base.getContext('2d', { willReadFrequently: true, alpha: false });
      const image = ctx.getImageData(0, 0, width, height);
      let state = 0x1638c9af;
      for (let p = 0; p < image.data.length; p += 4) {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        const n = ((((state >>> 9) & 0x7fff) / 32767) - 0.5) * 18;
        for (let ch = 0; ch < 3; ch++) image.data[p + ch] = Math.max(0, Math.min(255, image.data[p + ch] + n));
      }
      ctx.putImageData(image, 0, 0);
      return base;
    };

    const toDataUrl = (canvas, type = 'image/png', quality = 1) => canvas.toDataURL(type, quality);
    const compressionCanvas = clone();

    return {
      target: toDataUrl(target),
      cases: {
        clean: { data: toDataUrl(clone()), mime: 'image/png', name: 'benchmark-clean.png' },
        blur: { data: toDataUrl(filtered('blur(4.5px)')), mime: 'image/png', name: 'benchmark-blur.png' },
        noise: { data: toDataUrl(noisy(24)), mime: 'image/png', name: 'benchmark-noise.png' },
        under: { data: toDataUrl(filtered('brightness(0.66)')), mime: 'image/png', name: 'benchmark-underexposed.png' },
        over: { data: toDataUrl(filtered('brightness(1.34)')), mime: 'image/png', name: 'benchmark-overexposed.png' },
        compression: { data: toDataUrl(compressionCanvas, 'image/jpeg', 0.22), mime: 'image/jpeg', name: 'benchmark-compressed.jpg' },
        lowres: { data: toDataUrl(lowres()), mime: 'image/png', name: 'benchmark-lowres.png' },
        mixed: { data: toDataUrl(mixed()), mime: 'image/png', name: 'benchmark-mixed.png' }
      }
    };
  });

  const targetUrl = fixtures.target;

  async function runCase(name, spec) {
    await page.locator('input[type=file]').setInputFiles({
      name: spec.name,
      mimeType: spec.mime,
      buffer: fromDataUrl(spec.data)
    });
    await page.waitForFunction(name => {
      const canvas = document.querySelector('canvas[aria-label="Source image preview"]');
      const info = document.querySelector('#enhancer-source-info')?.textContent || '';
      const selected = document.querySelector('.selected-files')?.textContent || '';
      const state = document.querySelector('#status')?.textContent || '';
      return !!canvas &&
        canvas.width === 192 &&
        canvas.height === 128 &&
        info.includes('Analysis:') &&
        selected.includes(name) &&
        state.includes('File ready.');
    }, spec.name, { timeout: 30000 });

    // Upload clears downloads. Read synchronously instead of waiting30s for a
    // link that correctly does not exist yet on every benchmark case.
    const beforeHref = await page.evaluate(() => [...document.querySelectorAll('#downloads a[download]')].at(-1)?.href || '');
    await page.locator(name === 'blur' ? '#enhancer-mode-deblur' : '#enhancer-mode-enhance').click();
    if (name !== 'blur') {
    await page.locator('#enhancer-content').selectOption(
      name === 'blur' || name === 'mild-blur' || name === 'mixed' ? 'auto' : 'high-fidelity'
    );
    await page.locator('#enhancer-restoration').selectOption('auto');
    await page.locator('#enhancer-sharpen').selectOption('auto');
    }
    await page.locator('#enhancer-run').click();

    try {
      await page.waitForFunction(before => {
        const links = [...document.querySelectorAll('#downloads a[download]')];
        const last = links.at(-1);
        const button = document.querySelector('#enhancer-run');
        return !!last && !!button && !button.disabled && last.href !== before;
      }, beforeHref || '', { timeout: 150000 });
    } catch (error) {
      const state = await page.evaluate(before => {
        const links = [...document.querySelectorAll('#downloads a[download]')];
        return {
          status: document.querySelector('#status')?.textContent || '',
          selected: document.querySelector('.selected-files')?.textContent || '',
          lastHref: links.at(-1)?.href || '',
          beforeHref: before,
          runDisabled: !!document.querySelector('#enhancer-run')?.disabled
        };
      }, beforeHref || '');
      console.error('TASK5-TIMEOUT', name, JSON.stringify(state), diagnostics.join('\n'));
      throw error;
    }

    const status = (await page.locator('#status').textContent()) || '';
    const metrics = await page.evaluate(async targetDataUrl => {
      const { analyzeArtifactFidelity } = await import('/assets/js/image-enhancer-artifact-guard.js?task5=1');
      const source = document.querySelector('canvas[aria-label="Source image preview"]');
      const link = [...document.querySelectorAll('#downloads a[download]')].at(-1);
      if (!source || !link) throw new Error('Benchmark source/output unavailable.');

      const outputBlob = await (await fetch(link.href)).blob();
      const output = await createImageBitmap(outputBlob);
      const targetPayload = targetDataUrl.split(',')[1] || '';
      const targetBytes = Uint8Array.from(atob(targetPayload), ch => ch.charCodeAt(0));
      const targetBlob = new Blob([targetBytes], { type: 'image/png' });
      const target = await createImageBitmap(targetBlob);

      const width = 192, height = 128;
      const pixels = input => {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(input, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      };
      const a = pixels(source);
      const b = pixels(output);
      const t = pixels(target);

      const mae = (x, y) => {
        let sum = 0, n = 0;
        for (let p = 0; p < x.length; p += 4) {
          sum += Math.abs(x[p] - y[p]) + Math.abs(x[p+1] - y[p+1]) + Math.abs(x[p+2] - y[p+2]);
          n += 3;
        }
        return sum / n;
      };
      const gray = rgba => {
        const out = new Float32Array(width * height);
        for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = rgba[p]*0.2126 + rgba[p+1]*0.7152 + rgba[p+2]*0.0722;
        return out;
      };
      const edge = rgba => {
        const g = gray(rgba);
        let sum = 0, n = 0;
        for (let y = 0; y < height - 1; y++) {
          for (let x = 0; x < width - 1; x++) {
            const i = y * width + x;
            sum += Math.abs(g[i+1]-g[i]) + Math.abs(g[i+width]-g[i]);
            n += 2;
          }
        }
        return sum / n;
      };
      const sourceMae = mae(a, t);
      const outputMae = mae(b, t);
      const sourceEdge = edge(a);
      const outputEdge = edge(b);
      const targetEdge = edge(t);
      const mode = /dedicated deblur/i.test(document.querySelector('#status')?.textContent || '') ? 'deblur' : 'enhance';
      const fidelity = analyzeArtifactFidelity(source, output, [], mode);
      const out = {
        width: output.width,
        height: output.height,
        sourceMae,
        outputMae,
        improvement: sourceMae > 0.001 ? (sourceMae - outputMae) / sourceMae : 0,
        sourceEdge,
        outputEdge,
        targetEdge,
        edgeTargetRatio: targetEdge > 0.001 ? outputEdge / targetEdge : 1,
        fidelity,
        mode
      };
      output.close();
      target.close();
      return out;
    }, targetUrl);

    console.log(`TASK5 case=${name} status=${status}`);
    console.log(JSON.stringify(metrics));
    return { name, status, ...metrics };
  }

  const results = [];
  for (const [name, spec] of Object.entries(fixtures.cases)) {
    results.push(await runCase(name, spec));
  }

  const byName = Object.fromEntries(results.map(r => [r.name, r]));
  assert.ok(byName.clean.outputMae <= 9,
    `Clean input regressed too far: MAE=${byName.clean.outputMae}`);
  assert.ok(byName.blur.improvement >= 0.06,
    `Blur restoration did not materially approach clean target: improvement=${byName.blur.improvement}`);
  assert.ok(byName.blur.outputEdge > byName.blur.sourceEdge * 1.06,
    `Blur restoration did not recover edge energy: source=${byName.blur.sourceEdge} output=${byName.blur.outputEdge}`);

  const damaged = results.filter(r => r.name !== 'clean');
  for (const r of damaged) {
    assert.equal(r.width, 192, `${r.name} output width changed unexpectedly`);
    assert.equal(r.height, 128, `${r.name} output height changed unexpectedly`);
    assert.ok(r.outputMae <= r.sourceMae * 1.15 + 2,
      `${r.name} restoration moved too far from clean target: sourceMAE=${r.sourceMae} outputMAE=${r.outputMae}`);
    assert.equal(r.fidelity.safe, true,
      `${r.name} final output failed fidelity gate: ${JSON.stringify(r.fidelity)}`);
  }

  const meaningfulImprovement = damaged.filter(r => r.improvement >= 0.02).length;
  assert.ok(meaningfulImprovement >= 3,
    `Too few degradation classes improved by >=2%: ${meaningfulImprovement}/${damaged.length}`);

  const catastrophic = damaged.filter(r => r.improvement < -0.15);
  assert.equal(catastrophic.length, 0,
    `Catastrophic benchmark regressions: ${catastrophic.map(r => r.name).join(', ')}`);

  const mild = await runCase('mild-blur', {...fixtures.cases.blur, name:'benchmark-mild-blur.png'});
  assert.match(mild.status, /photographic tone/);
  assert.doesNotMatch(mild.status, /dedicated deblur AI|gentle deblur/);
  // Enhance is not a blur reconstruction engine. Retain the damage ceiling;
  // dedicated Deblur above must still improve the paired sharp reference.
  assert.ok(mild.outputMae <= mild.sourceMae * 1.15 + 2, `Enhance on blurred input must not introduce excessive damage: ${JSON.stringify(mild)}`);
  assert.equal(mild.fidelity.safe, true);
  console.log('Image Enhancer Task 5 real-world benchmark passed.');
  console.log(JSON.stringify({
    meaningfulImprovement,
    totalDamaged: damaged.length,
    results
  }, null, 2));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
