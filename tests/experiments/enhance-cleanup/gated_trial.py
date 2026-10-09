"""Isolated DnCNN cleanup gate experiment. Never imported by the website.
No network calls; models/fixtures/outputs must live outside the repository.
Gates are predeclared hypotheses, not production-quality degradation diagnosis.
"""
import argparse, hashlib, io, json, subprocess, time, types
from pathlib import Path
import numpy as np
from PIL import Image
import torch
REV='fc1732f4a4514e42ce15e5b3a1e18c828af47a1e'
SHA='cef4b4672a121b196a0525453b7091dc457a24b673105b38d623299f06fcc728'
SIGNATURE={'model':SHA,'source':REV,'crop':256,'gate_revision':1,'core':384,'halo':20,'blend':.65,'clip':6,'edge_threshold':32}

def load_model(source, weights):
    assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==REV
    assert hashlib.sha256(weights.read_bytes()).hexdigest()==SHA
    def blob(p):return subprocess.check_output(['git','-C',str(source),'show',REV+':'+p],text=True)
    b=types.ModuleType('pinned_blocks');exec(compile(blob('models/basicblock.py'),'pinned_blocks','exec'),b.__dict__)
    m=types.ModuleType('pinned_dncnn');m.B=b
    exec(compile(blob('models/network_dncnn.py').replace('import models.basicblock as B',''),'pinned_dncnn','exec'),m.__dict__)
    net=m.DnCNN(in_nc=1,out_nc=1,nc=64,nb=20,act_mode='R')
    net.load_state_dict(torch.load(weights,map_location='cpu',weights_only=True),strict=True)
    return net.eval()

def luma(a):return a.astype(np.float32) @ np.array([.2126,.7152,.0722],np.float32)

def block_evidence(a):
    y=luma(a); scores=[]
    # Match the baseline's concept: weak jumps whose immediate neighbors are flat.
    # No resizing: it would erase the JPEG phase evidence.
    for axis in [0,1]:
        z=y if axis==1 else y.T
        jump=np.abs(z[:,2:-2]-z[:,1:-3]);sides=np.abs(z[:,1:-3]-z[:,:-4])+np.abs(z[:,3:-1]-z[:,2:-2])
        valid=(jump<18)&(sides<6)
        means=[];counts=[]
        for phase in range(8):
            columns=(np.arange(2,z.shape[1]-2)%8)==phase
            vals=jump[:,columns][valid[:,columns]];counts.append(vals.size);means.append(float(vals.mean()) if vals.size else 0)
        peak=int(np.argmax(means));floor=sorted(means)[4]
        scores.append({'ratio':means[peak]/max(.15,floor),'jump':means[peak],'samples':counts[peak]})
    return scores

def gate(a, table_mean, policy, portrait=False, faces=None):
    if portrait and not faces:return False,'no verified face mask'
    if table_mean is None:return False,'no JPEG quantization evidence'
    if table_mean>=45:return True,'coarse JPEG quantization'
    if policy=='evidence' and table_mean>=20:
        if any(s['ratio']>=2.4 and s['jump']>=.8 and s['samples']>=40 for s in block_evidence(a)):
            return True,'moderate quantization plus block-phase evidence'
    return False,'insufficient degradation evidence'

def infer(net,a):
    yy=(a.astype(np.float32)@np.array([65.481,128.553,24.966],np.float32)/255+16)/255
    h,w=yy.shape; result=np.empty((h,w),np.float32);tiles=0;start=time.monotonic()
    # Bounded memory; 384px core, 20px exact CNN receptive-field halo, not tiny tiles.
    for y in range(0,h,384):
        for x in range(0,w,384):
            bottom=min(h,y+384);right=min(w,x+384)
            top=max(0,y-20);left=max(0,x-20);endY=min(h,bottom+20);endX=min(w,right+20)
            patch=torch.from_numpy(yy[top:endY,left:endX].copy())[None,None]
            padding=(max(0,20-x),max(0,right+20-w),max(0,20-y),max(0,bottom+20-h))
            patch=torch.nn.functional.pad(patch,padding,mode='reflect')
            with torch.inference_mode(): restored=net(patch)[0,0].numpy()
            result[y:bottom,x:right]=restored[20:20+bottom-y,20:20+right-x];tiles+=1
    delta=(result-yy)*(255*255/219)
    return delta,time.monotonic()-start,tiles

def protect_mask(shape,faces):
    h,w=shape; yy,xx=np.mgrid[:h,:w]; mask=np.ones((h,w),np.float32)
    for x,y,fw,fh in faces or []:
        dx=np.maximum(np.maximum(x-xx,xx-(x+fw)),0)/(fw*.2)
        dy=np.maximum(np.maximum(y-yy,yy-(y+fh)),0)/(fh*.2)
        # Exactly zero within face; feather only outside. No face reconstruction.
        mask=np.minimum(mask,np.clip(np.maximum(dx,dy),0,1))
    return mask

def fuse(a,delta,faces=None):
    yy=luma(a); padded=np.pad(yy,1,mode='edge')
    edge=np.maximum.reduce([np.abs(yy-padded[1:-1,:-2]),np.abs(yy-padded[1:-1,2:]),np.abs(yy-padded[:-2,1:-1]),np.abs(yy-padded[2:,1:-1])])
    weight=.65*np.clip(1-edge/32,0,1)*protect_mask(yy.shape,faces)
    return np.clip(np.round(a.astype(np.float32)+ (np.clip(delta,-6,6)*weight)[...,None]),0,255).astype(np.uint8)

def metrics(a,ref):
    e=a.astype(float)-ref
    ya,yr=luma(a),luma(ref)
    # Gradient-reference error penalizes both erased edges and amplified noise.
    ge=np.concatenate([(np.diff(ya,axis=k)-np.diff(yr,axis=k)).ravel() for k in [0,1]])
    return {'mae':float(np.abs(e).mean()),'mse':float((e*e).mean()),'gradient_mae':float(np.abs(ge).mean())}

def run_case(net,name,im,ref,outdir,faces=None,portrait=False):
    if 'A' in im.getbands():raise ValueError('Opaque-only experiment; transparency must not be discarded')
    a=np.asarray(im.convert('RGB'));tables=getattr(im,'quantization',None)
    qm=float(np.mean(tables[0])) if tables and 0 in tables else None
    decisions={p:gate(a,qm,p,portrait,faces) for p in ['metadata','evidence']}
    delta=None;secs=0;tiles=0
    if any(v[0] for v in decisions.values()):delta,secs,tiles=infer(net,a)
    paths={};base=outdir/name;base.mkdir(parents=True,exist_ok=True)
    Image.fromarray(a).save(base/'input.png');paths['input']=str(base/'input.png')
    if ref is not None:Image.fromarray(ref).save(base/'reference.png');paths['reference']=str(base/'reference.png')
    record={'case':name,'width':im.width,'height':im.height,'quantization_mean':qm,'inference_seconds':secs,'tiles':tiles,'input':metrics(a,ref) if ref is not None else None,'policies':{},'paths':paths}
    for policy,(allowed,reason) in decisions.items():
        out=fuse(a,delta,faces) if allowed else a.copy();Image.fromarray(out).save(base/(policy+'.png'));paths[policy]=str(base/(policy+'.png'))
        item={'allowed':allowed,'reason':reason,'change_mae':float(np.abs(out.astype(float)-a).mean()),'max_channel_change':int(np.max(np.abs(out.astype(int)-a.astype(int))))}
        if ref is not None:item.update(metrics(out,ref))
        if faces:
            protected=protect_mask(a.shape[:2],faces)==0
            item['protected_pixels_unchanged']=bool(np.array_equal(out[protected],a[protected]))
        record['policies'][policy]=item
    return record

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--weights',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--private-dir',type=Path);p.add_argument('--resume',action='store_true');args=p.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parents[3]):raise ValueError('Keep model outputs and user photographs outside the repository')
    args.output.mkdir(parents=True,exist_ok=True)
    manifest=args.output/'manifest.json'
    if args.resume and (args.output/'report.json').exists():
        if not manifest.exists() or json.loads(manifest.read_text())!=SIGNATURE:raise ValueError('Resume configuration does not match this experiment')
    manifest.write_text(json.dumps(SIGNATURE,indent=2)+'\n')
    torch.set_num_threads(2);net=load_model(args.source,args.weights);report=json.loads((args.output/'report.json').read_text()) if args.resume and (args.output/'report.json').exists() else []
    completed={r['case'] for r in report}
    for suite in ['set5','set12']:
        files=sorted(p for p in (args.source/'testsets'/suite).iterdir() if p.suffix.lower() in ['.png','.bmp'])
        assert len(files)==(5 if suite=='set5' else 12), 'Incomplete benchmark suite'
        for file in files:
            image=Image.open(file).convert('RGB');w,h=image.size
            # Fixed native 256px central crop; no resampling. Set12 is held out
            # from previous trials, predominantly grayscale, not a full color benchmark.
            x=max(0,(w-256)//2);y=max(0,(h-256)//2);image=image.crop((x,y,min(w,x+256),min(h,y+256)));ref=np.asarray(image)
            for quality in [None,30,50,70,95]:
                name=f'{suite}-{file.stem}-q{quality or "clean"}'
                if name in completed:continue
                if quality is None:im=image
                else:
                    buffer=io.BytesIO();image.save(buffer,format='JPEG',quality=quality,subsampling=2);buffer.seek(0);im=Image.open(buffer)
                record=run_case(net,f'{suite}-{file.stem}-q{quality or "clean"}',im,ref,args.output)
                report.append(record);print(json.dumps({k:v for k,v in record.items() if k!='paths'}),flush=True)
    # Additional clean content encoded at coarse quality: test harmful false positives.
    yy,xx=np.mgrid[:256,:256]
    for name,a in [('flat',np.full((256,256,3),128,np.uint8)),('grid',np.repeat(np.where(((xx//8+yy//8)%2)[...,None],180,70),3,axis=2).astype(np.uint8)),('ramp',np.repeat(xx[...,None],3,axis=2).astype(np.uint8))]:
        if 'control-'+name in completed:continue
        buf=io.BytesIO();Image.fromarray(a).save(buf,format='JPEG',quality=30,subsampling=2);buf.seek(0)
        report.append(run_case(net,'control-'+name,Image.open(buf),a,args.output))
    if args.private_dir:
        for name,file,faces in [('portrait-old','WhatsApp Image 2026-10-08 at 22.21.28.jpeg',[(200,250,530,600)]),('portrait-sari','T4es1(1).jpg',[(136,65,127,158)])]:
            # Manually supplied mask for offline safety comparison only, not detector evidence.
            if name in completed:continue
            im=Image.open(args.private_dir/file)
            report.append(run_case(net,name,im,None,args.output,faces,True))
    (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
if __name__=='__main__':main()
