import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLiveResponse} from './application-prep-live-header-gate.mjs';
const url='https://review.example.com/documents/application-document-prep/';
const html='<title>Application Photo Resizer</title><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src self">';
const headers={
 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-eval' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
 'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'X-Robots-Tag':'noindex, nofollow'
};
test('a host serving actual strict HTTP protection passes review gate',()=>{
 const x=auditLiveResponse({url,status:200,headers,html});
 assert.equal(x.ready,true,JSON.stringify(x.findings.filter(z=>!z.pass)));
});
test('GitHub Pages-style missing headers fail closed even when HTML contains CSP',()=>{
 const x=auditLiveResponse({url,status:200,headers:{},html});
 assert.equal(x.ready,false);
 assert.ok(x.findings.filter(r=>!r.pass).length>=4);
});
test('eval-free gate detects temporary HEIC decoder exception',()=>{
 const blocked=auditLiveResponse({url,status:200,headers,html},{noUnsafeEval:true});
 assert.equal(blocked.ready,false);
 assert.ok(blocked.findings.some(x=>x.name.includes('Script eval')&&!x.pass));
 const secure={...headers,'Content-Security-Policy':headers['Content-Security-Policy'].replace(" 'unsafe-eval'",'')};
 assert.equal(auditLiveResponse({url,status:200,headers:secure,html},{noUnsafeEval:true}).ready,true);
});
test('the gate catches frame-only policy and noindex without X-Robots-Tag',()=>{
 const weak={...headers};
 delete weak['X-Frame-Options'];
 delete weak['X-Robots-Tag'];
 assert.equal(auditLiveResponse({url,status:200,headers:weak,html}).ready,false);
});
