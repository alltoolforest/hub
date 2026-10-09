"""Export the pinned experimental model and a public JPEG parity fixture."""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from gated_trial import load_model
p=argparse.ArgumentParser();p.add_argument('lab',type=Path);a=p.parse_args();lab=a.lab.resolve()
if lab.is_relative_to(Path(__file__).resolve().parents[3]):raise ValueError('Export only outside the repository')
torch.set_num_threads(2);model=load_model(lab/'KAIR',lab/'dncnn3.pth')
torch.onnx.export(model,torch.zeros(1,1,64,64),str(lab/'dncnn3.onnx'),input_names=['input'],output_names=['output'],dynamic_axes={'input':{2:'height',3:'width'},'output':{2:'height',3:'width'}},opset_version=17)
a=np.asarray(Image.open(lab/'results/set5-baby-q30/input.png').convert('RGB'),dtype=np.float32)
if a.shape!=(256,256,3):raise ValueError('Expected native 256x256 public fixture')
y=(a@np.array([65.481,128.553,24.966],np.float32)/255+16)/255
x=torch.nn.functional.pad(torch.from_numpy(y)[None,None],(20,20,20,20),mode='reflect')
with torch.inference_mode():expected=model(x)
x.numpy().tofile(lab/'input.f32');expected.numpy().tofile(lab/'expected.f32')
print('Exported ONNX and 296x296 input/expected tensors outside the repository.')
