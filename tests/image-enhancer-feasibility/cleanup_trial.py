"""Isolated official SRVGG conversion and public-photo diagnostic, not acceptance."""
import argparse, hashlib, io, json, platform, time, urllib.request
from pathlib import Path
import numpy as np
import onnx
import onnxruntime as ort
import torch
from PIL import Image, ImageFilter
from skimage import data
from srvgg_arch import SRVGGNetCompact

BASE = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/'
BASELINE = 'https://cdn.jsdelivr.net/gh/NovareOrbis/nova-ai-models@v3/realesr-general-x4v3.onnx'
EXPECTED = '09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4'
CHECKPOINT_HASHES = {
    'general': '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292',
    'wdn': '1641f8c4464b9f097c9fdda5589273713f67cf59f3d909e0bd688f0cee269dca',
}

def sha(b): return hashlib.sha256(b).hexdigest()
def download(url, path, expected=None):
    if not path.exists():
        with urllib.request.urlopen(url, timeout=90) as r:
            content = r.read(8_000_001)
        if len(content)>8_000_000: raise ValueError('Download exceeds candidate size cap')
        path.write_bytes(content)
    content=path.read_bytes()
    if len(content)>8_000_000: raise ValueError('Cached file exceeds candidate size cap')
    if expected and sha(content)!=expected: raise ValueError('Model hash mismatch')
    return {'url':url,'sha256':sha(content),'bytes':len(content),'expectedHashVerified':bool(expected)}

def tensor(image): return np.asarray(image,dtype=np.float32).transpose(2,0,1)[None]/255

def infer(session, x): return session.run(None,{session.get_inputs()[0].name:x})[0]

def image_of(output):
    return Image.fromarray(np.rint(np.clip(output[0].transpose(1,2,0),0,1)*255).astype(np.uint8))

def metrics(image, ref):
    d=np.asarray(image,dtype=np.float64)-np.asarray(ref,dtype=np.float64)
    return {'mae':float(np.abs(d).mean()),'rmse':float(np.sqrt(np.mean(d*d)))}

def variants(ref):
    rng=np.random.default_rng(415)
    noise=Image.fromarray(np.clip(np.asarray(ref,dtype=float)+rng.normal(0,12,(ref.height,ref.width,3)),0,255).round().astype('uint8'))
    b=io.BytesIO();ref.save(b,format='JPEG',quality=18,subsampling=2);b.seek(0)
    jpeg=Image.open(b).convert('RGB')
    return {'clean':ref,'noise':noise,'jpeg':jpeg,'low-resolution':ref.resize((ref.width//2,ref.height//2),Image.Resampling.BICUBIC).resize(ref.size,Image.Resampling.BICUBIC),'mixed':noise.filter(ImageFilter.GaussianBlur(0.7))}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);args=ap.parse_args()
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    torch.set_num_threads(2);torch.manual_seed(415)
    opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
    report={'kind':'isolated-cleanup-feasibility','acceptance':'NOT_EVALUATED','productionIntegration':False,'host':platform.platform(),'versions':{'torch':torch.__version__,'onnx':onnx.__version__,'onnxruntime':ort.__version__},'models':{},'photos':[],'independentSourceCount':2,'limitations':['Two public development sources only; not the locked 100-photo benchmark','No human identity or naturalness review','CPU diagnostics are not browser or physical-device verification','Official checkpoint hashes observed on first intake, not independently publisher-attested','No weight redistribution or commercial rights approval implied']}
    sessions={}
    for model_id,filename in [('general','realesr-general-x4v3.pth'),('wdn','realesr-general-wdn-x4v3.pth')]:
        p=out/filename;record=download(BASE+filename,p,CHECKPOINT_HASHES[model_id])
        model=SRVGGNetCompact(num_conv=32).eval()
        state=torch.load(p,map_location='cpu',weights_only=True)
        model.load_state_dict(state['params_ema'] if 'params_ema' in state else state['params'],strict=True)
        exported=out/(model_id+'.onnx')
        torch.onnx.export(model,torch.rand(1,3,32,32),str(exported),input_names=['input'],output_names=['output'],dynamic_axes={'input':{2:'height',3:'width'},'output':{2:'out_height',3:'out_width'}},opset_version=14,dynamo=False)
        onnx.checker.check_model(str(exported));session=ort.InferenceSession(str(exported),sess_options=opts,providers=['CPUExecutionProvider']);sessions[model_id]=session
        checks=[]
        for h,w in [(16,16),(31,47),(64,64)]:
            x=np.random.default_rng(h+w).random((1,3,h,w),dtype=np.float32)
            with torch.inference_mode(): expected=model(torch.from_numpy(x)).numpy()
            actual=infer(session,x);delta=np.abs(expected-actual)
            passed=bool(np.isfinite(actual).all() and np.allclose(expected,actual,rtol=1e-4,atol=1e-5))
            checks.append({'shape':[h,w],'maxAbs':float(delta.max()),'meanAbs':float(delta.mean()),'pass':passed})
            if not passed: raise ValueError('Conversion parity failed: '+model_id)
        record.update({'exportSha256':sha(exported.read_bytes()),'exportBytes':exported.stat().st_size,'parity':checks});report['models'][model_id]=record
    p=out/'existing.onnx';report['models']['existing']=download(BASELINE,p,EXPECTED)
    sessions['existing']=ort.InferenceSession(str(p),sess_options=opts,providers=['CPUExecutionProvider'])
    x=np.random.default_rng(415).random((1,3,31,47),dtype=np.float32)
    diff=np.abs(infer(sessions['general'],x)-infer(sessions['existing'],x))
    report['existingVsOfficialGeneral']={'maxAbs':float(diff.max()),'meanAbs':float(diff.mean()),'withinTolerance':bool(diff.max()<1e-4)}
    # Sources remain diagnostics, never silently added to the acceptance manifest.
    sources=[('astronaut',data.astronaut(),'NASA, public domain; no endorsement. scikit-image data documentation'),('coffee',data.coffee(),'Rachel Michetti / Pikolo Espresso Bar, CC0; scikit-image data documentation')]
    for name,pixels,credit in sources:
        ref=Image.fromarray(pixels).convert('RGB');ref.thumbnail((128,128),Image.Resampling.LANCZOS)
        ref.save(out/(name+'-reference.png'))
        for degradation,input_image in variants(ref).items():
            input_image.save(out/(name+'-'+degradation+'-input.png'))
            record={'source':name,'credit':credit,'degradation':degradation,'input':metrics(input_image,ref),'outputs':{}}
            for model_id,session in sessions.items():
                start=time.perf_counter();output=infer(session,tensor(input_image));elapsed=(time.perf_counter()-start)*1000
                restored=image_of(output).resize(ref.size,Image.Resampling.LANCZOS)
                restored.save(out/(name+'-'+degradation+'-'+model_id+'.png'))
                record['outputs'][model_id]={**metrics(restored,ref),'inferenceMs':elapsed}
            report['photos'].append(record)
    # Exact-context tiled/full comparison tests the export; not an approved mobile tile policy.
    x=np.random.default_rng(3).random((1,3,96,112),dtype=np.float32)
    report['tiling']=[]
    for model_id,session in sessions.items():
        full=infer(session,x);tiled=np.empty_like(full);pad=40;tile=48
        for y in range(0,96,tile):
            for col in range(0,112,tile):
                y1=min(96,y+tile);x1=min(112,col+tile);a=max(0,y-pad);b=max(0,col-pad);c=min(96,y1+pad);d=min(112,x1+pad)
                piece=infer(session,x[:,:,a:c,b:d].copy())
                tiled[:,:,y*4:y1*4,col*4:x1*4]=piece[:,:,(y-a)*4:(y1-a)*4,(col-b)*4:(x1-b)*4]
        error=float(np.max(np.abs(full-tiled)));report['tiling'].append({'model':model_id,'padding':pad,'maxAbs':error,'pass':error<1e-4})
        if error>=1e-4: raise ValueError('Tile parity failed: '+model_id)
    (out/'report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'parity':'PASS','tiling':'PASS','report':str(out/'report.json'),'acceptance':'NOT_EVALUATED'}))

if __name__=='__main__':main()
