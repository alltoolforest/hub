const signature = new Uint8Array([137,80,78,71,13,10,26,10]);
const table = Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(type,data) {
  const bytes=new Uint8Array(data.length+12),v=new DataView(bytes.buffer);
  v.setUint32(0,data.length);for(let i=0;i<4;i++)bytes[4+i]=type.charCodeAt(i);bytes.set(data,8);
  let crc=0xffffffff;for(let i=4;i<bytes.length-4;i++)crc=table[(crc^bytes[i])&255]^(crc>>>8);
  v.setUint32(bytes.length-4,(crc^0xffffffff)>>>0);return bytes;
}
// Only a row and compressor buffers are uncompressed. Encoded Blob parts are
// retained until completion; this is not a guarantee of disk-backed storage.
export class PngStripEncoder {
  constructor(width,height) {
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>0x7fffffff||height>0x7fffffff)throw new Error('Invalid PNG dimensions.');
    this.width=width;this.height=height;this.rows=0;this.parts=[signature];
    const header=new Uint8Array(13),v=new DataView(header.buffer);v.setUint32(0,width);v.setUint32(4,height);header[8]=8;header[9]=6;
    this.parts.push(chunk('IHDR',header),chunk('sRGB',new Uint8Array([0])));
    const stream=new CompressionStream('deflate');this.writer=stream.writable.getWriter();
    this.reading=(async()=>{const reader=stream.readable.getReader();try{while(true){const {value,done}=await reader.read();if(done)break;for(let i=0;i<value.length;i+=65536)this.parts.push(chunk('IDAT',value.subarray(i,i+65536)));}}finally{reader.releaseLock();}})();
    // Observe asynchronous failures even while the producer is working.
    this.reading.catch(()=>{});
  }
  async write(rgba,count) {
    if(this.rows+count>this.height||rgba.length!==this.width*count*4)throw new Error('PNG strip dimensions do not match.');
    const stride=this.width*4;
    for(let y=0;y<count;y++) {
      // PNG Sub filter improves compression without retaining a previous row.
      const row=new Uint8Array(stride+1);row[0]=1;
      for(let x=0;x<stride;x++)row[x+1]=(rgba[y*stride+x]-(x>=4?rgba[y*stride+x-4]:0))&255;
      await this.writer.write(row);
    }
    this.rows+=count;
  }
  async finish() {
    if(this.rows!==this.height)throw new Error('Incomplete PNG output.');
    await this.writer.close();await this.reading;this.parts.push(chunk('IEND',new Uint8Array()));
    const blob=new Blob(this.parts,{type:'image/png'});this.parts=[];return blob;
  }
}

export async function validatePngEnvelope(blob,width,height) {
  if(!(blob instanceof Blob)||blob.size<57)throw new Error('Empty or truncated PNG.');
  const bytes=new Uint8Array(await blob.slice(0,33).arrayBuffer()),v=new DataView(bytes.buffer);
  if(signature.some((b,i)=>bytes[i]!==b)||v.getUint32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR'||v.getUint32(16)!==width||v.getUint32(20)!==height)throw new Error('PNG dimensions do not match.');
  const expected=chunk('IHDR',bytes.slice(16,29));
  if(expected.some((b,i)=>b!==bytes[i+8]))throw new Error('Invalid PNG header checksum.');
  const end=new Uint8Array(await blob.slice(-12).arrayBuffer()),iend=chunk('IEND',new Uint8Array());
  if(iend.some((b,i)=>b!==end[i]))throw new Error('PNG export is incomplete.');
}
