"""Explain and independently reproduce the existing export's transformations."""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
import onnx
import onnxruntime as ort
import torch
from srvgg_arch import SRVGGNetCompact

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--directory',required=True);args=ap.parse_args();root=Path(args.directory)
    paths={'weights':root/'realesr-general-x4v3.pth','export':root/'existing.onnx'}
    expected={'weights':'8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292','export':'09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4'}
    for key,p in paths.items():
        if hashlib.sha256(p.read_bytes()).hexdigest()!=expected[key]:raise ValueError('Hash mismatch: '+key)
    torch.set_num_threads(2)
    model=SRVGGNetCompact(num_conv=32).eval();state=torch.load(paths['weights'],map_location='cpu',weights_only=True)
    model.load_state_dict(state['params_ema'] if 'params_ema' in state else state['params'],strict=True)
    # The baseline stores FP16-rounded weights as float32 and clips final output.
    model.half().float()
    options=ort.SessionOptions();options.intra_op_num_threads=2
    session=ort.InferenceSession(str(paths['export']),sess_options=options,providers=['CPUExecutionProvider'])
    checks=[]
    for h,w in [(16,16),(31,47),(64,64)]:
        x=np.random.default_rng(h+w).random((1,3,h,w),dtype=np.float32)
        with torch.inference_mode():reference=model(torch.from_numpy(x)).clamp(0,1).numpy()
        actual=session.run(None,{session.get_inputs()[0].name:x})[0];delta=np.abs(actual-reference)
        passed=bool(np.allclose(actual,reference,rtol=1e-4,atol=1e-5))
        checks.append({'shape':[h,w],'maxAbs':float(delta.max()),'meanAbs':float(delta.mean()),'pass':passed})
    report={'kind':'existing-export-parity','hashes':expected,'transformations':['Parameters rounded float32 → float16 → float32','Output clipped to [0,1]'],'checks':checks,'pass':all(c['pass'] for c in checks),'qualityAcceptance':'NOT_EVALUATED','limits':'Synthetic CPU shapes only; not rights clearance or universal numerical equivalence.'}
    (root/'existing-export-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
    if not report['pass']:raise ValueError('Existing export parity failed')
if __name__=='__main__':main()
