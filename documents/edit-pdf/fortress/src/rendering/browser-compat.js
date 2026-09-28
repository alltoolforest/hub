function defineValue(target,key,value){
  if(!target||key in target)return;
  try{Object.defineProperty(target,key,{configurable:true,writable:true,value});}
  catch{try{target[key]=value;}catch{}}
}

function isIosLike(){
  if(typeof navigator==='undefined')return false;
  const ua=String(navigator.userAgent||'');
  const platform=String(navigator.platform||'');
  return /iPad|iPhone|iPod/i.test(ua)||(platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
}

function decodeBase64(value,{alphabet='base64'}={}){
  let source=String(value||'').replace(/\s+/g,'');
  if(alphabet==='base64url')source=source.replace(/-/g,'+').replace(/_/g,'/');
  source=source.replace(/=+$/,'');
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out=[];
  let buffer=0,bits=0;
  for(const ch of source){
    const index=chars.indexOf(ch);
    if(index<0)throw new SyntaxError('Invalid base64 data');
    buffer=(buffer<<6)|index;bits+=6;
    if(bits>=8){bits-=8;out.push((buffer>>bits)&255);}
  }
  return new Uint8Array(out);
}

function encodeBase64(bytes,{alphabet='base64',omitPadding=false}={}){
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out='';
  for(let i=0;i<bytes.length;i+=3){
    const a=bytes[i],b=i+1<bytes.length?bytes[i+1]:0,c=i+2<bytes.length?bytes[i+2]:0;
    const n=(a<<16)|(b<<8)|c;
    out+=chars[(n>>18)&63]+chars[(n>>12)&63]+(i+1<bytes.length?chars[(n>>6)&63]:'=')+(i+2<bytes.length?chars[n&63]:'=');
  }
  if(omitPadding)out=out.replace(/=+$/,'');
  if(alphabet==='base64url')out=out.replace(/\+/g,'-').replace(/\//g,'_');
  return out;
}

function installUrlParse(){
  if(typeof URL==='undefined'||typeof URL.parse==='function')return;
  defineValue(URL,'parse',function parse(url,base){try{return base===undefined?new URL(url):new URL(url,base);}catch{return null;}});
}
function installPromiseCompat(){
  if(typeof Promise==='undefined')return;
  defineValue(Promise,'withResolvers',function withResolvers(){
    let resolve,reject;
    const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
    return {promise,resolve,reject};
  });
  defineValue(Promise,'try',function promiseTry(callback,...args){
    return new Promise(resolve=>resolve(callback(...args)));
  });
}
function installAbortSignalAny(){
  if(typeof AbortSignal==='undefined'||typeof AbortController==='undefined'||typeof AbortSignal.any==='function')return;
  defineValue(AbortSignal,'any',function any(signals){
    const controller=new AbortController();
    const list=Array.from(signals||[]);
    const abortFrom=signal=>{
      if(controller.signal.aborted)return;
      try{controller.abort(signal?.reason);}catch{controller.abort();}
    };
    for(const signal of list){
      if(!signal)continue;
      if(signal.aborted){abortFrom(signal);break;}
      try{signal.addEventListener('abort',()=>abortFrom(signal),{once:true});}
      catch{signal.addEventListener?.('abort',()=>abortFrom(signal));}
    }
    return controller.signal;
  });
}
function installCollectionCompat(){
  if(typeof Map!=='undefined'){
    defineValue(Map.prototype,'getOrInsert',function getOrInsert(key,defaultValue){if(this.has(key))return this.get(key);this.set(key,defaultValue);return defaultValue;});
    defineValue(Map.prototype,'getOrInsertComputed',function getOrInsertComputed(key,callback){if(typeof callback!=='function')throw new TypeError('callback must be a function');if(this.has(key))return this.get(key);const value=callback(key);this.set(key,value);return value;});
  }
  if(typeof Object!=='undefined')defineValue(Object,'hasOwn',function hasOwn(object,key){return Object.prototype.hasOwnProperty.call(Object(object),key);});
  if(typeof Array!=='undefined'){
    defineValue(Array.prototype,'findLast',function findLast(callback,thisArg){if(typeof callback!=='function')throw new TypeError('callback must be a function');for(let i=this.length-1;i>=0;i--)if(callback.call(thisArg,this[i],i,this))return this[i];return undefined;});
    defineValue(Array.prototype,'findLastIndex',function findLastIndex(callback,thisArg){if(typeof callback!=='function')throw new TypeError('callback must be a function');for(let i=this.length-1;i>=0;i--)if(callback.call(thisArg,this[i],i,this))return i;return -1;});
  }
}
function installNumericCompat(){
  if(typeof Math!=='undefined'&&typeof Math.sumPrecise!=='function'){
    defineValue(Math,'sumPrecise',function sumPrecise(numbers){
      if(numbers==null||typeof numbers[Symbol.iterator]!=='function')throw new TypeError('numbers must be iterable');
      const partials=[];let count=0,positiveInfinity=false,negativeInfinity=false;
      for(const value of numbers){
        if(typeof value!=='number')throw new TypeError('Math.sumPrecise accepts numbers only');
        count++;if(Number.isNaN(value))return NaN;if(value===Infinity){positiveInfinity=true;continue;}if(value===-Infinity){negativeInfinity=true;continue;}
        let x=value,i=0;
        for(let j=0;j<partials.length;j++){let y=partials[j];if(Math.abs(x)<Math.abs(y)){const tmp=x;x=y;y=tmp;}const hi=x+y,lo=y-(hi-x);if(lo!==0)partials[i++]=lo;x=hi;}
        partials.length=i;partials.push(x);
      }
      if(positiveInfinity&&negativeInfinity)return NaN;if(positiveInfinity)return Infinity;if(negativeInfinity)return -Infinity;if(count===0)return -0;
      let total=0;for(let i=partials.length-1;i>=0;i--)total+=partials[i];return total;
    });
  }
  if(typeof ArrayBuffer!=='undefined'){
    defineValue(ArrayBuffer.prototype,'transferToFixedLength',function transferToFixedLength(newLength=this.byteLength){
      const length=Math.max(0,Number(newLength)||0);const out=new ArrayBuffer(length);new Uint8Array(out).set(new Uint8Array(this,0,Math.min(this.byteLength,length)));return out;
    });
  }
}
function installByteCompat(){
  if(typeof Uint8Array!=='undefined'){
    defineValue(Uint8Array,'fromBase64',function fromBase64(value,options){return decodeBase64(value,options);});
    defineValue(Uint8Array.prototype,'toBase64',function toBase64(options){return encodeBase64(this,options);});
    defineValue(Uint8Array.prototype,'toHex',function toHex(){let out='';for(const value of this)out+=value.toString(16).padStart(2,'0');return out;});
  }
  if(typeof Response!=='undefined')defineValue(Response.prototype,'bytes',async function bytes(){return new Uint8Array(await this.arrayBuffer());});
}

function readBlobWithFileReader(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error||new Error('Could not read binary data.'));
    reader.onabort=()=>reject(new Error('Binary read was cancelled.'));
    reader.onload=()=>reader.result instanceof ArrayBuffer?resolve(reader.result):reject(new Error('Binary read did not return an ArrayBuffer.'));
    try{reader.readAsArrayBuffer(blob);}catch(error){reject(error);}
  });
}

function installBlobArrayBuffer(){
  if(typeof Blob==='undefined'||typeof FileReader==='undefined')return;
  const nativeArrayBuffer=typeof Blob.prototype.arrayBuffer==='function'?Blob.prototype.arrayBuffer:null;
  if(nativeArrayBuffer&&!isIosLike())return;
  const compatibleArrayBuffer=function arrayBuffer(){
    const blob=this;
    if(isIosLike()){
      return readBlobWithFileReader(blob).catch(error=>nativeArrayBuffer?nativeArrayBuffer.call(blob):Promise.reject(error));
    }
    if(nativeArrayBuffer)return nativeArrayBuffer.call(blob);
    return readBlobWithFileReader(blob);
  };
  try{Object.defineProperty(Blob.prototype,'arrayBuffer',{configurable:true,writable:true,value:compatibleArrayBuffer});}
  catch{if(!nativeArrayBuffer)try{Blob.prototype.arrayBuffer=compatibleArrayBuffer;}catch{}}
}

function installWeakReferenceFallbacks(){
  if(typeof globalThis.WeakRef==='undefined')globalThis.WeakRef=class WeakRefFallback{constructor(value){this.value=value;}deref(){return this.value;}};
  if(typeof globalThis.FinalizationRegistry==='undefined')globalThis.FinalizationRegistry=class FinalizationRegistryFallback{constructor(){}register(){}unregister(){return false;}};
}

export function ensurePdfjsRuntimeCompat(){
  installUrlParse();installPromiseCompat();installAbortSignalAny();installCollectionCompat();installNumericCompat();installByteCompat();installBlobArrayBuffer();installWeakReferenceFallbacks();
}

export function pdfjsRuntimeReport(){
  ensurePdfjsRuntimeCompat();
  const missing=[];
  if(typeof Promise==='undefined')missing.push('Promise');
  if(typeof Uint8Array==='undefined'||typeof ArrayBuffer==='undefined')missing.push('typed arrays');
  if(typeof URL==='undefined')missing.push('URL');
  if(typeof TextDecoder==='undefined'||typeof TextEncoder==='undefined')missing.push('TextEncoder/TextDecoder');
  if(typeof ReadableStream==='undefined')missing.push('ReadableStream');
  if(typeof AbortController==='undefined'||typeof AbortSignal==='undefined')missing.push('AbortController');
  return {ok:missing.length===0,missing};
}

export function assertPdfjsRuntimeCompatible(){
  const report=pdfjsRuntimeReport();
  if(report.ok)return report;
  const error=new Error(`This browser is missing PDF features required by the editor: ${report.missing.join(', ')}.`);
  error.code='BROWSER_PDF_RUNTIME_UNSUPPORTED';error.missing=report.missing;throw error;
}
