"""Render offline R9 raw outputs, verify PNG byte round trips, and package review files.
Usage: python render-r9.py OUTPUT_DIRECTORY (contains inputs.json and .rgba files).
Private pixels are never written to the repository.
"""
import json, os, sys, zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

p = Path(sys.argv[1]).resolve()
spec = json.loads((p / 'inputs.json').read_text())
overview = Image.new('RGB', (960, 320 * len(spec)), '#eee')
for i, s in enumerate(spec):
    w, h = s['width'], s['height']
    panel = Image.new('RGB', (w * 4, h + 30), '#eee')
    f = s['faces'][0]
    box = (f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height'])
    crop = Image.new('RGB', (f['width'] * 4, f['height'] + 28), '#eee')
    for j, name in enumerate(['original', 'pr171', 'natural', 'brighter']):
        raw = (p / (s['id'] + '-' + name + '.rgba')).read_bytes()
        im = Image.frombytes('RGBA', (w, h), raw)
        target = p / ('ATF-R9-' + s['id'] + '-' + name + '.png')
        temporary = target.with_suffix('.tmp')
        im.save(temporary, format='PNG')
        os.replace(temporary, target)
        with Image.open(target) as decoded:
            decoded.load()
            assert decoded.size == (w, h) and decoded.tobytes() == raw
        panel.paste(im.convert('RGB'), (j * w, 30))
        ImageDraw.Draw(panel).text((j * w + 5, 8), name, fill='black')
        preview = ImageOps.contain(im.convert('RGB'), (240, 285))
        overview.paste(preview, (j * 240, i * 320 + 28))
        ImageDraw.Draw(overview).text((j * 240 + 5, i * 320 + 6), s['id'] + ' / ' + name, fill='black')
        crop.paste(im.crop(box).convert('RGB'), (j * f['width'], 28))
        ImageDraw.Draw(crop).text((j * f['width'] + 3, 5), name, fill='black')
    panel.save(p / ('ATF-R9-' + s['id'] + '-comparison.png'))
    crop.save(p / (s['id'] + '-face-review.png'))
overview.save(p / 'ATF-R9-all-comparisons.jpg', quality=95)
with zipfile.ZipFile(p / 'ATF-R9-native-results.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for s in spec:
        for name in ['original', 'pr171', 'natural', 'brighter']:
            target = p / ('ATF-R9-' + s['id'] + '-' + name + '.png')
            z.write(target, target.name)
print('PASS: 20 PNG decodes, exact RGBA round trips and native dimensions; comparison panels and ZIP ready')
