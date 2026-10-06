"""Compare original GoPro weights with existing ONNX on exact photographic inputs."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from nafnet_ref.architecture import NAFNetLocal
p=argparse.ArgumentParser();p.add_argument('checkpoint');p.add_argument('onnx');p.add_argument('fixtures');p.add_argument('out');a=p.parse_args()
assert hashlib.sha256(Path(a.checkpoint).read_bytes()).hexdigest()=='19394e6155d12ef6371d1d57496f87f0ec88f92bdffa27c0792690722d5d1a5c'
assert hashlib.sha256(Path(a.onnx).read_bytes()).hexdigest()=='05b455663115b19de4577d7d092bcd52f34b51517a83c1679cf28a31f4078204'
torch.set_num_threads(2);torch.manual_seed(0)
model=NAFNetLocal(width=32,enc_blk_nums=[1,1,1,28],middle_blk_num=1,dec_blk_nums=[1,1,1,1]).eval()
model.load_state_dict(torch.load(a.checkpoint,map_location='cpu',weights_only=True)['params'],strict=True)
s=ort.InferenceSession(a.onnx,providers=['CPUExecutionProvider']);rows=[]
for route in ['deblur','cleanup-deblur']:
 f=Path(a.fixtures)/('astronaut-mixed-'+route+'-model-input.png')
 x=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32).transpose(2,0,1)[None]/255
 with torch.inference_mode(): y=model(torch.from_numpy(x)).numpy()
 z=s.run(None,{s.get_inputs()[0].name:x})[0]
 assert np.isfinite(y).all() and np.isfinite(z).all()
 ref=np.asarray(Image.open(Path(a.fixtures)/('astronaut-mixed-'+route+'-reference.png')).convert('RGB'),dtype=np.float32)
 def error(t):return float(np.abs(np.floor(np.clip(t[0].transpose(1,2,0),0,1)*255+.5)-ref).mean())
 rows.append({'route':route,'inputSha256':hashlib.sha256(f.read_bytes()).hexdigest(),'originalRange':[float(y.min()),float(y.max())],'convertedRange':[float(z.min()),float(z.max())],'maxAbsDifference':float(np.abs(y-z).max()),'originalRawRgbMae':error(y),'convertedRawRgbMae':error(z),'parityRtol1e4Atol1e5':bool(np.allclose(y,z,rtol=1e-4,atol=1e-5))})
report={'kind':'original-checkpoint-photographic-parity','sourceCommit':'2b4af71ebe098a92a75910c233a3965a3e93ede4','checkpointSha256':'19394e6155d12ef6371d1d57496f87f0ec88f92bdffa27c0792690722d5d1a5c','torch':torch.__version__,'ort':ort.__version__,'inputContract':'Native dimensions, official internal zero padding, RGB 0..1','rows':rows}
Path(a.out).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
