"""Build reproducible same-origin V3 worker; never include lab permit-all stubs.
Output bundle is CI-only until reviewed atomic publication on release branch.
"""
import base64,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
dst=root/'assets/js/pdf-compressor-v3/dist'
dst.mkdir(parents=True,exist_ok=True)
entry=root/'tests/pdf-compressor-v3-release-worker-entry.mjs'
temp=dst/'worker-entry.js'
subprocess.run([
 str(root/'node_modules/.bin/esbuild'),str(entry),'--bundle','--format=iife',
 '--platform=browser','--target=es2022',
 '--define:import.meta.url="https://offline.invalid/v3-worker.js"',
 '--outfile='+str(temp)
],check=True)
fonts={p.name:base64.b64encode(p.read_bytes()).decode('ascii')
 for p in (root/'assets/vendor/standard_fonts').glob('*') if p.is_file()}
text='self.V3_FONTS='+json.dumps(fonts,separators=(',',':'))+';\n'+temp.read_text()
assert 'inspectV3Source' in text and 'consentToFlatten' in text
assert 'V3_FONTS' in text
assert 'v3-benchmark' not in text and 'self.QA_WASM=' not in text
worker=dst/'worker.js'
worker.write_text(text)
temp.unlink()
digest=hashlib.sha256(worker.read_bytes()).hexdigest()
(dst/'worker.sha256').write_text(digest+'  worker.js\n')
print('V3 worker',worker.stat().st_size,'bytes SHA256',digest)
