// Task 8 session model. The final adaptive UI belongs to Task 11.
import {INPUT_LIMITS} from './input-inspector.mjs';
import {MODES} from './mode-policy.mjs';
import {profileAttempts,validateTargetSize} from './target-size-compression.mjs';
import {digestPDFBytes} from './output-integrity.mjs';
const messages=Object.freeze({
  'file-limit':'This PDF exceeds the current input limit. Select a smaller PDF.',
  'image-pixel-limit':'Images exceed the decoded-pixel budget. Export a lower-resolution PDF.',
  'scalar-resource-limit':'PDF strings exceed safe resource limits. Try a simpler export.',
  'decoded-stream-limit':'Decoded PDF resources exceed safe limits. Try a smaller or lower-resolution PDF.',
  'operator-limit':'This PDF is too complex for supported processing. Try a simpler export.',
  'text-character-limit':'This PDF exceeds the text-verification budget. Try a smaller document.',
  'encrypted-pdf':'Encrypted PDFs are unsupported. Select an authorized unencrypted copy.',
  'signed-pdf':'This PDF has signature markers. Keep the original; compression may invalidate signatures.',
  'unsupported-actions':'This PDF contains unsupported document actions. Keep the original.',
  'unsupported-xfa':'Dynamic XFA forms are unsupported. Keep the original.',
  'invalid-input':'Select a complete PDF.',
  'incomplete-pdf':'This PDF appears incomplete. Download or export a fresh copy.',
  'cancelled':'Cancelled. The original PDF is unchanged.',
  'processing-timeout':'Processing took too long. Retry with a smaller PDF.',
  'worker-failed':'Processing stopped. Retry with a smaller PDF or close other browser tabs.',
  'memory-limit':'Insufficient memory for this operation. Try a smaller PDF or close other tabs.',
  'invalid-target-size':'Enter a valid target size in MB.',
  'target-requires-lossy-mode':'Target size requires Balanced, Strong, or Maximum Compression.',
  'invalid-verified-target-candidate':'A target-size attempt did not pass output verification.'
});
export function describeProcessingError(error){
  const candidate=error?.name==='RangeError'?'memory-limit':error?.code;
  const code=typeof candidate==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(candidate)?candidate:'processing-failed';
  const limit=Number.isSafeInteger(error?.maxBytes)&&error.maxBytes>0&&error.maxBytes<=INPUT_LIMITS.maxBytes?error.maxBytes:null;
  return Object.freeze({code,message:code==='file-limit'&&limit?
    'This PDF exceeds this device’s '+(limit/1000000).toFixed(2)+' MB limit. Select a smaller PDF.':Object.hasOwn(messages,code)?messages[code]:
    'This PDF could not be verified safely. Keep the original and try a fresh or smaller export.'});
}
const copy=value=>structuredClone(value);
export function createCompressionSession({engine,onChange=()=>{},limits=INPUT_LIMITS,
  createURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url)}={}){
  if(typeof engine?.inspect!=='function'||typeof engine?.compress!=='function')
    throw new TypeError('Verified worker engine required');
  let state='empty',source=null,output=null,error=null,controller=null,generation=0;
  const snapshot=()=>Object.freeze({state,error,source:source?Object.freeze({name:source.name,
    size:source.size,report:copy(source.report)}):null,
    result:output?Object.freeze({...copy(output.summary),url:output.url,name:output.name}):null,
    canRetry:Boolean(source)&&!['loading','processing'].includes(state),
    canDownload:state==='completed'&&Boolean(output)});
  const notify=()=>onChange(snapshot());
  const clearOutput=()=>{if(output)revokeURL(output.url);output=null;};
  const invalidate=()=>{generation++;controller?.abort();controller=null;};
  const reset=()=>{invalidate();clearOutput();source=null;error=null;state='empty';notify();};
  return {
    snapshot,
    async select(file){
      if(state==='processing')throw Error('processing-already-in-progress');
      invalidate();clearOutput();error=null;state='loading';
      const token=generation,abort=new AbortController();controller=abort;notify();
      try{
        if(!file||!Number.isSafeInteger(file.size)||file.size<16)throw {code:'invalid-input'};
        if(file.size>limits.maxBytes)throw {code:'file-limit',maxBytes:limits.maxBytes};
        // File-owned operations must never eagerly materialize the entire
        // source on the main thread. The trusted inspection worker hashes the
        // exact bytes it inspected; the final independently verified receipt
        // must bind to that same source digest before a Blob can be downloaded.
        const fileOwned=typeof Blob!=='undefined'&&file instanceof Blob&&
          typeof engine.inspectFile==='function'&&typeof engine.compressFile==='function';
        let bytes=null,digest;
        if(!fileOwned){
          bytes=new Uint8Array(await file.arrayBuffer());
          if(token!==generation)return {status:'stale'};
          if(bytes.length!==file.size)throw {code:'invalid-input'};
          digest=await digestPDFBytes(bytes);
          if(token!==generation)return {status:'stale'};
        }
        const report=await (fileOwned?engine.inspectFile(file,{signal:abort.signal}):engine.inspect(bytes,{signal:abort.signal}));
        if(token!==generation)return {status:'stale'};
        if(report?.valid!==true||report.sourceBytes!==file.size)throw {code:'invalid-input'};
        if(fileOwned){
          // No hash = no trusted File ownership. Never silently downgrade to
          // an unverified or byte-unbound compression result.
          if(!/^[a-f0-9]{64}$/.test(report.sourceDigest??''))throw {code:'invalid-input'};
          digest=report.sourceDigest;
        }
        if(token!==generation)return {status:'stale'};
        source={bytes,file:fileOwned?file:null,size:file.size,name:String(file.name??'document.pdf'),report:copy(report),digest};
        controller=null;state='ready';notify();return {status:'ready'};
      }catch(cause){
        if(token!==generation)return {status:'stale'};
        controller=null;error=describeProcessingError(cause);state='failed';notify();return {status:'failed',error};
      }
    },
    async compress(mode='balanced',{targetBytes}={}){
      if(!MODES.includes(mode))throw new RangeError('Unsupported compression mode');
      if(!source||['loading','processing'].includes(state))throw Error('source-not-ready');
      if(targetBytes!==undefined)validateTargetSize(targetBytes,{sourceBytes:source.size,mode});
      invalidate();clearOutput();error=null;state='processing';
      const token=generation,abort=new AbortController();controller=abort;notify();
      try{
        const result=await (source.file?engine.compressFile(source.file,{mode,targetBytes,signal:abort.signal}):engine.compress(source.bytes,{mode,targetBytes,signal:abort.signal}));
        if(token!==generation)return {status:'stale'};
        const bytes=result?.bytes?.slice(),receipt=result?.integrity;
        if(!(bytes instanceof Uint8Array)||receipt?.version!==1||receipt.mode!==mode||
          result.mode!==mode||receipt.sourceDigest!==source.digest||
          receipt.inputBytes!==source.size||receipt.outputBytes!==bytes.length||
          receipt.savedBytes!==source.size-bytes.length||receipt.savedBytes<0||
          result.inputBytes!==receipt.inputBytes||result.outputBytes!==receipt.outputBytes||
          result.savedBytes!==receipt.savedBytes||receipt.independentTextVerified!==true||
          (receipt.savedBytes===0&&receipt.outputDigest!==source.digest)||
          result.status!==(receipt.savedBytes>0?'compressed':'original-retained')||
          await digestPDFBytes(bytes)!==receipt.outputDigest||
          (targetBytes===undefined?result.target!==undefined:
            (result.target?.requestedBytes!==targetBytes||
              result.settings?.requestedTargetBytes!==targetBytes||
              result.target?.reached!==(bytes.length<=targetBytes)||
              !profileAttempts[mode]?.includes(result.target?.effectiveMode)||
              result.target.effectiveMode!==result.settings?.effectiveMode)))
          throw {code:'invalid-output-receipt'};
        if(token!==generation)return {status:'stale'};
        const {bytes:ignored,...summary}=result;
        const name=source.name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069/\\]/g,'-').replace(/\.pdf$/i,'').slice(0,100)||'document';
        const url=createURL(new Blob([bytes],{type:'application/pdf'}));
        output={url,name:name+'-'+mode+'.pdf',summary:copy(summary)};
        controller=null;state='completed';notify();return {status:'completed'};
      }catch(cause){
        if(token!==generation)return {status:'stale'};
        controller=null;error=describeProcessingError(cause);state='failed';notify();return {status:'failed',error};
      }
    },
    cancel(){
      if(!['loading','processing'].includes(state))return false;
      invalidate();clearOutput();state='cancelled';error=null;notify();return true;
    },
    reset,dispose:reset
  };
}
