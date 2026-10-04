const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
test('incorrect model bytes cannot reach graph decoder or runtime',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'enhancer-probe-'));
  try {
    const file=path.join(dir,'untrusted.onnx');writeFileSync(file,'not a model');
    const r=spawnSync(process.execPath,[path.join(__dirname,'probe.cjs'),file,'0'.repeat(64)],{encoding:'utf8',env:{...process.env,ONNX_SCHEMA_PATH:'/nonexistent',ORT_PACKAGE_PATH:'/nonexistent'}});
    assert.equal(r.status,1);assert.match(r.stderr,/Model hash mismatch/);assert.doesNotMatch(r.stderr,/Cannot find module/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('expected hash is mandatory',()=>{
  const r=spawnSync(process.execPath,[path.join(__dirname,'probe.cjs')],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/Usage:/);
});
