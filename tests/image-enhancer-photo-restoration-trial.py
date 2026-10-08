"""Offline, Enhance-only model evaluation. Never used by the website.

Requires torch==2.5.1, Pillow and NumPy plus the pinned official source checkout
and weights below. No network calls; user inputs/outputs must stay outside git.
Native dimensions only. This experiment is not an identity-preservation proof.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import resource
import subprocess
import time
import types

import numpy as np
from PIL import Image
import torch

PINS = {
    'dncnn': ('fc1732f4a4514e42ce15e5b3a1e18c828af47a1e', 'cef4b4672a121b196a0525453b7091dc457a24b673105b38d623299f06fcc728', 'models/network_dncnn.py'),
    'swinir': ('6545850fbf8df298df73d81f3e8cba638787c8bd', '265c18d8809aaca0cd97a6283bee0ed1883ab88395e456381264cac2bb7b5867', 'models/network_swinir.py'),
    'fbcnn': ('54d1831927506b3247e2d4d245abb4f4dab1a1cd', '8b0e4ef23d59cf7ac934a342cb31a17619e4fa4a0b3374a9d78c5174312387e8', 'models/network_fbcnn.py'),
}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine', choices=PINS, required=True)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--weights', type=Path, required=True)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--export-onnx', type=Path, help='Optional DnCNN evaluation graph; not deployed')
    p.add_argument('--jpeg-quality', type=int, choices=range(1, 101), help='Create a paired degradation from the input reference')
    args = p.parse_args()
    if args.input.resolve() == args.output.resolve():
        raise ValueError('Output must not overwrite the input reference')
    revision, digest, source_path = PINS[args.engine]
    actual = subprocess.check_output(['git', '-C', str(args.source), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != revision or hashlib.sha256(args.weights.read_bytes()).hexdigest() != digest:
        raise ValueError('Source revision or model digest does not match the audited trial')
    # Read the pinned git blob, not potentially modified working-tree code.
    source = subprocess.check_output(['git', '-C', str(args.source), 'show', f'{revision}:{source_path}'], text=True)
    block = None
    if args.engine == 'dncnn':
        block_source = subprocess.check_output(['git', '-C', str(args.source), 'show', f'{revision}:models/basicblock.py'], text=True)
        block = types.ModuleType('pinned_basicblock')
        exec(compile(block_source, 'pinned_basicblock.py', 'exec'), block.__dict__)
        source = source.replace('import models.basicblock as B', '')
    if args.engine == 'swinir':
        # timm stochastic-depth is identity in eval. Do not use this adapter to train.
        source = source.replace('from timm.models.layers import DropPath, to_2tuple, trunc_normal_', '''from torch.nn.init import trunc_normal_
def to_2tuple(v): return v if isinstance(v, tuple) else (v, v)
class DropPath(nn.Module):
    def __init__(self, drop_prob=0.): super().__init__()
    def forward(self, x):
        if self.training: raise RuntimeError('Evaluation only')
        return x
''')
    else:
        # Upstream imports torchvision.models but never references it.
        source = source.replace('import torchvision.models as models', '')
    module = types.ModuleType('pinned_restoration_trial')
    if block is not None: module.__dict__['B'] = block
    exec(compile(source, str(args.source / source_path), 'exec'), module.__dict__)
    torch.set_num_threads(2)
    image = Image.open(args.input)
    if 'A' in image.getbands() or image.width * image.height > 350000:
        raise ValueError('Trial limited to opaque images <=350000 pixels; no silent resizing')
    reference = np.asarray(image.convert('RGB'))
    source_pixels = reference
    if args.jpeg_quality:
        buffer = io.BytesIO()
        Image.fromarray(reference).save(buffer, format='JPEG', quality=args.jpeg_quality, subsampling=2)
        buffer.seek(0)
        source_pixels = np.asarray(Image.open(buffer).convert('RGB'))
    model = (module.SwinIR(upscale=1, in_chans=3, img_size=126, window_size=7, img_range=255., depths=[6]*6, embed_dim=180, num_heads=[6]*6, mlp_ratio=2, upsampler='', resi_connection='1conv')
             if args.engine == 'swinir' else module.DnCNN(in_nc=1, out_nc=1, nc=64, nb=20, act_mode='R') if args.engine == 'dncnn' else module.FBCNN())
    weights = torch.load(args.weights, map_location='cpu', weights_only=True)
    model.load_state_dict(weights.get('params', weights), strict=True)
    model.eval()
    if args.export_onnx:
        if args.engine != 'dncnn': raise ValueError('ONNX export evaluated only for DnCNN')
        torch.onnx.export(model, torch.zeros(1, 1, 64, 64), str(args.export_onnx), input_names=['input'], output_names=['output'], dynamic_axes={'input': {2: 'height', 3: 'width'}, 'output': {2: 'height', 3: 'width'}}, opset_version=17)
        parity = np.random.default_rng(42).uniform(.1, .9, (1, 1, 64, 96)).astype(np.float32)
        with torch.inference_mode(): expected = model(torch.from_numpy(parity)).numpy()
        parity.tofile(args.export_onnx.with_name('parity-input.f32'))
        expected.tofile(args.export_onnx.with_name('parity-output.f32'))
    h, w = source_pixels.shape[:2]
    start = time.monotonic()
    tiles = 0
    with torch.inference_mode():
        if args.engine == 'dncnn':
            # Match upstream limited-range Y conversion; retain source chroma.
            yy = (source_pixels.astype(float) @ np.array([65.481, 128.553, 24.966]) / 255 + 16) / 255
            tensor = torch.from_numpy(yy.astype(np.float32)).unsqueeze(0).unsqueeze(0)
            restored = model(torch.nn.functional.pad(tensor, (20, 20, 20, 20), mode='reflect'))[0, 0, 20:-20, 20:-20].numpy()
            output = np.clip(np.round(source_pixels.astype(float) + (restored-yy)[..., None] * (255*255/219)), 0, 255).astype(np.uint8)
            tiles = 1
        elif args.engine == 'fbcnn':
            tensor = torch.from_numpy(source_pixels.copy()).permute(2, 0, 1).unsqueeze(0).float() / 255
            result, _ = model(tensor)
            output = np.round(result.clamp(0, 1)[0].permute(1, 2, 0).numpy() * 255).astype(np.uint8)
            tiles = 1
        else:
            output = np.zeros_like(source_pixels)
            for y in range(0, h, 196):
                for x in range(0, w, 196):
                    top, left = max(0, y-28), max(0, x-28)
                    a = source_pixels[top:min(h, y+224), left:min(w, x+224)]
                    ah, aw = a.shape[:2]
                    tensor = torch.from_numpy(a.copy()).permute(2, 0, 1).unsqueeze(0).float() / 255
                    tensor = torch.nn.functional.pad(tensor, (0, (-aw)%7, 0, (-ah)%7), mode='reflect')
                    b = model(tensor).clamp(0, 1)[0, :, :ah, :aw].permute(1, 2, 0).numpy()
                    bh, bw = min(196, h-y), min(196, w-x)
                    output[y:y+bh, x:x+bw] = np.round(b[y-top:y-top+bh, x-left:x-left+bw] * 255).astype(np.uint8)
                    tiles += 1
    seconds = time.monotonic() - start
    if output.shape != reference.shape:
        raise ValueError('Model changed dimensions')
    Image.fromarray(output).save(args.output)
    report = dict(engine=args.engine, source_revision=revision, weights_sha256=digest,
                  parameters=sum(t.numel() for t in model.parameters()), width=w, height=h,
                  seconds=seconds, tiles=tiles, peak_rss_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                  mean_absolute_change=float(np.abs(output.astype(float)-source_pixels).mean()))
    if args.jpeg_quality:
        report['jpeg_quality'] = args.jpeg_quality
        for key, array in [('source', source_pixels), ('output', output)]:
            error = array.astype(float) - reference
            report[key+'_mae'] = float(np.abs(error).mean())
            report[key+'_psnr'] = float(10 * np.log10(255**2 / max(1e-12, np.mean(error**2))))
    args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    main()
