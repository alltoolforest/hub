"""Export only the private comparison UI and its exact runtime dependencies."""
import hashlib,json,re,shutil,sys
from pathlib import Path
from html.parser import HTMLParser
lab=Path(__file__).resolve().parents[2]
dest=Path(sys.argv[1]).resolve()
assert dest.name=='dist' and (dest.parent/'.openai/hosting.json').is_file(),'Expected registered Site dist directory'
manifest=json.loads((dest.parent/'.openai/hosting.json').read_text());assert manifest.get('project_id')
manifest['static']={'directory':'dist'}
(dest.parent/'.openai/hosting.json').write_text(json.dumps(manifest,indent=2)+'\n')
files=[*sorted((lab/'candidate/ui').glob('*'))]
# Determine static imports plus module-worker dependency, never the integration reference or trials.
queue=[lab/'candidate/assets/js/image-enhancer-photo-engine.js',lab/'candidate/assets/js/image-enhancer-photo-worker.js']
seen=set()
while queue:
 p=queue.pop().resolve()
 if p in seen:continue
 assert p.is_relative_to(lab)
 seen.add(p);files.append(p)
 for target in re.findall(r"(?:from\s*|import\s*)['\"]([^'\"]+)['\"]",p.read_text()):
  assert target.startswith('.'),'No external dependencies permitted'
  queue.append((p.parent/target).resolve())
paths=[]
for p in files:
 target=dest/p.relative_to(lab);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target);paths.append(target)
html=(lab/'candidate/ui/index.html').read_text().replace('./lab.css','./candidate/ui/lab.css').replace('./lab.js','./candidate/ui/lab.js')
(dest/'index.html').write_text(html);(dest/'robots.txt').write_text('User-agent: *\nDisallow: /\n');(dest/'_headers').write_text('/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n')
class Inspect(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.refs=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  assert not any(k.startswith('on') for k in a),'Inline event handler'
  if 'id' in a:assert a['id'] not in self.ids;self.ids.add(a['id'])
  if tag=='label' and 'for' in a:self.refs.append(a['for'])
parser=Inspect();parser.feed(html);assert all(x in parser.ids for x in parser.refs)
for identifier in re.findall(r"\$\('([^']+)'\)",(lab/'candidate/ui/lab.js').read_text()):assert identifier in parser.ids,identifier
baseline=json.loads((lab/'manifest.json').read_text())
for entry in baseline['files']:
 p=dest/'baseline'/entry['path']
 if p.exists():assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256']
assert not any('photo-trials' in str(p) for p in paths)
assert all('node_modules' not in str(p) and 'tests/' not in str(p) for p in paths)
print(json.dumps({'runtime_files':len(paths),'static_checks':'PASS','baseline_modules':'hash verified','site_id':manifest['project_id']}))
