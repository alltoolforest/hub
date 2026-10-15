// Task 4: bounded-memory legacy PDF filter decoders.
// Unlike PDF.decodePDFRawStream(...).decode(), neither decoder expands a
// potentially hostile stream before its allocation limit is checked.
// Preserve original PDF data and never infer output validity from this alone.
export class LegacyFilterError extends Error {
  constructor(code){super(code);this.name='LegacyFilterError';this.code=code;}
}
const fail=code=>{throw new LegacyFilterError(code);};
const check=(bytes,maxBytes,signal)=>{
  if(signal?.aborted)fail('cancelled');
  if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(maxBytes)||maxBytes<1)
    fail('invalid-decoder-budget');
};
class BoundedOutput {
  constructor(limit){this.limit=limit;this.parts=[];this.part=null;this.used=0;this.length=0;}
  #room(){
    if(this.length>=this.limit)fail('decoded-stream-limit');
    if(!this.part||this.used===this.part.length){
      this.part=new Uint8Array(Math.min(65536,this.limit-this.length));
      this.parts.push(this.part);this.used=0;
    }
  }
  push(byte){this.#room();this.part[this.used++]=byte;this.length++;}
  repeated(byte,count){
    if(count>this.limit-this.length)fail('decoded-stream-limit');
    for(let n=0;n<count;n++)this.push(byte);
  }
  slice(bytes,start,length){
    if(length>this.limit-this.length)fail('decoded-stream-limit');
    for(let copied=0;copied<length;){
      this.#room();
      const take=Math.min(length-copied,this.part.length-this.used);
      this.part.set(bytes.subarray(start+copied,start+copied+take),this.used);
      this.used+=take;this.length+=take;copied+=take;
    }
  }
  finish(){
    const result=new Uint8Array(this.length);let offset=0;
    for(let index=0;index<this.parts.length;index++){
      const part=this.parts[index];
      const size=index===this.parts.length-1?this.used:part.length;
      result.set(part.subarray(0,size),offset);offset+=size;
    }
    return result;
  }
}
export function decodeRunLengthBounded(bytes,maxBytes,{signal}={}){
  check(bytes,maxBytes,signal);
  const out=new BoundedOutput(maxBytes);let i=0,sawEnd=false,steps=0;
  while(i<bytes.length){
    if((++steps&4095)===0&&signal?.aborted)fail('cancelled');
    const length=bytes[i++];
    if(length===128){sawEnd=true;break;}
    if(length<=127){
      const size=length+1;
      if(size>bytes.length-i)fail('invalid-runlength-stream');
      out.slice(bytes,i,size);i+=size;
    }else{
      if(i>=bytes.length)fail('invalid-runlength-stream');
      out.repeated(bytes[i++],257-length);
    }
  }
  if(!sawEnd)fail('invalid-runlength-stream');
  return out.finish();
}
export function decodeLZWBounded(bytes,maxBytes,{signal,earlyChange=1}={}){
  check(bytes,maxBytes,signal);
  if(![0,1].includes(earlyChange))fail('invalid-lzw-early-change');
  const prefix=new Uint16Array(4096),suffix=new Uint8Array(4096),
    stack=new Uint8Array(4097),out=new BoundedOutput(maxBytes);
  let next=258,bits=9,prev=-1,bitPosition=0,steps=0,sawEnd=false;
  const getCode=()=>{
    if(bitPosition+bits>bytes.length*8)fail('invalid-lzw-stream');
    let code=0;
    for(let n=0;n<bits;n++){
      const index=bitPosition++,byte=bytes[index>>>3];
      code=(code<<1)|((byte>>>(7-(index&7)))&1);
    }
    return code;
  };
  const expand=code=>{
    let length=0,loops=0;
    while(code>=256){
      if(code>=next||code>4095||++loops>4096)fail('invalid-lzw-stream');
      stack[length++]=suffix[code];code=prefix[code];
    }
    if(code<0||code>255)fail('invalid-lzw-stream');
    stack[length++]=code;
    return length;
  };
  while(bitPosition+bits<=bytes.length*8){
    if((++steps&4095)===0&&signal?.aborted)fail('cancelled');
    const code=getCode();
    if(code===256){next=258;bits=9;prev=-1;continue;}
    if(code===257){sawEnd=true;break;}
    if(code>next||(code===next&&prev<0))fail('invalid-lzw-stream');
    const special=code===next;
    const size=expand(special?prev:code);
    const first=stack[size-1];
    const required=size+(special?1:0);
    if(required>maxBytes-out.length)fail('decoded-stream-limit');
    for(let n=size-1;n>=0;n--)out.push(stack[n]);
    if(special)out.push(first);
    if(prev>=0&&next<=4095){
      prefix[next]=prev;suffix[next]=first;next++;
      if(bits<12&&next+earlyChange===(1<<bits))bits++;
    }
    prev=code;
  }
  if(signal?.aborted)fail('cancelled');
  if(!sawEnd)fail('invalid-lzw-stream');
  return out.finish();
}

// Decode ASCII filters incrementally. Avoid the former full-encoded-string
// TextDecoder + whitespace-regex copies for large PDFs. Enforce the same
// per-stream output budget at every emitted byte.
const whitespace=byte=>byte===0||byte===9||byte===10||byte===12||byte===13||byte===32;
export function decodeASCIIStreamBounded(bytes,filter,maxBytes,{signal}={}){
  check(bytes,maxBytes,signal);
  const out=new BoundedOutput(maxBytes);let i=0,steps=0;
  const advance=()=>{while(i<bytes.length&&whitespace(bytes[i]))i++;};
  const tick=()=>{if((++steps&4095)===0&&signal?.aborted)fail('cancelled');};
  if(filter==='/ASCIIHexDecode'){
    let high=-1,ended=false;
    for(;i<bytes.length;i++){
      tick();const byte=bytes[i];
      if(whitespace(byte))continue;
      if(byte===62){ended=true;i++;break;} // '>' optional end marker
      const digit=byte>=48&&byte<=57?byte-48:
        byte>=65&&byte<=70?byte-55:byte>=97&&byte<=102?byte-87:-1;
      if(digit<0)fail('invalid-ascii-hex');
      if(high<0)high=digit;
      else{out.push((high<<4)|digit);high=-1;}
    }
    if(ended){advance();if(i!==bytes.length)fail('invalid-ascii-hex');}
    if(high>=0)out.push(high<<4);
    return out.finish();
  }
  if(filter!=='/ASCII85Decode')fail('invalid-ascii-filter');
  advance();
  if(bytes[i]===60&&bytes[i+1]===126)i+=2; // optional '<~'
  const digits=[];let ended=false;
  const emit=(count)=>{
    let number=0;
    for(const digit of digits)number=number*85+digit;
    if(number>0xffffffff)fail('invalid-ascii85');
    if(count>maxBytes-out.length)fail('decoded-stream-limit');
    for(let n=0;n<count;n++)out.push((number>>>((3-n)*8))&255);
    digits.length=0;
  };
  for(;i<bytes.length;i++){
    tick();const byte=bytes[i];
    if(whitespace(byte))continue;
    if(byte===126){
      if(bytes[i+1]!==62)fail('invalid-ascii85');
      i+=2;ended=true;break;
    }
    if(byte===122){
      if(digits.length)fail('invalid-ascii85');
      out.repeated(0,4);continue;
    }
    const digit=byte-33;
    if(digit<0||digit>84)fail('invalid-ascii85');
    digits.push(digit);
    if(digits.length===5)emit(4);
  }
  if(!ended)fail('invalid-ascii85');
  advance();if(i!==bytes.length)fail('invalid-ascii85');
  if(digits.length===1)fail('invalid-ascii85');
  if(digits.length){
    const count=digits.length-1;
    while(digits.length<5)digits.push(84);
    emit(count);
  }
  if(signal?.aborted)fail('cancelled');
  return out.finish();
}
