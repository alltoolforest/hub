# Build a self-contained local-only diagnostic, not the production interface.
import base64,json,os,subprocess,html
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=Path(os.environ['PDF_COMPRESSOR_MOBILE_QA_OUTPUT'])
worker=out.parent/'mobile-qa-worker.mjs'
subprocess.run([str(root/'hybrid-build/node_modules/.bin/esbuild'),str(root/'tests/pdf-compressor-mobile-qa-entry.mjs'),'--bundle','--format=iife','--define:import.meta.url="https://qa.invalid/offline-worker.js"','--platform=browser','--external:node:*','--external:module','--external:fs','--external:path','--external:crypto','--outfile='+str(worker)],check=True)
b64=lambda data:base64.b64encode(data).decode('ascii')
fonts={p.name:b64(p.read_bytes()) for p in (root/'assets/vendor/standard_fonts').glob('*') if p.is_file()}
source='self.QA_WASM='+json.dumps(b64((root/'assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.wasm').read_bytes()))+';self.QA_FONTS='+json.dumps(fonts)+';'+worker.read_text()
script="const workerSource="+json.dumps(b64(source.encode()))+";"+r"""
const el=id=>document.getElementById(id);let running=null,url=null,sourceFile=null,started=0,ticks=0,maxGap=0,last=0,generation=0,workerUrl=null;
const timer=setInterval(()=>{if(running){const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;ticks++;el('status').textContent='Processing: '+Math.round((now-started)/1000)+' seconds';}},250);
const clean=()=>{generation++;el('file').disabled=false;el('mode').disabled=false;running?.terminate();running=null;if(workerUrl){URL.revokeObjectURL(workerUrl);workerUrl=null;}el('run').disabled=!sourceFile;el('cancel').disabled=true;};
el('file').onchange=()=>{clean();sourceFile=el('file').files[0];el('run').disabled=!sourceFile;el('status').textContent=sourceFile?'Ready: '+sourceFile.name:'Select a PDF';el('download').hidden=true;};
el('cancel').onclick=()=>{clean();el('download').hidden=true;el('status').textContent='Cancelled. The original file is unchanged.';};
el('run').onclick=async()=>{if(running||!sourceFile)return;if(url){URL.revokeObjectURL(url);url=null;}el('download').hidden=true;el('status').textContent='Processing: starting';el('report').textContent='';el('run').disabled=true;el('cancel').disabled=false;el('file').disabled=true;el('mode').disabled=true;const token=++generation,runMode=el('mode').value;
try{const bytes=new Uint8Array(await sourceFile.arrayBuffer());if(token!==generation)return;const inputLength=bytes.length;const blob=new Blob([Uint8Array.from(atob(workerSource),c=>c.charCodeAt(0))],{type:'text/javascript'});workerUrl=URL.createObjectURL(blob);running=new Worker(workerUrl);started=last=performance.now();ticks=0;maxGap=0;
running.onerror=e=>{if(token!==generation)return;clean();el('status').textContent='Test failed: '+e.message;};
running.onmessage=e=>{if(token!==generation)return;if(typeof e.data?.ok!=='boolean')return;const response=e.data;clean();if(!response.ok){el('status').textContent='Test failed safely: '+response.error;el('report').textContent=response.diagnostic??'';return;}const result=response.result;url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));el('download').href=url;el('download').download='compressor-test-'+runMode+'.pdf';el('download').hidden=false;el('status').textContent='Completed: '+result.bytes.length+' bytes. Engine time: '+response.elapsedMs+' ms.';el('report').textContent=JSON.stringify({mode:runMode,engineMs:response.elapsedMs,inputBytes:inputLength,outputBytes:result.bytes.length,uiTicks:ticks,maxUiGapMs:Math.round(maxGap),deviceMemoryHintGB:navigator.deviceMemory??null,hardwareConcurrency:navigator.hardwareConcurrency??null,userAgent:navigator.userAgent,note:'Device memory is a capability hint, not measured peak process memory.'},null,2);};running.postMessage({bytes,mode:runMode},[bytes.buffer]);
}catch(error){clean();el('status').textContent='Test failed safely: '+error.message;}};
addEventListener('pagehide',()=>{clean();if(url)URL.revokeObjectURL(url);clearInterval(timer);});
"""
html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PDF Compressor mobile engine test</title><style>[hidden]{display:none!important}body{font:16px system-ui;max-width:700px;margin:24px auto;padding:16px;background:#f5f7f5}button,select,input{font:inherit;min-height:48px;margin:8px 0;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{display:block;padding:16px;background:white}</style><h1>PDF Compressor engine test</h1><p>Isolated diagnostic. Processing stays on this device. Keep the original PDF. This is not the production tool.</p><label for="file">Select a PDF</label><input id="file" type="file" accept="application/pdf"><label for="mode">Compression mode</label><select id="mode"><option value="balanced">Balanced</option><option value="strong">Strong</option><option value="lossless">Lossless</option></select><button id="run" disabled>Run engine test</button><button id="cancel" disabled>Cancel test</button><p id="status" role="status" aria-live="polite">Select a PDF</p><a id="download" hidden>Download test output</a><pre id="report"></pre><p>If the page crashes, record your phone model, browser, file and selected mode. Results here do not automatically approve launch.</p><script>'+script+'</script></html>'
notices=[]
for path in [root/'node_modules/pdfjs-dist/LICENSE',*(root/'assets/js/pdf-compressor-v2/vendor/qpdf').glob('*LICENSE*'),*(root/'assets/js/pdf-compressor-v2/vendor/qpdf').glob('*NOTICE*')]:
 if path.is_file():notices.append(path.name+'\n'+path.read_text())
html=html.replace('</html>','<details><summary>Dependency notices</summary><pre>'+__import__('html').escape('\n\n'.join(notices))+'</pre></details></html>')
out.write_text(html)
print(out, out.stat().st_size)
