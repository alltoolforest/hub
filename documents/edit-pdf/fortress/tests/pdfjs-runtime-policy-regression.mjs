import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  PDFJS_VERSION,
  MODERN_MODULE_PATH,
  LEGACY_MODULE_PATH,
  LEGACY_WORKER_PATH,
  classifyBrowserIdentity,
  prefersLegacyPdfjs,
  pdfjsRuntimePolicy,
} from '../src/rendering/pdfjs.js';

const cases=[];
const test=async(name,fn)=>{await fn();cases.push({name,ok:true});};

await test('pinned runtime policy contains no external CDN',async()=>{
  const policy=pdfjsRuntimePolicy();
  assert.equal(policy.version,'6.3.289');
  assert.equal(policy.externalRuntime,false);
  for(const value of [policy.modernModule,policy.legacyModule,policy.legacyWorker]){
    assert.ok(!/^https?:/i.test(value),`External runtime path found: ${value}`);
  }
});

await test('local modern and legacy runtime files exist',async()=>{
  const sourceUrl=new URL('../src/rendering/pdfjs.js',import.meta.url);
  for(const relative of [MODERN_MODULE_PATH,LEGACY_MODULE_PATH,LEGACY_WORKER_PATH]){
    await access(fileURLToPath(new URL(relative,sourceUrl)));
  }
});

await test('iPhone Safari selects legacy runtime',async()=>{
  const identity=classifyBrowserIdentity({
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    platform:'iPhone',maxTouchPoints:5,
  });
  assert.equal(identity.ios,true);
  assert.equal(prefersLegacyPdfjs(identity),true);
});

await test('iPad desktop-mode Safari selects legacy runtime',async()=>{
  const identity=classifyBrowserIdentity({
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
    platform:'MacIntel',maxTouchPoints:5,
  });
  assert.equal(identity.ios,true);
  assert.equal(prefersLegacyPdfjs(identity),true);
});

await test('desktop Safari selects legacy runtime',async()=>{
  const identity=classifyBrowserIdentity({
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
    platform:'MacIntel',maxTouchPoints:0,
  });
  assert.equal(identity.safari,true);
  assert.equal(prefersLegacyPdfjs(identity),true);
});

await test('Chrome and Firefox remain on modern-first path',async()=>{
  const chrome=classifyBrowserIdentity({userAgent:'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',platform:'Win32'});
  const firefox=classifyBrowserIdentity({userAgent:'Mozilla/5.0 Gecko/20100101 Firefox/142.0',platform:'Win32'});
  assert.equal(prefersLegacyPdfjs(chrome),false);
  assert.equal(prefersLegacyPdfjs(firefox),false);
});

console.log(`PASS ${cases.length}/${cases.length}`);
for(const item of cases)console.log(`✓ ${item.name}`);
