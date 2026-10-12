"""Prepare reproducible public calibration inputs outside Git; Pillow + numpy required."""
import hashlib, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent
sources = json.loads((root / 'sources.json').read_text())
inputs, output = map(lambda s: Path(s).resolve(), sys.argv[1:3])
repo = root.parents[2]
if output.is_relative_to(repo):
    raise ValueError('Decoded inputs and photograph outputs must remain outside Git')
output.mkdir(parents=True, exist_ok=True)
cases = []
for spec in sources:
    path = inputs / (spec['id'] + '.png')
    assert hashlib.sha256(path.read_bytes()).hexdigest() == spec['sha256'], 'Source hash mismatch'
    with Image.open(path) as image:
        # Samples are sRGB PNGs. General ICC/EXIF qualification is not claimed.
        original = np.asarray(ImageOps.exif_transpose(image).convert('RGBA')).copy()
    h, w, _ = original.shape
    for variant in ['original', 'noise', 'underexposure', 'jpeg']:
        data = original.copy()
        if variant == 'noise':
            rng = np.random.Generator(np.random.PCG64(171))
            data[:,:,:3] = np.rint(np.clip(data[:,:,:3].astype(float) + rng.normal(0, 8, (h,w,3)),0,255)).astype('uint8')
        elif variant == 'underexposure':
            data[:,:,:3] = np.rint(data[:,:,:3].astype(float)*.65).astype('uint8')
        elif variant == 'jpeg':
            stream = io.BytesIO()
            Image.fromarray(original[:,:,:3]).save(stream, format='JPEG', quality=45, subsampling=2)
            stream.seek(0)
            data = np.asarray(Image.open(stream).convert('RGBA')).copy()
        case_id = spec['id'] + '-' + variant
        raw = output / (case_id + '.rgba')
        raw.write_bytes(data.tobytes())
        reference = output / (spec['id'] + '-reference.rgba')
        reference.write_bytes(original.tobytes())
        cases.append({'id':case_id,'source_id':spec['id'],'split':'calibration','variant':variant,'width':w,'height':h,'raw':str(raw),'reference':str(reference) if variant!='original' else None,'input_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'reference_sha256':hashlib.sha256(reference.read_bytes()).hexdigest() if variant!='original' else None,'options':{'sourceMime':'image/jpeg' if variant=='jpeg' else 'image/png','content':'auto','strength':'balanced','sharpness':'auto','faces':[]},'rois':spec['rois']})
# A synthetic alpha diagnostic is distinct from the photographic corpus.
y,x=np.mgrid[:97,:129]
a=np.zeros((97,129,4),dtype='uint8');a[:,:,0]=x*255//128;a[:,:,1]=y*255//96;a[:,:,2]=80;a[:,:,3]=(x%3)*127
raw=output/'alpha-diagnostic.rgba';raw.write_bytes(a.tobytes())
cases.append({'id':'alpha-diagnostic','source_id':'synthetic-alpha','split':'diagnostic','variant':'synthetic','width':129,'height':97,'raw':str(raw),'reference':None,'input_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'options':{'sourceMime':'image/png','content':'auto','faces':[]},'rois':[]})
import PIL
(output/'corpus.json').write_text(json.dumps({'status':'provisional-calibration-only','generator':{'numpy':np.__version__,'Pillow':PIL.__version__,'seed':171,'noise':'PCG64 Gaussian sigma 8 encoded RGB','jpeg':'Pillow quality45 subsampling2','underexposure':'encoded RGB multiplication .65, not physical camera noise'},'cases':cases},indent=2)+'\n')
print(f'Prepared {len(cases)} cases at {output}/corpus.json')
