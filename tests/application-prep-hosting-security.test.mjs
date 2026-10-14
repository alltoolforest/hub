import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const policy=readFileSync(new URL('../security/application-prep/hosting/cloudflare-pages/_headers',import.meta.url),'utf8');
const groups=policy.split(/\r?\n(?=\/(?:hub\/)?documents\/application-document-prep\/\*)/).map(g=>g.trim()).filter(g=>g.startsWith('/'));
test('headers apply only to Application Document Prep; never global frozen tools',()=>{
 const patterns=policy.split('\n').filter(s=>s.startsWith('/'));
 assert.deepEqual(patterns,[
  '/documents/application-document-prep/*',
  '/hub/documents/application-document-prep/*'
 ]);
 for(const forbidden of ['/work/','/calculators/','/images/','/documents/edit-pdf/','/*']){
  assert.ok(!patterns.includes(forbidden));
 }
});
test('each hosting policy requires real anti-framing and privacy controls',()=>{
 assert.equal(groups.length,2);
 for(const g of groups){
  for(const [name,pattern] of Object.entries({
   'nosniff':/X-Content-Type-Options: nosniff/,
   'frame':/X-Frame-Options: DENY/,
   'CSP frame-ancestors':/frame-ancestors 'none'/,
   'CSP network':/connect-src 'self' blob:/,
   'no HTTP third parties':/default-src 'self'/,
   'privacy referrer':/Referrer-Policy: no-referrer/,
   'microphone denied':/microphone=\(\)/,
   'review noindex':/X-Robots-Tag: noindex, nofollow/
  }))assert.match(g,pattern,name);
 }
});
test('policy must identify legacy HEIC unsafe-eval as scoped, temporary exception',()=>{
 assert.match(policy,/current HEIC decoder still needs unsafe-eval/);
 for(const g of groups)assert.match(g,/script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:/);
});
