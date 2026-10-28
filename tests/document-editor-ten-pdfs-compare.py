from pathlib import Path
import subprocess,json,hashlib,sys
from PIL import Image,ImageChops
from pypdf import PdfReader
root=Path(sys.argv[1]);results=[];render=root/'comparisons';render.mkdir(exist_ok=True)
for case in json.loads((root/'fixtures/manifest.json').read_text()):
 src=root/'fixtures'/case['file'];assert hashlib.sha256(src.read_bytes()).hexdigest()==case['sha256'];original=PdfReader(src,password=case['password']);
 for variant in ['original','edited']:
  output=root/'exports'/f'{variant}-{case["file"]}'
  if not output.exists():continue
  result=PdfReader(output);assert len(result.pages)==len(original.pages)
  assert [(p.get('/Rotate',0),list(p.mediabox),list(p.cropbox))for p in original.pages]==[(p.get('/Rotate',0),list(p.mediabox),list(p.cropbox))for p in result.pages]
  if case['id']=='PDF05':assert {k:v.get('/V')for k,v in original.get_fields().items()}=={k:v.get('/V')for k,v in result.get_fields().items()}
  pages=[]
  for i in range(case['pages']):
   images=[]
   for path,tag,pwd in [(src,'source',case['password']),(output,variant,None)]:
    dest=render/f'{case["id"]}-{tag}-{i+1}';args=['pdftoppm','-f',str(i+1),'-l',str(i+1),'-singlefile','-r','60','-png'];
    if pwd:args+=['-upw',pwd]
    subprocess.run(args+[str(path),str(dest)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);images.append(Image.open(str(dest)+'.png').convert('RGB'))
   bounds=ImageChops.difference(*images).getbbox();expected_same=variant=='original'or i>0
   assert not(expected_same and bounds),f'{case["id"]} {variant} page {i+1}: unexpected visual difference {bounds}'
   if bounds and variant=='edited':assert bounds[1]<65 and bounds[3]<70,f'Edit changed content outside sentinel band: {bounds}'
   pages.append({'page':i+1,'diffBounds':bounds})
  results.append({'id':case['id'],'variant':variant,'pages':pages,'status':'PASS'})
(root/'visual-results.json').write_text(json.dumps(results,indent=2));print(json.dumps({'files':len(results),'renderedComparisons':sum(len(r['pages'])for r in results),'status':'PASS'}))
# Expansion must preserve source text multiplicity across all source/destination
# pages, replacing one occurrence only. A visual clip must not hide duplicates.
expanded=root/'exports/expanded-09-page-overflow.pdf'
if expanded.exists():
 from collections import Counter
 import re
 source=PdfReader(root/'fixtures/09-page-overflow.pdf');output=PdfReader(expanded)
 words=lambda text:Counter(re.findall('[A-Za-z0-9]+',text))
 expected=words(' '.join(p.extract_text()or''for p in source.pages));expected.subtract(words('Record 02: alpha beta gamma, retained narrative content.'));expected.update(words('Expanded report sentence with carefully retained objects and following text. '*12));actual=words(' '.join(p.extract_text()or''for p in output.pages))
 delta={'missing':dict(expected-actual),'extra':dict(actual-expected)};(root/'expanded-preservation.json').write_text(json.dumps(delta,indent=2));assert not delta['missing'] and not delta['extra'],delta
 print('PASS cross-page expansion word multiplicity: no missing or duplicated source/replacement words')
