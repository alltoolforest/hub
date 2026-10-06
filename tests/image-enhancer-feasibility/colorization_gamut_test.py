import unittest
import numpy as np
from skimage.color import rgb2lab,lab2rgb
from colorization_gamut import map_chroma

class GamutTests(unittest.TestCase):
    def test_neutral_black_gray_white(self):
        lab=np.zeros((1,3,3));lab[0,:,0]=[0,50,100]
        rgb,scale=map_chroma(lab)
        # D65 matrix rounding clips white very slightly in the reference library.
        expected=lab2rgb(lab)
        self.assertLessEqual(np.max(np.abs(rgb2lab(rgb)[:,:,0]-lab[:,:,0])),
                             np.max(np.abs(rgb2lab(expected)[:,:,0]-lab[:,:,0]))+1e-7)
        np.testing.assert_allclose(rgb,expected,atol=1e-7)
    def test_extreme_chroma_preserves_luminance(self):
        lab=np.array([[[25,120,-120],[50,120,120],[90,-120,120]]],dtype=float)
        rgb,scale=map_chroma(lab)
        self.assertTrue(np.all((rgb>=0)&(rgb<=1)))
        self.assertTrue(np.all(scale<1))
        self.assertLess(np.max(np.abs(rgb2lab(rgb)[:,:,0]-lab[:,:,0])),1e-4)
        clipped=lab2rgb(lab)
        self.assertGreater(np.max(np.abs(rgb2lab(clipped)[:,:,0]-lab[:,:,0])),1)
    def test_in_gamut_colors_unchanged(self):
        rgb=np.array([[[.2,.3,.4],[.8,.5,.3]]]);lab=rgb2lab(rgb)
        mapped,scale=map_chroma(lab)
        np.testing.assert_allclose(mapped,rgb,atol=1e-6)
        np.testing.assert_array_equal(scale,np.ones((1,2)))
    def test_invalid_values_rejected_without_mutation(self):
        for lab in [np.zeros((3,3)),np.array([[[101,0,0]]]),np.array([[[50,np.nan,0]]])]:
            with self.assertRaises(ValueError):map_chroma(lab)
        lab=np.array([[[50,100,100]]],dtype=float);original=lab.copy()
        map_chroma(lab);np.testing.assert_array_equal(lab,original)

if __name__=='__main__':unittest.main()
