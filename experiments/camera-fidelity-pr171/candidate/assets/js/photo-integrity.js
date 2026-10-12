// Candidate-only catastrophic-fault guards; not a photographic-quality certificate.
export function assertDimensions(w,h){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>16384||h>16384||w*h>32000000)throw new RangeError('Supported input is up to 32MP and 16384 pixels per side.');}
export function assertFiniteTree(v,path='plan'){if(typeof v==='number'&&!Number.isFinite(v))throw new Error(`Non-finite value at ${path}`);if(v&&typeof v==='object')for(const[k,c]of Object.entries(v))assertFiniteTree(c,`${path}.${k}`);}
const Y=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
export function createIntegrity(width,height){assertDimensions(width,height);return {width,height,nextRow:0,pixels:0,opaque:0,sumDelta:0,sourceY:0,outputY:0,previousDelta:null,maxRowShiftJump:0,newLow:0,newHigh:0};}
export function inspectStrip(s,src,out,start,rows,globalStart){
 const w=s.width;
 if(!(src instanceof Uint8ClampedArray)||!(out instanceof Uint8ClampedArray)||out.length!==w*rows*4||start<0||(start+rows)*w*4>src.length||globalStart!==s.nextRow||globalStart+rows>s.height)throw new Error('Invalid or out-of-order output strip');
 for(let y=0;y<rows;y++){let sd=0,n=0,bad=0,badColor=0;
  for(let x=0;x<w;x++){const p=((start+y)*w+x)*4,q=(y*w+x)*4;
   if(out[q+3]!==src[p+3])throw new Error('Alpha integrity failure');
   if(src[p+3]!==255){for(let c=0;c<3;c++)if(src[p+c]!==out[q+c])throw new Error('Transparent pixel changed');continue;}
   const a=Y(src,p),b=Y(out,q);if((b>254&&a<160)||(b<1&&a>90))bad++;
   if(Math.max(Math.abs(out[q]-b-src[p]+a),Math.abs(out[q+1]-b-src[p+1]+a),Math.abs(out[q+2]-b-src[p+2]+a))>90)badColor++;
   sd+=b-a;n++;s.sourceY+=a;s.outputY+=b;
   for(let c=0;c<3;c++){s.sumDelta+=Math.abs(out[q+c]-src[p+c]);s.newLow+=out[q+c]===0&&src[p+c]>0?1:0;s.newHigh+=out[q+c]===255&&src[p+c]<255?1:0;}
  }
  if(n){const d=sd/n;if(badColor/n>.8)throw new Error('Severe source-relative false color detected');if(bad/n>.7||Math.abs(d)>100)throw new Error('Catastrophic whiteout/blackout or tone shift detected');if(s.previousDelta!==null){const jump=Math.abs(d-s.previousDelta);s.maxRowShiftJump=Math.max(s.maxRowShiftJump,jump);if(jump>65)throw new Error('Abrupt source-relative row shift detected');}s.previousDelta=d;s.opaque+=n;}else s.previousDelta=null;
 }
 s.pixels+=w*rows;s.nextRow+=rows;
}
export function finishIntegrity(s){if(s.nextRow!==s.height||s.pixels!==s.width*s.height)throw new Error('Incomplete output');return {passed:true,scope:'catastrophic faults only; visual review required',width:s.width,height:s.height,alphaPreserved:true,meanChange:s.opaque?s.sumDelta/(s.opaque*3):0,meanLumaShift:s.opaque?(s.outputY-s.sourceY)/s.opaque:0,newClippedLowChannels:s.newLow,newClippedHighChannels:s.newHigh,maxRowShiftJump:s.maxRowShiftJump};}
export async function assertPNG(blob,w,h){if(!(blob instanceof Blob)||blob.type!=='image/png'||blob.size<33)throw new Error('PNG encoding failed');const b=new Uint8Array(await blob.slice(0,24).arrayBuffer()),v=new DataView(b.buffer);if([137,80,78,71,13,10,26,10].some((x,i)=>b[i]!==x)||v.getUint32(8)!==13||v.getUint32(12)!==0x49484452||v.getUint32(16)!==w||v.getUint32(20)!==h)throw new Error('Encoded PNG dimensions or signature invalid');}
