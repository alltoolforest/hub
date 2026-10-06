"""Export the pinned defocus candidate and check sampled original/ONNX parity.

No model is admitted to the application. Inputs already use the candidate's
documented multiple-of-eight padding; output cropping belongs to its adapter.
"""
import argparse, hashlib, importlib.util, json
from pathlib import Path
import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn.functional as F
from PIL import Image

p=argparse.ArgumentParser()
for name in ['architecture','checkpoint','fixtures','output']:p.add_argument(name)
a=p.parse_args()
source=Path(a.architecture).read_bytes()
assert hashlib.sha1(b'blob '+str(len(source)).encode()+b'\0'+source).hexdigest()=='a41221ecf90294be5951b3019e6d0d600bd4a49a'
assert hashlib.sha256(Path(a.checkpoint).read_bytes()).hexdigest()=='7dce451f33f8f5e0faf7c4e3996e5dcc1bd425ecd1ada99b0f9750e490fd4c9e'
spec=importlib.util.spec_from_file_location('restormer_reference',a.architecture)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
torch.set_num_threads(2);torch.manual_seed(91)
model=module.Restormer().eval()
model.load_state_dict(torch.load(a.checkpoint,map_location='cpu',weights_only=True)['params'],strict=True)
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
path=out/'restormer-defocus-fp32.onnx'
x=torch.rand(1,3,32,32)
torch.onnx.export(model,x,str(path),opset_version=17,input_names=['input'],output_names=['output'],
                  dynamic_axes={'input':{2:'height',3:'width'},'output':{2:'height',3:'width'}},dynamo=False)
graph=onnx.load(str(path));onnx.checker.check_model(graph)
options=ort.SessionOptions();options.intra_op_num_threads=2
session=ort.InferenceSession(str(path),sess_options=options,providers=['CPUExecutionProvider'])
inputs=[('synthetic-32x32',x),('synthetic-64x80',torch.rand(1,3,64,80))]
for name in ['coffee','astronaut']:
    rgb=np.asarray(Image.open(Path(a.fixtures)/(name+'-input.png')).convert('RGB'),dtype=np.float32)
    h,w=rgb.shape[:2];t=torch.from_numpy(rgb.transpose(2,0,1)[None]/255)
    inputs.append((name,F.pad(t,(0,(-w)%8,0,(-h)%8),mode='reflect')))
rows=[]
for name,t in inputs:
    with torch.inference_mode():reference=model(t).numpy()
    converted=session.run(None,{'input':t.numpy()})[0]
    finite=bool(np.isfinite(converted).all())
    same_shape=converted.shape==reference.shape
    delta=np.abs(converted-reference)
    passed=finite and same_shape and bool(np.allclose(converted,reference,rtol=1e-4,atol=1e-5))
    rows.append({'id':name,'shape':list(t.shape),'finite':finite,'sameShape':same_shape,
                 'maxAbsDifference':float(delta.max()),'meanAbsDifference':float(delta.mean()),'pass':passed})
    if name=='coffee':
        t.numpy().astype('<f4').tofile(out/'coffee-input.f32')
        converted.astype('<f4').tofile(out/'coffee-native-output.f32')
    print(json.dumps(rows[-1]),flush=True)
ops={}
for node in graph.graph.node:ops[node.op_type]=ops.get(node.op_type,0)+1
report={'kind':'restormer-defocus-export-parity','sourceCommit':'68dc6ac472db26f16361150cb7a96a1bc87da93f',
        'checkpointSha256':'7dce451f33f8f5e0faf7c4e3996e5dcc1bd425ecd1ada99b0f9750e490fd4c9e',
        'onnxSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,
        'torch':torch.__version__,'onnx':onnx.__version__,'ort':ort.__version__,
        'opset':17,'operators':ops,'tolerance':{'rtol':1e-4,'atol':1e-5},'rows':rows,
        'pass':all(r['pass'] for r in rows),'production':False,
        'limitations':['Sampled parity only; does not establish all shapes or perceptual quality',
                       'No browser/device, tile, cancellation or rights acceptance']}
(out/'export-results.json').write_text(json.dumps(report,indent=2)+'\n')
if not report['pass']:raise SystemExit('Sampled conversion parity failed')
