"""Fixed 512px development comparison, including clean controls.

Raw specialist outputs only; no full-pipeline or acceptance claim.
"""
import argparse, hashlib, importlib.util, json, resource, time
from pathlib import Path
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
import onnxruntime as ort

p=argparse.ArgumentParser()
for key in ['architecture','checkpoint','nafnet','public_samples','nasa_intake','output']:p.add_argument(key)
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
digest=lambda b:hashlib.sha256(b).hexdigest()
source=Path(a.architecture).read_bytes()
assert hashlib.sha1(b'blob '+str(len(source)).encode()+b'\0'+source).hexdigest()=='a41221ecf90294be5951b3019e6d0d600bd4a49a'
assert digest(Path(a.checkpoint).read_bytes())=='7dce451f33f8f5e0faf7c4e3996e5dcc1bd425ecd1ada99b0f9750e490fd4c9e'
assert digest(Path(a.nafnet).read_bytes())=='05b455663115b19de4577d7d092bcd52f34b51517a83c1679cf28a31f4078204'
spec=importlib.util.spec_from_file_location('restormer_reference',a.architecture)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
torch.set_num_threads(2)
model=module.Restormer().eval()
model.load_state_dict(torch.load(a.checkpoint,map_location='cpu',weights_only=True)['params'],strict=True)
options=ort.SessionOptions();options.intra_op_num_threads=2
naf=ort.InferenceSession(a.nafnet,sess_options=options,providers=['CPUExecutionProvider'])
rows=[]
ids=['coffee','astronaut','nasa-081','nasa-084','nasa-088','nasa-097']
for id in ids:
    path=Path(a.nasa_intake)/'images'/(id+'.jpg') if id.startswith('nasa') else Path(a.public_samples)/(id+'.png')
    data=path.read_bytes();image=Image.open(path).convert('RGB')
    scale=min(1,512/max(image.size));size=tuple(round(v*scale) for v in image.size)
    image=image.resize(size,Image.Resampling.LANCZOS);ref=np.asarray(image,dtype=np.float32)
    h,w=ref.shape[:2]
    # Predeclared radius-four disk, edge replication, round to RGB bytes.
    pad=np.pad(ref,((4,4),(4,4),(0,0)),mode='edge')
    taps=[(x,y) for y in range(-4,5) for x in range(-4,5) if x*x+y*y<=16]
    blur=np.floor(sum(pad[4+y:4+y+h,4+x:4+x+w] for x,y in taps)/len(taps)+.5)
    image.save(out/(id+'-reference.png'))
    for condition,rgb in [('clean',ref),('defocus',blur)]:
        x=rgb.transpose(2,0,1)[None].copy()/255
        record={'id':id,'condition':condition,'sourceSha256':digest(data),'inputSha256':digest(rgb.astype('uint8').tobytes()),
                'width':w,'height':h,'inputMae':float(np.abs(rgb-ref).mean()),'paths':[]}
        Image.fromarray(rgb.astype('uint8')).save(out/(id+'-'+condition+'-input.png'))
        for name in ['nafnet','restormer']:
            start=time.perf_counter()
            if name=='nafnet':result=naf.run(None,{naf.get_inputs()[0].name:x})[0][0].transpose(1,2,0)
            else:
                t=F.pad(torch.from_numpy(x),(0,(-w)%8,0,(-h)%8),mode='reflect')
                with torch.inference_mode():result=model(t)[0,:,:h,:w].numpy().transpose(1,2,0)
            elapsed=time.perf_counter()-start
            finite=bool(np.isfinite(result).all());admitted=finite and bool(np.max(np.abs(result))<=16)
            item={'model':name,'seconds':elapsed,'finite':finite,'numericallyAdmitted':admitted,
                  'range':[float(result.min()),float(result.max())],'rawMae':None}
            if admitted:
                display=np.floor(np.clip(result,0,1)*255+.5).astype('uint8')
                item['rawMae']=float(np.abs(display.astype(np.float32)-ref).mean())
                Image.fromarray(display).save(out/(id+'-'+condition+'-'+name+'.png'))
            record['paths'].append(item)
        rows.append(record);print(json.dumps(record),flush=True)
        report={'kind':'512px-development-raw-model-comparison','maxSide':512,'recipe':'radius4-disk-edge-pad-rounded-rgb-v1',
                'torch':torch.__version__,'ort':ort.__version__,'production':False,'acceptance':'NOT_EVALUATED',
                'rows':rows,'complete':len(rows)==12,'processMaxRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                'limitations':['Six existing development sources, not held-out or genuinely damaged examples',
                  'Raw model outputs, without routing, face processing, fusion or final guard',
                  'Clean inputs deliberately forced through specialists to test routing hazards',
                  'Native host CPU timings are not browser/device budgets; no identity acceptance']}
        (out/'results.json').write_text(json.dumps(report,indent=2)+'\n')
