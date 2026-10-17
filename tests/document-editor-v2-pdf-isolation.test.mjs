import test from 'node:test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const candidate = path.join(root,'documents/document-editor-v2-lab/pdf-engine');
async function files(directory) {
  const entries = await fs.readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory,entry.name)) : path.join(directory,entry.name)))).flat();
}
test('frozen PDF product sources still match the copied baseline', async () => {
  const baseline = JSON.parse(await fs.readFile(path.join(candidate,'source-baseline.json'),'utf8'));
  for (const [name,hash] of Object.entries(baseline.sha256)) {
    const bytes = await fs.readFile(path.join(root,baseline.source,name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name);
  }
});
test('copied PDF modules resolve locally and do not import frozen product logic', async () => {
  for (const file of [...await files(path.join(candidate,'fortress/src')),...await files(path.join(candidate,'ocr'))]) {
    if (!file.endsWith('.js')) continue;
    const text = await fs.readFile(file,'utf8');
    for (const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1].split('?')[0];
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file),specifier);
      await fs.access(resolved);
      assert.ok(resolved.startsWith(candidate + path.sep) || resolved.startsWith(path.join(root,'documents/edit-pdf/fortress/vendor') + path.sep),`${file}: ${specifier}`);
    }
  }
});
test('PDF preview is noindex and resolves local links and styles', async () => {
  const file=path.join(candidate,'index.html');
  const html=await fs.readFile(file,'utf8');
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(html,/rel="canonical"/);
  for(const match of html.matchAll(/href="(\.[^"]+)"/g)) await fs.access(path.resolve(candidate,match[1].split('?')[0]));
});
test('copied native loader rejects encryption and accepts an ordinary PDF', async () => {
  globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
  const {PDFDocument} = await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/pdf-lib.js');
  const {loadPdfForEditing} = await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/pdf-loader.js');
  const pdf=await PDFDocument.create();pdf.addPage([200,200]);
  assert.equal((await loadPdfForEditing(await pdf.save())).pageCount,1);
  // An encryption dictionary must be refused even when the parser can read the file.
  pdf.context.trailerInfo.Encrypt=pdf.context.register(pdf.context.obj({Filter:'Standard'}));
  const encrypted=await pdf.save({useObjectStreams:false});
  await assert.rejects(()=>loadPdfForEditing(encrypted),error=>error.code==='PDF_ENCRYPTED_UNSUPPORTED');
});
