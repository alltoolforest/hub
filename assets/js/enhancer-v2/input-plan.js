export function reducedDimensions(width,height,maxPixels) {
  const scale=Math.min(1,Math.sqrt(maxPixels/(width*height)),2048/Math.max(width,height));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export function memoryAdvice(meta,deviceMemory=4) {
  // Advice only. Browser allocations cannot be predicted from system RAM.
  const budget=Math.min(768,Math.max(192,(Number(deviceMemory)||4)*64))*1048576;
  const estimated=meta?meta.width*meta.height*8+96*1048576:0;
  return {estimated,budget,caution:!!meta&&estimated>budget};
}
export async function inspectPhoto(file) {
  const read=async(start,size)=>new Uint8Array(await file.slice(start,start+size).arrayBuffer());
  const head=await read(0,32),dv=new DataView(head.buffer);
  if(head.length>=8&&((head[0]===73&&head[1]===73)||(head[0]===77&&head[1]===77))) {
    const le=head[0]===73;
    if(dv.getUint16(2,le)===42) {
      const off=dv.getUint32(4,le);
      if(off+2<=file.size){const countBytes=await read(off,2),count=new DataView(countBytes.buffer).getUint16(0,le);
        if(off+2+count*12<=file.size){const entries=await read(off+2,count*12),v=new DataView(entries.buffer);let width=0,height=0,orientation=1;
          for(let i=0;i<count;i++){const p=i*12,tag=v.getUint16(p,le),type=v.getUint16(p+2,le);if(v.getUint32(p+4,le)!==1)continue;const value=type===3?v.getUint16(p+8,le):type===4?v.getUint32(p+8,le):0;if(tag===256)width=value;if(tag===257)height=value;if(tag===274)orientation=value;}
          if(width&&height)return orientation>=5&&orientation<=8?{width:height,height:width,format:'TIFF'}:{width,height,format:'TIFF'};
        }
      }
    }
  }
  if(head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71&&head.length>=24)return {width:dv.getUint32(16),height:dv.getUint32(20),format:'PNG'};
  if(head[0]===255&&head[1]===216) {
    let offset=2,orientation=1;
    // Read marker segments without loading the encoded photo into one array.
    while(offset+4<=file.size) {
      const marker=await read(offset,4);if(marker[0]!==255)break;
      const type=marker[1];if(type===255){offset++;continue;}if(type===0xda||type===0xd9)break;
      if(type===0x01||(type>=0xd0&&type<=0xd7)){offset+=2;continue;}
      const length=(marker[2]<<8)|marker[3];if(length<2||offset+2+length>file.size)break;
      if(type===0xe1) {
        const ex=await read(offset+4,length-2);
        try {
          if(String.fromCharCode(...ex.slice(0,4))==='Exif') {
            const v=new DataView(ex.buffer),le=v.getUint16(6)===0x4949,ifd=6+v.getUint32(10,le),count=v.getUint16(ifd,le);
            for(let i=0;i<count;i++){const p=ifd+2+i*12;if(v.getUint16(p,le)===274)orientation=v.getUint16(p+8,le);}
          }
        }catch{}
      }
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(type)) {
        const s=await read(offset+4,5),height=(s[1]<<8)|s[2],width=(s[3]<<8)|s[4];return orientation>=5&&orientation<=8?{width:height,height:width,format:'JPEG'}:{width,height,format:'JPEG'};
      }
      offset+=length+2;
    }
  }
  if(String.fromCharCode(...head.slice(0,3))==='GIF')return {width:dv.getUint16(6,true),height:dv.getUint16(8,true),format:'GIF (first frame)'};
  if(head[0]===66&&head[1]===77)return {width:Math.abs(dv.getInt32(18,true)),height:Math.abs(dv.getInt32(22,true)),format:'BMP'};
  if(String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP') {
    const kind=String.fromCharCode(...head.slice(12,16));
    if(kind==='VP8X')return {width:1+head[24]+(head[25]<<8)+(head[26]<<16),height:1+head[27]+(head[28]<<8)+(head[29]<<16),format:'WebP'};
    if(kind==='VP8 ')return {width:dv.getUint16(26,true)&16383,height:dv.getUint16(28,true)&16383,format:'WebP'};
    if(kind==='VP8L'){const bits=dv.getUint32(21,true);return {width:(bits&16383)+1,height:((bits>>>14)&16383)+1,format:'WebP'};}
  }
  return null;
}
