"""Isolated raw-model comparison, not integrated quality or device acceptance."""
import argparse, hashlib, importlib.util, json, time
from pathlib import Path
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F

p=argparse.ArgumentParser()
p.add_argument('architecture');p.add_argument('checkpoint');p.add_argument('fixtures');p.add_argument('out')
a=p.parse_args()
source=Path(a.architecture).read_bytes()
assert hashlib.sha1(b'blob '+str(len(source)).encode()+b'\0'+source).hexdigest()=='a41221ecf90294be5951b3019e6d0d600bd4a49a'
checkpoint_hash=hashlib.sha256(Path(a.checkpoint).read_bytes()).hexdigest()
assert checkpoint_hash=='7dce451f33f8f5e0faf7c4e3996e5dcc1bd425ecd1ada99b0f9750e490fd4c9e'
spec=importlib.util.spec_from_file_location('restormer_reference',a.architecture)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
torch.set_num_threads(2)
model=module.Restormer().eval()
model.load_state_dict(torch.load(a.checkpoint,map_location='cpu',weights_only=True)['params'],strict=True)
rows=[]
for case in json.loads((Path(a.fixtures)/'manifest.json').read_text()):
    def read(label):return np.asarray(Image.open(Path(a.fixtures)/(case['id']+'-'+label+'.png')).convert('RGB'),dtype=np.float32)
    rgb=read('input');ref=read('reference');h,w=rgb.shape[:2]
    x=torch.from_numpy(rgb.transpose(2,0,1)[None]/255)
    # Architecture requires multiples of eight. Explicit reflect pad then crop;
    # this is a candidate adapter contract, not the NAFNet input contract.
    x=F.pad(x,(0,(-w)%8,0,(-h)%8),mode='reflect')
    start=time.perf_counter()
    with torch.inference_mode():out=model(x)[0,:,:h,:w].numpy().transpose(1,2,0)
    elapsed=time.perf_counter()-start
    finite=bool(np.isfinite(out).all())
    assert finite
    raw=np.floor(np.clip(out,0,1)*255+.5)
    row={**case,'width':w,'height':h,'finite':finite,'range':[float(out.min()),float(out.max())],
         'rawMae':float(np.abs(raw-ref).mean()),'nativeCpuSeconds':elapsed}
    rows.append(row);print(json.dumps(row),flush=True)
report={'kind':'isolated-restormer-single-image-defocus','sourceCommit':'68dc6ac472db26f16361150cb7a96a1bc87da93f',
        'checkpointSha256':checkpoint_hash,'checkpointBytes':Path(a.checkpoint).stat().st_size,
        'parameters':sum(v.numel() for v in model.parameters()),'torch':torch.__version__,
        'inputContract':'RGB 0..1, reflect pad right/bottom to multiple of 8, crop to native dimensions',
        'production':False,'acceptance':'NOT_EVALUATED','rows':rows,
        'limitations':['Six synthetic development examples; no held-out or real-damage acceptance',
          'Raw outputs only; no production fusion, face protection, or final guard',
          'Native workspace CPU timings are not physical-device or browser budgets',
          'No ONNX conversion, browser execution, rights closure or model admission']}
Path(a.out).write_text(json.dumps(report,indent=2)+'\n')
