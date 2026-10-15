// Bounded-memory Flate image reader for ordinary opaque 8-bit RGB/gray scans.
// The decoded pixel count determines work, not whether the PDF may be opened.
// No full-resolution RGBA/image canvas is ever materialized in this path.
export async function streamFlateImage(contents,{width,height,channels,signal,targetWidth,targetHeight,maxRowBytes=32000000}={}){
  if(!(contents instanceof Uint8Array)||![1,3].includes(channels)||
    !Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    !Number.isSafeInteger(width*height*channels)||
    !Number.isSafeInteger(width*channels)||width*channels>maxRowBytes)
    throw Error('unverifiable-flate-image');
  const resize=targetWidth!==undefined||targetHeight!==undefined;
  if(resize&&(!Number.isSafeInteger(targetWidth)||!Number.isSafeInteger(targetHeight)||
    targetWidth<1||targetHeight<1||targetWidth>width||targetHeight>height||
    targetWidth*targetHeight>4000000))throw Error('unsafe-image-output-size');
  if(typeof DecompressionStream!=='function')throw Error('image-stream-decoder-unavailable');
  const rowBytes=width*channels,expected=rowBytes*height,row=resize?new Uint8Array(rowBytes):null;
  const rgb=resize?new Uint8Array(targetWidth*targetHeight*3):null;
  const sums=resize?new Float64Array(targetWidth*3):null;
  const counts=resize?new Uint32Array(targetWidth):null;
  let offset=0,y=0,decoded=0;
  const finishRow=()=>{
    const outY=Math.floor(y*targetHeight/height);
    for(let x=0;x<width;x++){
      const bx=Math.floor(x*targetWidth/width),src=x*channels,dst=bx*3;
      sums[dst]+=row[src];sums[dst+1]+=row[src+(channels===3?1:0)];
      sums[dst+2]+=row[src+(channels===3?2:0)];counts[bx]++;
    }
    y++;
    if(y===height||Math.floor(y*targetHeight/height)!==outY){
      for(let bx=0;bx<targetWidth;bx++){
        if(!counts[bx])throw Error('image-sample-missing');
        const dst=(outY*targetWidth+bx)*3,src=bx*3;
        for(let c=0;c<3;c++)rgb[dst+c]=Math.round(sums[src+c]/counts[bx]);
      }
      sums.fill(0);counts.fill(0);
    }
  };
  // Writing small views directly avoids constructing a duplicate Blob of
  // the entire compressed stream (up to 100 MB on supported input PDFs).
  // Reader and writer run concurrently so backpressure cannot deadlock.
  const decoder=new DecompressionStream('deflate');
  const reader=decoder.readable.getReader(),writer=decoder.writable.getWriter();
  const written=(async()=>{try{
    for(let index=0;index<contents.length;index+=65536){
      if(signal?.aborted)throw Error('cancelled');
      await writer.write(contents.subarray(index,index+65536));
    }
    await writer.close();return null;
  }catch(error){return error;}})();
  try{
    for(;;){
      if(signal?.aborted)throw Error('cancelled');
      const {value,done}=await reader.read();if(done)break;
      decoded+=value.length;
      if(decoded>expected)throw Error('flate-image-size-mismatch');
      if(!resize)continue;
      let i=0;
      while(i<value.length){
        const amount=Math.min(value.length-i,rowBytes-offset);
        row.set(value.subarray(i,i+amount),offset);offset+=amount;i+=amount;
        if(offset===rowBytes){finishRow();offset=0;}
      }
    }
    const writerError=await written;
    if(writerError)throw writerError;
    if(decoded!==expected||(resize&&(y!==height||offset!==0)))throw Error('flate-image-size-mismatch');
    return resize?rgb:{decodedBytes:decoded,rows:height};
  }finally{
    await reader.cancel().catch(()=>{});
    await writer.abort().catch(()=>{});await written;
    reader.releaseLock();writer.releaseLock();
  }
}
