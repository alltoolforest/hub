"""Promote existing half-precision graph for a local numerical diagnostic only.
This does not recover original FP32 weights or establish export/weight provenance.
"""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
import onnx
from onnx import numpy_helper,TensorProto
import onnxruntime as ort
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('model');p.add_argument('fixtures');p.add_argument('out');a=p.parse_args()
source=Path(a.model);assert hashlib.sha256(source.read_bytes()).hexdigest()=='05b455663115b19de4577d7d092bcd52f34b51517a83c1679cf28a31f4078204'
out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
m=onnx.load(source)
for t in m.graph.initializer:
 if t.data_type==TensorProto.FLOAT16:t.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(t).astype(np.float32),t.name))
for v in list(m.graph.input)+list(m.graph.output)+list(m.graph.value_info):
 if v.type.tensor_type.elem_type==TensorProto.FLOAT16:v.type.tensor_type.elem_type=TensorProto.FLOAT
for n in m.graph.node:
 if n.op_type=='Cast':
  for att in n.attribute:
   if att.name=='to' and att.i==TensorProto.FLOAT16:att.i=TensorProto.FLOAT
onnx.checker.check_model(m);target=out/'nafnet-promoted-fp32.onnx';onnx.save(m,target)
s=ort.InferenceSession(str(target),providers=['CPUExecutionProvider']);rows=[]
for route in ['deblur','cleanup-deblur']:
 prefix='nasa-088-motion-'+route
 x=np.asarray(Image.open(Path(a.fixtures)/(prefix+'-model-input.png')).convert('RGB'),dtype=np.float32)/255
 h,w=x.shape[:2];t=np.pad(x,((0,(-h)%16),(0,(-w)%16),(0,0)),mode='edge').transpose(2,0,1)[None]
 y=s.run(None,{s.get_inputs()[0].name:t})[0][0,:,:h,:w].transpose(1,2,0);assert np.isfinite(y).all()
 pixels=np.floor(np.clip(y,0,1)*255+.5).astype(np.uint8)
 ref=np.asarray(Image.open(Path(a.fixtures)/(prefix+'-reference.png')).convert('RGB'))
 Image.fromarray(pixels).save(out/(prefix+'.png'))
 rows.append({'route':route,'min':float(y.min()),'max':float(y.max()),'outsideUnitFraction':float(np.mean((y<0)|(y>1))),'rawRgbMaeVsReference':float(np.abs(pixels.astype(float)-ref).mean())})
report={'kind':'precision-promotion-diagnostic','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'derivedSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'production':False,'originalWeightParity':'NOT_VERIFIED','runtime':ort.__version__,'rows':rows}
(out/'precision.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
