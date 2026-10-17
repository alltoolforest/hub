// Verify immutable development runtime bytes against reviewed provenance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../assets/js/pdf-compressor-v2/vendor/qpdf/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
assert.equal(manifest.qpdf,'12.4.2');
assert.equal(manifest.sources.qpdf,'4eba95899886e851cc41d76886483b347612f2a8');
for(const [name,expected] of Object.entries(manifest.files)){
  const bytes=await readFile(new URL(name,root));
  assert.equal(bytes.length,expected.bytes,name+' length');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256,name+' hash');
}
assert.equal(manifest.files['qpdf.mjs'].sha256,'c5cc483241f550c59cb30e90f8f255bf912471677e82bcc9f5a809ee6eac6e7d');
assert.equal(manifest.files['qpdf.wasm'].sha256,'94848c766852383eee15dc84a51a5699e9b4fb9a04e7ccfafc4bdf2fd02bc34e');
console.log('Pinned source-built qpdf development runtime hashes verified.');
