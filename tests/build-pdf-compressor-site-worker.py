"""Build the exact pinned PDF Compressor worker for staged route verification.

This stage-only task writes a self-contained worker; no production deploy and
no changes to frozen tools. The artifact must be reviewed and version-pinned
before publishing to an approved hosting origin.
"""
import base64,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=root/'assets/js/pdf-compressor-v2/dist'
out.mkdir(parents=True,exist_ok=True)
tmp=out/'worker-entry-bundled.js'
esbuild=os.environ.get('PDF_COMPRESSOR_ESBUILD',str(root/'node_modules/.bin/esbuild'))
subprocess.run([esbuild,str(root/'tests/pdf-compressor-mobile-qa-entry.mjs'),
 '--bundle','--format=iife','--platform=browser',
 '--define:import.meta.url="https://qa.invalid/offline-worker.js"',
 '--external:node:*','--external:module','--external:fs','--external:path',
 '--external:crypto','--outfile='+str(tmp)],check=True)
b64=lambda content:base64.b64encode(content).decode('ascii')
wasm=(root/'assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.wasm').read_bytes()
fonts={p.name:b64(p.read_bytes()) for p in
 (root/'assets/vendor/standard_fonts').glob('*') if p.is_file()}
source='self.QA_WASM='+json.dumps(b64(wasm))+';self.QA_FONTS='+json.dumps(fonts)+';'+tmp.read_text()
artifact=out/'worker.js'
artifact.write_text(source)
tmp.unlink()
import hashlib
sha=hashlib.sha256(artifact.read_bytes()).hexdigest()
(out/'worker.sha256').write_text(sha+'  worker.js\n')
print('PDF Compressor staged integrated worker bytes:',artifact.stat().st_size)
print('PDF Compressor staged integrated worker sha256:',sha)
