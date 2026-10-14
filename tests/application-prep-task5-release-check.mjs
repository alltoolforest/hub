// Task 5 release gate: audit this tool without changing global launch/indexing settings.
// Staging can pass scoped checks while PUBLIC_LAUNCH=1 must hard-fail until public
// configuration, indexing, canonical and delivered HTTP headers are independently verified.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const tag=(html,key)=>html.match(new RegExp('<meta\\s+[^>]*'+key+'[^>]*>','i'))?.[0]||'';
const has=(s,re)=>re.test(s);

export function inspectApplicationPrepRelease({
 html,config,robots,sitemap,deliveredHeaders=null,publicLaunch=false,legacyHeicEvalAccepted=false
}){
 const results=[];
 const check=(name,pass,reason)=>results.push({name,pass:Boolean(pass),reason});
 const path='/documents/application-document-prep/';
 const domain=String(config?.domain||'').trim();
 const domainOK=Boolean(domain)&&/^[a-z0-9.-]+$/i.test(domain)&&!domain.includes('FINAL-DOMAIN')&&
  !domain.startsWith('.')&&!domain.endsWith('.');
 const canonical=html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i)?.[0]||'';
 const robotsMeta=tag(html,'name=["\\x27]robots');
 const csp=tag(html,'http-equiv=["\\x27]Content-Security-Policy');
 const insecureScripts=/<script\s+(?:[^>]*\s)?src=["']https?:\/\//i.test(html);
 const publicURL=domainOK?'https://'+domain+path:'';
 const hdr={};
 if(deliveredHeaders)for(const [key,value] of Object.entries(deliveredHeaders))
  hdr[key.toLowerCase()]=String(value).toLowerCase();
 check('Page-scoped browser CSP',has(csp,/default-src\s+['"]?self/i)&&
  has(csp,/object-src\s+['"]?none/i)&&has(csp,/connect-src\s+['"]?self/i)&&
  !has(csp,/connect-src[^;"<>]*https?:/i),'Restricts connections to this site and forbids plugin objects.');
 check('No remote script sources',!insecureScripts,'Tool page must load its scripts from the same site.');
 check('Specific privacy disclosure',html.includes('Uploaded image content is not sent')&&
  html.includes('website host still receives ordinary requests'),'Avoid claims that normal hosting access logs do not exist.');
 check('Page SEO basics',has(html,/<title>[^<]*Application Photo/i)&&
  has(html,/<meta name="description" content="[^"]{85,200}"/i)&&
  has(html,/<h1>Application Photo/i),'Static title, description and visible page heading.');
 check('Review version not inadvertently advertised as public',!publicLaunch?
  has(robotsMeta,/noindex/i):!has(robotsMeta,/noindex|nofollow/i),
  publicLaunch?'Public page must remove staging noindex.':'Review build must stay noindex.');
 if(publicLaunch){
  check('Legacy HEIC evaluator exception approved',
    !/script-src[^;"<>]*'unsafe-eval'/i.test(csp)||legacyHeicEvalAccepted,
    'Bundled HEIC conversion needs a page-scoped unsafe-eval exception; security reviewer must explicitly accept it or approve decoder migration.');
  check('Public domain configured',domainOK,'site-config.json domain must be set to a real hostname.');
  check('Public contact configured',/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config?.publicContactEmail||''),
    'Public contact is necessary before launch; do not invent an address.');
  check('Robots indexing enabled',!/^\s*Disallow:\s*\/\s*$/mi.test(robots),
    'Root-wide Disallow: / remains active on review hosting.');
  check('Sitemap matches public tool URL',Boolean(publicURL)&&sitemap.includes('<loc>'+publicURL+'</loc>')&&
    !sitemap.includes('FINAL-DOMAIN'),'Public sitemap must contain the final canonical domain.');
  check('Canonical points to public URL',Boolean(publicURL)&&
    canonical.includes('href="'+publicURL+'"'),'Use the definitive published domain in the static canonical.');
  const cspHeader=hdr['content-security-policy']||'';
  check('Delivered CSP anti-framing header',/frame-ancestors\s+'none'/.test(cspHeader)||
    hdr['x-frame-options']==='deny','HTML meta CSP cannot protect against framing.');
  check('Delivered security headers',hdr['x-content-type-options']==='nosniff'&&
    Boolean(hdr['referrer-policy'])&&Boolean(hdr['permissions-policy']),
    'Actual HTTP response must include headers; repository _headers file alone does not prove delivery.');
 }else{
  check('Public-launch gate active',true,
    'Staging is not approved for production indexing; PUBLIC_LAUNCH=1 rechecks domain, headers and robots.');
 }
 return {ready:results.every(x=>x.pass),mode:publicLaunch?'public-launch':'private-review',results};
}
async function main(){
 const publicLaunch=process.env.PUBLIC_LAUNCH==='1';
 const html=read('documents/application-document-prep/index.html');
 const config=JSON.parse(read('site-config.json'));
 const robots=read('robots.txt'),sitemap=read('sitemap.xml');
 let deliveredHeaders=null;
 const domain=String(config.domain||'').trim();
 if(publicLaunch&&/^[a-z0-9.-]+$/i.test(domain)&&!domain.includes('FINAL-DOMAIN')){
  try{
   const reply=await fetch('https://'+domain+'/documents/application-document-prep/',{
    method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(10000)
   });
   deliveredHeaders=Object.fromEntries(reply.headers.entries());
   if(!reply.ok)throw Error('HTTP '+reply.status);
  }catch(error){
   console.error('Could not verify live hosting response headers:',error.message);
  }
 }
 const result=inspectApplicationPrepRelease({html,config,robots,sitemap,publicLaunch,deliveredHeaders,
  legacyHeicEvalAccepted:process.env.HEIC_LEGACY_EVAL_APPROVED==='1'});
 for(const item of result.results)console.log((item.pass?'PASS':'FAIL')+' '+item.name+' — '+item.reason);
 console.log('APPLICATION_PREP_RELEASE_CHECK '+JSON.stringify({
  mode:result.mode,ready:result.ready,
  failed:result.results.filter(x=>!x.pass).map(x=>x.name)
 }));
 if(!result.ready)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 await main();
