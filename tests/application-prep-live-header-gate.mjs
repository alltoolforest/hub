// HTTP-response release gate. Source-code _headers or HTML meta are not substitutes.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function auditLiveResponse({url,status,headers,html}, {review=true,noUnsafeEval=false}={}){
 const h=Object.fromEntries(Object.entries(headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
 const csp=h['content-security-policy']||'';
 const findings=[];
 const check=(name,pass)=>findings.push({name,pass:Boolean(pass)});
 let target=null;try{target=new URL(url);}catch{}
 check('HTTPS document response',status===200&&target?.protocol==='https:');
 check('Page HTML supplied',/application\s+photo/i.test(html||'')&&/<meta\s+http-equiv="Content-Security-Policy"/i.test(html||''));
 check('HTTP nosniff',h['x-content-type-options']?.toLowerCase()==='nosniff');
 check('HTTP frame protection',/frame-ancestors\s+'none'/.test(csp) &&
   h['x-frame-options']?.toLowerCase()==='deny');
 check('HTTP no-object and base policy',/object-src\s+'none'/.test(csp)&&
   /base-uri\s+'self'/.test(csp));
 check('HTTP no off-origin file communication',/connect-src\s+'self'\s+blob:/.test(csp)&&
   !/connect-src[^;]*https?:\/\//.test(csp));
 check('HTTP no third-party scripts',/script-src\s+'self'/.test(csp));
 check('HTTP referrer privacy',h['referrer-policy']?.toLowerCase()==='no-referrer');
 check('HTTP camera and microphone denied',/camera=\(\)/.test(h['permissions-policy']||'')&&
   /microphone=\(\)/.test(h['permissions-policy']||''));
 if(review)check('Non-indexable private review',/noindex/.test((h['x-robots-tag']||'').toLowerCase())&&
    /name="robots" content="noindex,nofollow"/.test(html||''));
 if(noUnsafeEval)check('Script eval forbidden after decoder replacement',!/script-src[^;]*'unsafe-eval'/.test(csp));
 return {ready:findings.every(x=>x.pass),findings};
}
async function main(){
 const url=process.env.SECURE_REVIEW_URL;
 if(!url){console.error('SECURE_REVIEW_URL is required; no live header audit performed.');process.exitCode=1;return;}
 const target=new URL(url);
 if(target.protocol!=='https:')throw Error('Refusing non-HTTPS security review');
 const response=await fetch(target,{redirect:'follow',signal:AbortSignal.timeout(20000)});
 const final=new URL(response.url);
 if(target.origin!==final.origin)throw Error('Security-review URL redirected to another origin; review the final host separately');
 const result=auditLiveResponse({
  url:response.url,status:response.status,
  headers:Object.fromEntries(response.headers.entries()),
  html:await response.text()
 },{review:process.env.PUBLIC_LAUNCH!=='1',noUnsafeEval:process.env.HEIC_EVAL_REMOVED==='1'});
 for(const item of result.findings)console.log((item.pass?'PASS ':'FAIL ')+item.name);
 console.log('APPLICATION_PREP_HTTP_SECURITY_GATE '+JSON.stringify({url:response.url,...result}));
 if(!result.ready)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
