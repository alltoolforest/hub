"""Render native-size input/baseline ROI panels outside Git for manual inspection."""
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw
corpus=json.loads(Path(sys.argv[1]).read_text())
out=Path(sys.argv[2]).resolve()
repo=Path(__file__).resolve().parents[3]
if out.is_relative_to(repo):raise ValueError('Keep photographic outputs outside Git')
for s in corpus['cases']:
 w,h=s['width'],s['height']
 a=Image.frombytes('RGBA',(w,h),Path(s['raw']).read_bytes())
 b=Image.frombytes('RGBA',(w,h),(out/(s['id']+'.rgba')).read_bytes())
 b.save(out/(s['id']+'.png'))
 for roi in s['rois']:
  x,y,rw,rh=roi['box'];box=(x,y,x+rw,y+rh)
  panel=Image.new('RGB',(rw*2,rh+24),'#ddd');draw=ImageDraw.Draw(panel)
  draw.text((3,4),'Input',fill='black');draw.text((rw+3,4),'PR171',fill='black')
  panel.paste(a.crop(box),(0,24));panel.paste(b.crop(box),(rw,24))
  panel.save(out/(s['id']+'-'+roi['id']+'.png'))
print('Native-size PNGs and ROI panels rendered outside repository')
