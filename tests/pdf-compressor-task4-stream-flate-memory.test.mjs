import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {streamFlateImage} from '../assets/js/pdf-compressor-v2/streaming-flate-image.mjs';
const compressed=data=>new Uint8Array(deflateSync(data,{level:6}));
test('streaming RGB image probes the exact byte count without a Blob source copy',async()=>{
 const width=400,height=300,bytes=new Uint8Array(width*height*3);
 for(let i=0;i<bytes.length;i++)bytes[i]=(i*37+3)%256;
 const result=await streamFlateImage(compressed(bytes),{width,height,channels:3,maxRowBytes:1200});
 assert.deepEqual(result,{decodedBytes:bytes.length,rows:height});
});
test('streaming Flate image does not materialize a complete duplicate Blob',async()=>{
 const previous=globalThis.Blob;
 globalThis.Blob=class ForbiddenBlob {constructor(){throw Error('unexpected-full-source-copy');}};
 try{
  const width=256,height=32,raw=new Uint8Array(width*height);
  for(let i=0;i<raw.length;i++)raw[i]=i%251;
  const report=await streamFlateImage(compressed(raw),{width,height,channels:1,maxRowBytes:width});
  assert.equal(report.decodedBytes,raw.length);
 }finally{globalThis.Blob=previous;}
});
test('streaming downsample outputs exactly the reference row-binning pixels',async()=>{
 const width=48,height=22,channels=3,raw=new Uint8Array(width*height*3);
 for(let i=0;i<raw.length;i++)raw[i]=(i*29+13)%256;
 const outWidth=8,outHeight=5,result=await streamFlateImage(compressed(raw),{
   width,height,channels,targetWidth:outWidth,targetHeight:outHeight,maxRowBytes:width*channels
 });
 const expected=new Uint8Array(outWidth*outHeight*3);
 for(let by=0;by<outHeight;by++)for(let bx=0;bx<outWidth;bx++){
  const sum=[0,0,0];let count=0;
  for(let y=0;y<height;y++){
   if(Math.floor(y*outHeight/height)!==by)continue;
   for(let x=0;x<width;x++){
    if(Math.floor(x*outWidth/width)!==bx)continue;
    for(let c=0;c<3;c++)sum[c]+=raw[(y*width+x)*3+c];
    count++;
   }
  }
  for(let c=0;c<3;c++)expected[(by*outWidth+bx)*3+c]=Math.round(sum[c]/count);
 }
 assert.deepEqual(result,expected);
});
test('streaming Flate rejects declared size mismatch, unsafe rows and cancellation',async()=>{
 const data=compressed(new Uint8Array(2048));
 await assert.rejects(streamFlateImage(data,{width:10,height:10,channels:3}),
   /flate-image-size-mismatch/);
 await assert.rejects(streamFlateImage(data,{width:300,height:10,channels:3,maxRowBytes:128}),
   /unverifiable-flate-image/);
 await assert.rejects(streamFlateImage(data,{width:300,height:10,channels:3,
   signal:AbortSignal.abort()}),/cancelled/);
});
