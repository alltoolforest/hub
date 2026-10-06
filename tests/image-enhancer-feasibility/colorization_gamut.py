"""Experimental chroma-only gamut mapping; no application import.

Uses pinned scikit-image 0.25.2's D65 conversion matrix. Hold L fixed and reduce
predicted a/b together where needed, preserving their direction. This does not
correct wrong color predictions, establish historical accuracy, or repair bleed.
"""
import warnings
import numpy as np
from skimage.color import lab2xyz
from skimage.color.colorconv import rgb_from_xyz

def map_chroma(lab):
    lab=np.asarray(lab,dtype=np.float64)
    if lab.ndim!=3 or lab.shape[2]!=3 or not np.isfinite(lab).all():
        raise ValueError('Finite HxWx3 Lab required')
    if np.any(lab[:,:,0]<0) or np.any(lab[:,:,0]>100):
        raise ValueError('L must be in [0,100]')
    def linear(scale):
        candidate=lab.copy();candidate[:,:,1:]*=scale[:,:,None]
        with warnings.catch_warnings():
            warnings.simplefilter('ignore',UserWarning)
            xyz=lab2xyz(candidate)
        return xyz @ rgb_from_xyz.T
    def valid(rgb):return ((rgb>=-1e-7)&(rgb<=1+1e-7)).all(axis=2)
    full=linear(np.ones(lab.shape[:2]));inside=valid(full)
    low=np.zeros(lab.shape[:2]);high=np.ones(lab.shape[:2])
    for _ in range(16):
        middle=(low+high)/2;ok=valid(linear(middle))
        low=np.where(ok,middle,low);high=np.where(ok,high,middle)
    scale=np.where(inside,1.,low)
    rgb=np.clip(linear(scale),0,1)
    display=np.where(rgb>0.0031308,1.055*np.power(rgb,1/2.4)-.055,12.92*rgb)
    return display,scale
