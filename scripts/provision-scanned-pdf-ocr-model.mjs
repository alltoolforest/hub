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
const packageIntegrity='sha512-mbTumm6KQPUHyzTPQaF3ObXYnx0SqqfV2nabqFVQBwD6Kl7PhGSLSzOlfFTWy0P3BjghaSKA2W9GB19Jk+ZcTg==';
const modelSha256='45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91';
const licenseSha256='a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9';
const modelSource='https://github.com/naptha/tessdata/blob/b86746569320a6103cea84cc2b8d9ee74f0f45d3/4.0.0_best_int/eng.traineddata.gz';
const licenseSource='https://github.com/tesseract-ocr/tessdata_best/blob/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE';
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
 if(expected!==packageIntegrity)throw Error('Registry integrity differs from the pinned package.');
 const packed=JSON.parse(npm(['pack',spec,'--ignore-scripts','--json','--registry='+registry]))[0];
 const archive=join(scratch,packed.filename);
 const bytes=readFileSync(archive);
 if('sha512-'+hash(bytes,'sha512','base64')!==expected)throw Error('Package integrity verification failed.');
 const extract=path=>execFileSync('tar',['-xOf',archive,path],{maxBuffer:32*1024*1024,timeout:30000});
 const pkg=JSON.parse(extract('package/package.json').toString('utf8'));
 if(pkg.name!=='@tesseract.js-data/eng'||pkg.version!=='1.0.0')throw Error('Unexpected package identity.');
 const model=extract('package/4.0.0_best_int/eng.traineddata.gz');
 if(model.length<100000||gunzipSync(model,{maxOutputLength:32*1024*1024}).length<100000)throw Error('Invalid language model.');
 if(hash(model)!==modelSha256)throw Error('Language model checksum verification failed.');
 // The npm archive omits a license file. Preserve the license of the upstream
 // tessdata_best submodule from which Naptha produced the integerized model.
 const license=readFileSync(join(target,'LICENSE.upstream.txt'));
 if(hash(license)!==licenseSha256)throw Error('Upstream license checksum verification failed.');
 const manifest={package:spec,registry,packageIntegrity,model:'4.0.0_best_int/eng.traineddata.gz',
  modelSha256,modelBytes:model.length,modelSource,licenseSource,licenseSha256,
  packageLicense:pkg.license,modelLicense:'Apache-2.0'};
 mkdirSync(target,{recursive:true});
 for(const [name,data] of [['eng.traineddata.gz',model],['LICENSE.upstream.txt',license],['provenance.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]]){
  const dest=join(target,name);
  if(existsSync(dest)&&!readFileSync(dest).equals(data))throw Error('Refusing to overwrite a different existing asset: '+name);
 }
 for(const [name,data] of [['eng.traineddata.gz',model],['LICENSE.upstream.txt',license],['provenance.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]])writeFileSync(join(target,name),data);
 console.log(JSON.stringify(manifest,null,2));
}catch(error){console.error('Provisioning failed: '+error.message);process.exitCode=1;}
finally{rmSync(scratch,{recursive:true,force:true});}
