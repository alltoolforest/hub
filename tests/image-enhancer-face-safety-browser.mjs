import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const FACE_FIXTURE_URL = 'https://raw.githubusercontent.com/onnx/models/main/validated/vision/body_analysis/ultraface/dependencies/1.jpg';
const fixtureResponse = await fetch(FACE_FIXTURE_URL);
if (!fixtureResponse.ok) throw new Error(`Could not download public UltraFace fixture (${fixtureResponse.status}).`);
const faceFixture = Buffer.from(await fixtureResponse.arrayBuffer());

const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'],
  ['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],
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
    if (pathname === '/__face_fixture.jpg') {
      res.writeHead(200, {
        'content-type':'image/jpeg',
        'content-length':String(faceFixture.length),
        'cache-control':'no-store'
      });
      res.end(faceFixture);
      return;
    }

    let filePath = resolve(ROOT, '.' + pathname);
    if (!(filePath === ROOT || filePath.startsWith(ROOT + sep))) throw new Error('bad path');
    let info;
    try { info = await stat(filePath); } catch { info = null; }
    if (info?.isDirectory()) filePath = resolve(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options':'nosniff',
      'cache-control':'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, {'content-type':'text/plain'});
    res.end('Not found');
  }
});
await new Promise(resolveServer => server.listen(4193, '127.0.0.1', resolveServer));

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();

try {
  await page.goto('http://127.0.0.1:4193/images/enhance/', { waitUntil:'domcontentloaded', timeout:90000 });

  const result = await page.evaluate(async () => {
    const mod = await import('/assets/js/image-enhancer-face-safety.js?task2=1');
    const manifest = await (await fetch('/assets/models/image-enhancer/manifest.json', { cache:'no-store' })).json();

    async function loadRuntime(signal) {
      if (window.ort?.InferenceSession) return window.ort;
      const response = await fetch(manifest.runtime.bundle, { signal, cache:'force-cache' });
      if (!response.ok) throw new Error(`Runtime download failed (${response.status}).`);
      const source = await response.text();
      const blobURL = URL.createObjectURL(new Blob([source], { type:'text/javascript' }));
      try {
        await new Promise((resolveScript, reject) => {
          const script = document.createElement('script');
          script.src = blobURL;
          script.onload = () => { script.remove(); resolveScript(); };
          script.onerror = () => { script.remove(); reject(new Error('Runtime start failed.')); };
          document.head.append(script);
        });
      } finally {
        URL.revokeObjectURL(blobURL);
      }
      window.ort.env.logLevel = 'warning';
      window.ort.env.wasm.wasmPaths = manifest.runtime.wasmBase;
      window.ort.env.wasm.initTimeout = 45000;
      window.ort.env.wasm.numThreads = 1;
      return window.ort;
    }

    const faceConfig = manifest.models['face-safety-ultraface'];
    const modelResponse = await fetch(faceConfig.url, { cache:'force-cache' });
    if (!modelResponse.ok) throw new Error(`Face model download failed (${modelResponse.status}).`);
    const modelBytes = await modelResponse.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', modelBytes)))
      .map(value => value.toString(16).padStart(2, '0')).join('');
    if (digest !== faceConfig.sha256) {
      throw new Error(`Face model checksum mismatch: ${digest}`);
    }

    const loader = {
      loadRuntime: async signal => loadRuntime(signal),
      loadFaceSafetyModel: async () => ({ config:faceConfig, bytes:modelBytes })
    };
    const engine = new mod.FaceIdentitySafetyEngine(loader, { wasm:true });

    const blob = await (await fetch('/__face_fixture.jpg', { cache:'no-store' })).blob();
    const bitmap = await createImageBitmap(blob);
    const controller = new AbortController();
    const faces = await engine.detect(bitmap, controller.signal);

    if (!faces.length) {
      bitmap.close();
      await engine.dispose();
      return { faces:[], detectorAvailable:engine.lastAvailable };
    }

    const output = document.createElement('canvas');
    output.width = bitmap.width;
    output.height = bitmap.height;
    const ctx = output.getContext('2d', { willReadFrequently:true, alpha:false });
    ctx.filter = 'contrast(1.45) saturate(0.55)';
    ctx.drawImage(bitmap, 0, 0);
    ctx.filter = 'none';

    const first = faces[0];
    function regionMae(canvas, source, face) {
      const sample = document.createElement('canvas');
      sample.width = canvas.width;
      sample.height = canvas.height;
      const sctx = sample.getContext('2d', { willReadFrequently:true, alpha:false });
      sctx.drawImage(source, 0, 0);
      const before = sctx.getImageData(0,0,sample.width,sample.height).data;
      const after = canvas.getContext('2d', { willReadFrequently:true, alpha:false })
        .getImageData(0,0,canvas.width,canvas.height).data;
      const x0 = Math.max(0, Math.floor(face.x + face.width * 0.18));
      const y0 = Math.max(0, Math.floor(face.y + face.height * 0.16));
      const x1 = Math.min(canvas.width, Math.ceil(face.x + face.width * 0.82));
      const y1 = Math.min(canvas.height, Math.ceil(face.y + face.height * 0.84));
      let sum=0,count=0;
      for(let y=y0;y<y1;y++){
        for(let x=x0;x<x1;x++){
          const p=(y*canvas.width+x)*4;
          for(let channel=0;channel<3;channel++){
            sum += Math.abs(after[p+channel]-before[p+channel]);
            count++;
          }
        }
      }
      sample.width=sample.height=0;
      return count ? sum/count : 0;
    }

    const beforeMae = regionMae(output, bitmap, first);
    const guarded = mod.applyFaceIdentityGuard(output, bitmap, faces, {
      diagnosis:{ confidence:{ blur:0.75, noise:0.2, compression:0.1 } }
    }, 'deblur');
    const afterMae = regionMae(guarded.canvas, bitmap, first);

    const centerLimit = mod.faceSafetyAiLimitAt(
      first.x + first.width * 0.5,
      first.y + first.height * 0.5,
      faces
    );
    const outsideLimit = mod.faceSafetyAiLimitAt(bitmap.width - 1, bitmap.height - 1, faces);

    bitmap.close();
    await engine.dispose();

    return {
      detectorAvailable:engine.lastAvailable,
      faces:faces.map(face => ({...face})),
      modelBytes:modelBytes.byteLength,
      beforeMae,
      afterMae,
      centerLimit,
      outsideLimit,
      guardApplied:guarded.applied,
      guardCount:guarded.faceCount
    };
  });

  assert.ok(result.faces.length >= 1, `UltraFace did not detect the public face fixture: ${JSON.stringify(result)}`);
  assert.ok(result.faces.every(face =>
    face.score >= 0.65 &&
    face.width >= 18 &&
    face.height >= 18 &&
    face.x >= 0 &&
    face.y >= 0
  ), `Invalid face detection geometry: ${JSON.stringify(result.faces)}`);
  assert.equal(result.modelBytes, 1270727, 'Pinned face model byte size changed.');
  assert.equal(result.guardApplied, true, 'Face identity guard did not apply.');
  assert.ok(result.guardCount >= 1, 'Face identity guard reported no protected faces.');
  assert.ok(result.afterMae < result.beforeMae * 0.90,
    `Identity guard did not materially reduce face-region deviation: before=${result.beforeMae} after=${result.afterMae}`);
  assert.ok(result.centerLimit <= 0.66,
    `Face-center AI ceiling is too permissive: ${result.centerLimit}`);
  assert.equal(result.outsideLimit, 1, 'Non-face pixels must not be capped by face safety.');

  console.log('Image Enhancer Task 2 face identity safety audit passed.');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise(resolveServer => server.close(resolveServer));
}
