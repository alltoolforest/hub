import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {inspectApplicationPrepRelease} from './application-prep-task5-release-check.mjs';

const html=readFileSync(new URL('../documents/application-document-prep/index.html',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../site-config.json',import.meta.url),'utf8'));
const robots=readFileSync(new URL('../robots.txt',import.meta.url),'utf8');
const sitemap=readFileSync(new URL('../sitemap.xml',import.meta.url),'utf8');
const audit=(overrides={})=>inspectApplicationPrepRelease({
 html,config,robots,sitemap,...overrides
});

test('private-review version passes its scoped security/privacy/SEO gate',()=>{
 const x=audit();
 assert.equal(x.mode,'private-review');
 assert.equal(x.ready,true,x.results.filter(r=>!r.pass).map(r=>r.name).join(', '));
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/http-equiv="Content-Security-Policy"/);
 assert.match(html,/name="referrer" content="no-referrer"/);
 assert.ok(!/<link\s+[^>]*rel="canonical"[^>]*FINAL-DOMAIN/.test(html));
});
test('public launch fails until site-wide review-host blockers are resolved',()=>{
 const x=audit({publicLaunch:true});
 assert.equal(x.ready,false);
 const failed=x.results.filter(z=>!z.pass).map(z=>z.name);
 for(const expected of ['Public domain configured','Public contact configured',
  'Robots indexing enabled','Sitemap matches public tool URL',
  'Canonical points to public URL','Delivered CSP anti-framing header',
  'Delivered security headers','Review version not inadvertently advertised as public'])
  assert.ok(failed.includes(expected),expected+' must block an unverified launch');
});
test('live deployment rejects missing delivered anti-framing and transport headers',()=>{
 const domain='example.com';
 const h=html.replace('content="noindex,nofollow"','content="index,follow"')
  .replace('</head>','<link rel="canonical" href="https://example.com/documents/application-document-prep/"></head>');
 const good={domain,publicContactEmail:'contact@example.com'};
 const sitemapReady='<urlset><url><loc>https://example.com/documents/application-document-prep/</loc></url></urlset>';
 const x=audit({html:h,config:good,robots:'User-agent: *\nAllow: /',
  sitemap:sitemapReady,publicLaunch:true,deliveredHeaders:{
   'content-security-policy':"default-src 'self'; frame-ancestors 'none'",
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'permissions-policy':'camera=(), microphone=()'
  }});
 assert.equal(x.ready,true,x.results.filter(x=>!x.pass).map(x=>x.name).join(', '));
 const bad=audit({html:h,config:good,robots:'Allow: /',sitemap:sitemapReady,publicLaunch:true,
  deliveredHeaders:{'content-security-policy':"default-src 'self'"}});
 assert.equal(bad.ready,false);
});
test('CLI staging succeeds and opt-in public release always fails closed',()=>{
 const file=new URL('./application-prep-task5-release-check.mjs',import.meta.url).pathname;
 const stage=spawnSync(process.execPath,[file],{encoding:'utf8'});
 assert.equal(stage.status,0,stage.stdout+' '+stage.stderr);
 assert.match(stage.stdout,/APPLICATION_PREP_RELEASE_CHECK/);
 const live=spawnSync(process.execPath,[file],{encoding:'utf8',env:{...process.env,PUBLIC_LAUNCH:'1'}});
 assert.equal(live.status,1,live.stdout+' '+live.stderr);
 assert.match(live.stdout,/FAIL Robots indexing enabled/);
});
