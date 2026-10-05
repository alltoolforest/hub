"""Diagnostic native-ORT comparison of the exact pinned NAFNet artifact."""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('model');p.add_argument('directory');p.add_argument('output');a=p.parse_args()
assert hashlib.sha256(Path(a.model).read_bytes()).hexdigest()=='05b455663115b19de4577d7d092bcd52f34b51517a83c1679cf28a31f4078204'
s=ort.InferenceSession(a.model,providers=['CPUExecutionProvider']);rows=[]
for route in ['deblur','cleanup-deblur']:
 root=Path(a.directory);prefix='nasa-088-motion-'+route
 x=np.asarray(Image.open(root/(prefix+'-model-input.png')).convert('RGB'),dtype=np.float32)/255
 h,w=x.shape[:2];t=np.pad(x,((0,(-h)%16),(0,(-w)%16),(0,0)),mode='edge').transpose(2,0,1)[None]
 y=s.run(None,{s.get_inputs()[0].name:t})[0][0,:,:h,:w].transpose(1,2,0)
 assert np.isfinite(y).all()
 pixels=np.floor(np.clip(y,0,1)*255+.5).astype(np.uint8)
 wasm=np.asarray(Image.open(root/(prefix+'-raw.png')).convert('RGB'))
 rows.append({'route':route,'min':float(y.min()),'max':float(y.max()),'outsideUnitFraction':float(np.mean((y<0)|(y>1))),'clippedPixelMaeVsWasm':float(np.abs(pixels.astype(float)-wasm).mean()),'clippedPixelMaxVsWasm':int(np.abs(pixels.astype(int)-wasm).max())})
Path(a.output).write_text(json.dumps({'runtime':ort.__version__,'provider':'CPUExecutionProvider','rows':rows,'interpretation':'Cross-runtime comparison, NOT original PyTorch conversion parity'},indent=2)+'\n');print(json.dumps(rows))
