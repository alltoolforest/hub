// Development-only asset provisioning. Run from a network-enabled checkout.
// No runtime CDN fallback, no package installation scripts, no automatic commit.
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const target=join(root,'assets/vendor/scanned-pdf-ocr');
const scratch=mkdtempSync(join(tmpdir(),'atf-ocr-'));
const spec='@tesseract.js-data/eng@1.0.0';
const registry='https://registry.npmjs.org/';
const hash=(data,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(data).digest(encoding);
function npm(args){
 const opts={cwd:scratch,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']};
 if(process.platform==='win32'){
   // Arguments are fixed literals or the fixed package spec, never user input.
   return execFileSync('cmd.exe',['/d','/s','/c','npm '+args.join(' ')],opts);
 }
 return execFileSync('npm',args,opts);
}
try{
 const expected=JSON.parse(npm(['view',spec,'dist.integrity','--json','--registry='+registry])).trim();
 if(!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(expected))throw Error('Expected a SHA-512 package integrity value.');
 const packed=JSON.parse(npm(['pack',spec,'--ignore-scripts','--json','--registry='+registry]))[0];
 const archive=join(scratch,packed.filename);
 const bytes=readFileSync(archive);
 if('sha512-'+hash(bytes,'sha512','base64')!==expected)throw Error('Package integrity verification failed.');
 const extract=path=>execFileSync('tar',['-xOf',archive,path],{maxBuffer:32*1024*1024,timeout:30000});
 const pkg=JSON.parse(extract('package/package.json').toString('utf8'));
 if(pkg.name!=='@tesseract.js-data/eng'||pkg.version!=='1.0.0')throw Error('Unexpected package identity.');
 const model=extract('package/4.0.0_best_int/eng.traineddata.gz');
 if(model.length<100000||gunzipSync(model,{maxOutputLength:32*1024*1024}).length<100000)throw Error('Invalid language model.');
 let license;
 for(const name of ['LICENSE','LICENSE.txt','LICENSE.md','license','license.txt']){try{license=extract('package/'+name);break}catch{}}
 // Preserve upstream package license text if present. Otherwise fail closed until it is supplied.
 if(!license?.length)throw Error('Upstream package license text not found. Review licensing before redistribution.');
 const manifest={package:spec,registry,packageIntegrity:expected,model:'4.0.0_best_int/eng.traineddata.gz',modelSha256:hash(model),modelBytes:model.length,packageLicense:pkg.license};
 mkdirSync(target,{recursive:true});
 for(const [name,data] of [['eng.traineddata.gz',model],['LICENSE.upstream.txt',license],['provenance.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]]){
  const dest=join(target,name);
  if(existsSync(dest)&&!readFileSync(dest).equals(data))throw Error('Refusing to overwrite a different existing asset: '+name);
 }
 for(const [name,data] of [['eng.traineddata.gz',model],['LICENSE.upstream.txt',license],['provenance.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]])writeFileSync(join(target,name),data);
 console.log(JSON.stringify(manifest,null,2));
}catch(error){console.error('Provisioning failed: '+error.message);process.exitCode=1;}
finally{rmSync(scratch,{recursive:true,force:true});}
