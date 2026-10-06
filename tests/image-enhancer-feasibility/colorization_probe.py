"""Isolated ECCV16 checkpoint/export/Lab diagnostic; never a default stage.

Source and weights are external, pinned inputs. No photographs or weights are
distributed. This does not establish plausible skin color or historical accuracy.
"""
import argparse, hashlib, json, resource, time
from pathlib import Path
import numpy as np
from PIL import Image
from skimage import color
import torch
import torch.nn.functional as F
import onnx
import onnxruntime as ort
from colorization_gamut import map_chroma

p=argparse.ArgumentParser()
for name in ['reference','checkpoint','samples','output']:p.add_argument(name)
p.add_argument('--opt-in',action='store_true')
a=p.parse_args()
if not a.opt_in:raise SystemExit('Colorization requires explicit --opt-in; no model loaded')
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
expected='9b330a0bae53f4ded77b1e23defbf78beaa09c10ebc4c4999e8e4f4a160b93f9'
assert sha(Path(a.checkpoint).read_bytes())==expected
namespace={'__name__':'isolated_eccv16_reference'}
for name,blob in [('base_color.py','00beb39e9f6f73b06ebea0314fc23a0bc75f23b7'),('eccv16.py','896ed477c20934dc86a6088117eed63af773ace8')]:
    raw=(Path(a.reference)/name).read_bytes()
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==blob
    # Preserve model arithmetic; omit unused debugger and package-relative import.
    source=raw.decode().replace('from IPython import embed','').replace('from .base_color import *','')
    exec(compile(source,name,'exec'),namespace)
torch.set_num_threads(2)
model=namespace['ECCVGenerator']().eval()
model.load_state_dict(torch.load(a.checkpoint,map_location='cpu',weights_only=True),strict=True)
model_path=out/'eccv16-fp32.onnx'
example=torch.full((1,1,256,256),50.)
torch.onnx.export(model,example,str(model_path),opset_version=17,input_names=['luminance'],output_names=['chroma'],
                  dynamic_axes={'luminance':{2:'height',3:'width'},'chroma':{2:'height',3:'width'}},dynamo=False)
graph=onnx.load(str(model_path));onnx.checker.check_model(graph)
options=ort.SessionOptions();options.intra_op_num_threads=2
session=ort.InferenceSession(str(model_path),sess_options=options,providers=['CPUExecutionProvider'])
rows=[]
for name in ['astronaut','coffee']:
    path=Path(a.samples)/(name+'.png');rgb=np.asarray(Image.open(path).convert('RGB'))
    # Match the upstream preprocessing: original L and L from resized RGB.
    original_l=color.rgb2lab(rgb)[:,:,0].astype(np.float32)
    small=np.asarray(Image.fromarray(rgb).resize((256,256),Image.Resampling.BICUBIC))
    input_l=color.rgb2lab(small)[:,:,0].astype(np.float32)[None,None]
    start=time.perf_counter()
    with torch.inference_mode():native=model(torch.from_numpy(input_l)).numpy()
    seconds=time.perf_counter()-start
    converted=session.run(None,{'luminance':input_l})[0]
    finite=bool(np.isfinite(native).all() and np.isfinite(converted).all())
    delta=np.abs(native-converted)
    parity=finite and bool(np.allclose(native,converted,rtol=1e-4,atol=1e-4))
    ab=F.interpolate(torch.from_numpy(converted),size=original_l.shape,mode='bilinear',align_corners=False)[0].numpy().transpose(1,2,0)
    lab=np.concatenate([original_l[:,:,None],ab],axis=2)
    restored=color.lab2rgb(lab)
    mapped,scale=map_chroma(lab)
    # Lab L is preserved before gamut mapping; RGB clipping can alter final L.
    mapped_l=color.rgb2lab(restored)[:,:,0]
    gray=color.lab2rgb(np.stack([original_l,np.zeros_like(original_l),np.zeros_like(original_l)],axis=2))
    Image.fromarray(np.round(gray*255).astype('uint8')).save(out/(name+'-grayscale.png'))
    Image.fromarray(np.round(restored*255).astype('uint8')).save(out/(name+'-plausible-color.png'))
    Image.fromarray(np.round(mapped*255).astype('uint8')).save(out/(name+'-gamut-mapped.png'))
    row={'id':name,'sourceSha256':sha(path.read_bytes()),'shape':list(input_l.shape),'finite':finite,
         'nativeCpuSeconds':seconds,'maxAbsChromaDifference':float(delta.max()),'parity':parity,
         'chromaRange':[float(converted.min()),float(converted.max())],
         'preGamutLuminancePreserved':bool(np.array_equal(lab[:,:,0],original_l)),
         'postGamutMeanAbsLuminanceChange':float(np.abs(mapped_l-original_l).mean()),
         'postGamutMaxAbsLuminanceChange':float(np.abs(mapped_l-original_l).max())}
    mapped_error=np.abs(color.rgb2lab(mapped)[:,:,0]-original_l)
    row['chromaMapping']={'affectedPixelFraction':float((scale<1).mean()),
      'meanAbsLuminanceChange':float(mapped_error.mean()),'maxAbsLuminanceChange':float(mapped_error.max()),
      'maxAbsLuminanceChangeAfter8Bit':float(np.abs(color.rgb2lab(np.round(mapped*255).astype('uint8'))[:,:,0]-original_l).max())}
    rows.append(row);print(json.dumps(row),flush=True)
    if name=='astronaut':
        input_l.astype('<f4').tofile(out/'input.f32');converted.astype('<f4').tofile(out/'native-output.f32')
report={'kind':'isolated-opt-in-colorization-feasibility','sourceCommit':'4f6009ed1495b1300231ebeb41cc4015557ddef7',
        'checkpointSha256':expected,'checkpointBytes':Path(a.checkpoint).stat().st_size,
        'onnxSha256':sha(model_path.read_bytes()),'onnxBytes':model_path.stat().st_size,
        'torch':torch.__version__,'ort':ort.__version__,'parameters':sum(v.numel() for v in model.parameters()),
        'opset':17,'operators':sorted(set(n.op_type for n in graph.graph.node)),
        'parityTolerance':{'rtol':1e-4,'atol':1e-4},'rows':rows,'pass':all(r['parity'] for r in rows),
        'processMaxRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'production':False,
        'limitations':['Two synthetic-grayscale development photos; no real old-photo or held-out review',
          'Colors are plausible predictions, not recovered historical facts',
          'No skin plausibility/bleeding/identity, browser/device or weight redistribution acceptance',
          'No application integration, default colorization, or protected-control changes']}
(out/'results.json').write_text(json.dumps(report,indent=2)+'\n')
if not report['pass']:raise SystemExit('Sampled export parity failed')
