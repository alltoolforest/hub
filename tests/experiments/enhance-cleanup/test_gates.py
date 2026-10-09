"""Safety properties and exact tile-halo parity for the isolated experiment."""
import importlib.util, os, unittest
from pathlib import Path
import numpy as np
import torch
spec=importlib.util.spec_from_file_location('trial',Path(__file__).with_name('gated_trial.py'));trial=importlib.util.module_from_spec(spec);spec.loader.exec_module(trial)
class GateTests(unittest.TestCase):
 def test_unknown_portrait_skips(self):
  a=np.full((64,64,3),120,np.uint8)
  for p in ['metadata','evidence']:self.assertFalse(trial.gate(a,100,p,portrait=True)[0])
 def test_no_jpeg_and_high_quality_skip(self):
  a=np.full((64,64,3),120,np.uint8)
  for q in [None,5.76]:
   for p in ['metadata','evidence']:self.assertFalse(trial.gate(a,q,p)[0])
 def test_face_pixels_exact_and_correction_bounded(self):
  a=np.random.default_rng(10).integers(40,160,(80,80,3),dtype=np.uint8)
  out=trial.fuse(a,np.full((80,80),50,np.float32),[(20,20,30,30)])
  np.testing.assert_array_equal(out[20:51,20:51],a[20:51,20:51]);self.assertLessEqual(np.max(np.abs(out.astype(int)-a)),4)
 def test_overlap_and_feather(self):
  mask=trial.protect_mask((100,100),[(20,20,40,40),(50,50,30,30)])
  self.assertEqual(mask[50,50],0);self.assertEqual(mask[65,65],0);self.assertGreater(mask[40,17],0);self.assertLess(mask[40,17],1)
 def test_real_network_strip_halo_matches_full_frame(self):
  root=os.environ.get('CLEANUP_TRIAL_ROOT')
  if not root:self.skipTest('Pinned external model required for inference parity')
  root=Path(root);torch.set_num_threads(2);net=trial.load_model(root/'KAIR',root/'dncnn3.pth')
  a=np.random.default_rng(7).integers(30,220,(72,450,3),dtype=np.uint8)
  delta,_,tiles=trial.infer(net,a);self.assertEqual(tiles,2)
  yy=(a.astype(np.float32)@np.array([65.481,128.553,24.966],np.float32)/255+16)/255
  x=torch.nn.functional.pad(torch.from_numpy(yy)[None,None],(20,20,20,20),mode='reflect')
  with torch.inference_mode():full=(net(x)[0,0,20:-20,20:-20].numpy()-yy)*(255*255/219)
  np.testing.assert_allclose(delta,full,rtol=0,atol=.001)
if __name__=='__main__':unittest.main()
