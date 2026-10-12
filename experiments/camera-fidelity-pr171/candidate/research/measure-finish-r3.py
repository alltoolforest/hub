"""Measure retained R2/R3 outputs; no-reference brightness is not a quality score.
Usage: python measure-finish-r3.py corpus.json r2-dir r3-dir
"""
import hashlib,json,sys
from pathlib import Path
import numpy as np

corpus=json.loads(Path(sys.argv[1]).read_text())
r2,r3=map(Path,sys.argv[2:4])
prior=json.loads((r2/'report.json').read_text())
render=json.loads((r3/'render-report.json').read_text())
weights=np.array([.2126,.7152,.0722])

def read(path,w,h,expected=None):
    raw=Path(path).read_bytes()
    if expected:assert hashlib.sha256(raw).hexdigest()==expected
    return np.frombuffer(raw,dtype=np.uint8).reshape(h,w,4).astype(float)

def measure(a,source,ref=None,box=None):
    if box:
        x,y,w,h=box;a=a[y:y+h,x:x+w];source=source[y:y+h,x:x+w]
        if ref is not None:ref=ref[y:y+h,x:x+w]
    opaque=source[:,:,3]==255
    if not opaque.any():return dict(opaquePixels=0)
    rgb=a[:,:,:3];luma=rgb@weights;v=luma[opaque]
    result=dict(opaquePixels=int(opaque.sum()),meanLuma=float(v.mean()),p95MinusP05=float(np.percentile(v,95)-np.percentile(v,5)),whitePixels=int((np.all(rgb==255,axis=2)&opaque).sum()),newHighChannels=int(((rgb==255)&(source[:,:,:3]<255)&opaque[:,:,None]).sum()))
    if ref is not None:result['referenceRGBMSE']=float(np.mean((rgb[opaque]-ref[:,:,:3][opaque])**2))
    return result

records=[]
for c in corpus['cases']:
    assert c['split'] in ['calibration','diagnostic']
    w,h=c['width'],c['height'];p=next(x for x in prior['records'] if x['id']==c['id'])
    source=read(c['raw'],w,h,c['input_sha256'])
    ref=read(c['reference'],w,h,c['reference_sha256']) if c.get('reference') else None
    images={'previous':read(r2/(c['id']+'-tone-r2.rgba'),w,h,p['trial_sha256'])}
    if c.get('observedRaw'):images['uploaded']=read(c['observedRaw'],w,h,c['observed_sha256'])
    for variant in ['balanced','brighter']:
        record=next(x for x in render['records'] if x['id']==c['id'] and x['variant']==variant)
        images[variant]=read(r3/(c['id']+'-'+variant+'.rgba'),w,h,record['output_sha256'])
    records.append(dict(id=c['id'],metrics={k:measure(a,source,ref) for k,a in images.items()},rois=[dict(id=roi['id'],metrics={k:measure(a,source,ref,roi['box']) for k,a in images.items()}) for roi in c['rois']]))
report=dict(status='Opt-in research presets; not an automatic quality replacement',limits=['One supplied original/output portrait pair; uploaded output is not a clean reference','Calibration consists of only three independent scenes; no held-out quality evidence','Percentile range measures tonal contrast, not recovered detail','No mobile/browser validation'],records=records,render=render)
(r3/'evidence.json').write_text(json.dumps(report,indent=2)+'\n')
for r in records:
    print(r['id'],{k:round(v['referenceRGBMSE'],2) for k,v in r['metrics'].items() if 'referenceRGBMSE' in v})
