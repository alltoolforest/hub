# Build a self-contained local-only diagnostic, not the production interface.
import base64,json,os,subprocess,html
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=Path(os.environ['PDF_COMPRESSOR_MOBILE_QA_OUTPUT'])
out.parent.mkdir(parents=True,exist_ok=True)
candidate=os.environ.get('PDF_COMPRESSOR_CANDIDATE')=='1'
worker=out.parent/'mobile-qa-worker.mjs'
subprocess.run([os.environ.get('PDF_COMPRESSOR_ESBUILD',str(root/'node_modules/.bin/esbuild')),str(root/'tests/pdf-compressor-mobile-qa-entry.mjs'),'--bundle','--format=iife','--define:import.meta.url="https://qa.invalid/offline-worker.js"','--platform=browser','--external:node:*','--external:module','--external:fs','--external:path','--external:crypto','--outfile='+str(worker)],check=True)
b64=lambda data:base64.b64encode(data).decode('ascii')
fonts={p.name:b64(p.read_bytes()) for p in (root/'assets/vendor/standard_fonts').glob('*') if p.is_file()}
source='self.QA_WASM='+json.dumps(b64((root/'assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.wasm').read_bytes()))+';self.QA_FONTS='+json.dumps(fonts)+';'+worker.read_text()
app=out.parent/'mobile-qa-app.js'
subprocess.run([os.environ.get('PDF_COMPRESSOR_ESBUILD',str(root/'node_modules/.bin/esbuild')),str(root/('tests/pdf-compressor-candidate-app.mjs' if candidate else 'tests/pdf-compressor-mobile-qa-app.mjs')),'--bundle','--format=iife','--platform=browser','--outfile='+str(app)],check=True)
script='globalThis.QA_WORKER_SOURCE='+json.dumps(b64(source.encode()))+';'+app.read_text()
html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PDF Compressor mobile engine test</title><style>[hidden]{display:none!important}body{overflow-wrap:anywhere;font:16px system-ui;max-width:700px;margin:24px auto;padding:16px;background:#f5f7f5}button,select,input{font:inherit;min-height:48px;margin:8px 0;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{display:block;padding:16px;background:white}</style><h1>PDF Compressor engine test</h1><p>Isolated diagnostic. Processing stays on this device. Keep the original PDF. This is not the production tool.</p><p id="limit"></p><label for="file">Select a PDF</label><input id="file" type="file" accept="application/pdf"><label for="mode">Compression mode</label><select id="mode"><option value="balanced">Balanced</option><option value="strong">Strong</option><option value="lossless">Lossless</option></select><button id="run" disabled>Run engine test</button><button id="cancel" disabled>Cancel test</button><button id="reset">Clear test</button><p id="source"></p><p id="status" role="status" aria-live="polite">Select a PDF</p><a id="download" hidden>Download test output</a><pre id="report"></pre><p>If the page crashes, record your phone model, browser, file and selected mode. Results here do not automatically approve launch.</p><script>'+script+'</script></html>'
if candidate:
 html=(root/'docs/pdf-compressor/release-candidate-content.html').read_text()
 html=html.replace('<h1>PDF Compressor</h1>','<div id="compressor"><h1>PDF Compressor</h1></div>')
 css=(root/'assets/js/pdf-compressor-v2/compressor-ui.css').read_text()
 html=html.replace('</head>','<style>body{font:16px system-ui;max-width:48rem;margin:24px auto;padding:16px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}'+css+'</style></head>')
 html=html.replace('</body>','<script>'+script+'</script></body>')
notices=[]
for path in [root/'node_modules/pdfjs-dist/LICENSE',root/'assets/js/pdf-compressor-v2/vendor/pdf-lib/LICENSE.md',*(root/'assets/js/pdf-compressor-v2/vendor/qpdf').glob('*LICENSE*'),*(root/'assets/js/pdf-compressor-v2/vendor/qpdf').glob('*NOTICE*')]:
 if path.is_file():notices.append(path.name+'\n'+path.read_text())
html=html.replace('</body>' if candidate else '</html>','<details><summary>Dependency notices</summary><pre>'+__import__('html').escape('\n\n'.join(notices))+'</pre></details>'+('</body>' if candidate else '</html>'))
out.write_text(html)
print(out, out.stat().st_size)
