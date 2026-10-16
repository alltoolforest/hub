import assert from 'node:assert/strict';
import {PngStripEncoder,validatePngEnvelope} from '../assets/js/enhancer-v2/png-stream.js';
function pixel(x,y,c){return c===3?(x+y)%256:(x*3+y*7+c*41)%256;}
async function check(width,height){
 const encoder=new PngStripEncoder(width,height);let peak=process.memoryUsage().rss;
 for(let y=0;y<height;y+=32){const rows=Math.min(32,height-y),a=new Uint8Array(width*rows*4);for(let yy=0;yy<rows;yy++)for(let x=0;x<width;x++)for(let c=0;c<4;c++)a[(yy*width+x)*4+c]=pixel(x,y+yy,c);await encoder.write(a,rows);peak=Math.max(peak,process.memoryUsage().rss);}
 const blob=await encoder.finish();await validatePngEnvelope(blob,width,height);
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer),parts=[];let pos=8;
 while(pos<bytes.length){const len=view.getUint32(pos),type=String.fromCharCode(...bytes.slice(pos+4,pos+8));if(type==='IDAT')parts.push(bytes.slice(pos+8,pos+8+len));pos+=12+len;}
 // Independent inflate and unfilter of every exported pixel, including alpha.
 const stream=new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')),reader=stream.getReader();
 let x=-1,y=0,channels=[0,0,0,0],samples=0;
 while(true){const {done,value}=await reader.read();if(done)break;for(const b of value){if(x===-1){assert.equal(b,1);x=0;channels=[0,0,0,0];continue;}const c=x%4,v=(b+channels[c])&255;channels[c]=v;assert.equal(v,pixel(Math.floor(x/4),y,c));samples++;x++;if(x===width*4){x=-1;y++;}}}
 assert.equal(samples,width*height*4);assert.equal(y,height);
 await assert.rejects(()=>validatePngEnvelope(blob,width+1,height));await assert.rejects(()=>validatePngEnvelope(blob.slice(0,-1),width,height));
 console.log(JSON.stringify({width,height,megapixels:width*height/1e6,bytes:blob.size,peakRssMiB:Math.round(peak/1048576),status:'PASS full pixel and alpha roundtrip'}));
}
await check(37,43);await check(12000,8500);
