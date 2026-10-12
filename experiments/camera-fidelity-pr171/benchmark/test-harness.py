"""Fail-closed checks for the calibration harness; uses a prepared external corpus."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
runner=Path(__file__).with_name('run.mjs')
corpus=json.loads(Path(sys.argv[1]).read_text())
with tempfile.TemporaryDirectory(prefix='atf-benchmark-gate-') as temp:
 root=Path(temp)
 cases=[('input-hash',lambda x:x.update(input_sha256='0'*64),'Input hash mismatch'),('held-out',lambda x:x.update(split='held-out'),'Held-out cases'),('shape',lambda x:x.update(width=x['width']+1),'AssertionError'),('roi',lambda x:x.update(rois=[{'id':'bad','box':[-1,0,5,5]}]),'Invalid ROI')]
 for name,mutate,expected in cases:
  c=copy.deepcopy(corpus);c['cases']=c['cases'][:1];mutate(c['cases'][0]);path=root/(name+'.json');path.write_text(json.dumps(c))
  result=subprocess.run(['node',str(runner),str(path),str(root/name)],capture_output=True,text=True)
  assert result.returncode!=0 and expected in result.stderr,(name,result.stderr)
  print('PASS reject:',name)
 result=subprocess.run(['node',str(runner),sys.argv[1],str(runner.parent/'forbidden-output')],capture_output=True,text=True)
 assert result.returncode!=0 and 'Outputs must be outside repository' in result.stderr
 print('PASS reject: repository output')
