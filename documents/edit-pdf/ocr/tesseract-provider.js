const DEFAULT_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let scriptPromise=null;

function loadScript(url){
  if(globalThis.Tesseract?.createWorker)return Promise.resolve(globalThis.Tesseract);
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector(`script[data-alltoolforest-ocr="${url}"]`);
    if(existing){
      existing.addEventListener('load',()=>resolve(globalThis.Tesseract),{once:true});
      existing.addEventListener('error',()=>reject(new Error('OCR runtime failed to load.')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=url;
    script.async=true;
    script.crossOrigin='anonymous';
    script.dataset.alltoolforestOcr=url;
    script.onload=()=>globalThis.Tesseract?.createWorker?resolve(globalThis.Tesseract):reject(new Error('OCR runtime loaded without a worker API.'));
    script.onerror=()=>reject(new Error('OCR runtime could not be downloaded. Check your connection and try again.'));
    document.head.append(script);
  });
  return scriptPromise;
}

export function parseTsvWords(tsv,{minConfidence=45}={}){
  const lines=String(tsv||'').split(/\r?\n/);
  if(lines.length<2)return [];
  const out=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i])continue;
    const cols=lines[i].split('\t');
    if(cols.length<12||Number(cols[0])!==5)continue;
    const pageNum=Number(cols[1]),blockNum=Number(cols[2]),paragraphNum=Number(cols[3]),lineNum=Number(cols[4]),wordNum=Number(cols[5]);
    const left=Number(cols[6]),top=Number(cols[7]),width=Number(cols[8]),height=Number(cols[9]),confidence=Number(cols[10]);
    const text=cols.slice(11).join('\t').trim();
    if(!text||![left,top,width,height,confidence].every(Number.isFinite)||width<=0||height<=0||confidence<minConfidence)continue;
    const id=`${pageNum||1}:${blockNum||0}:${paragraphNum||0}:${lineNum||0}:${wordNum||out.length+1}`;
    out.push({id,text,confidence,pageNum,blockNum,paragraphNum,lineNum,wordNum,bbox:{x0:left,y0:top,x1:left+width,y1:top+height}});
  }
  return out;
}

export class TesseractOcrProvider{
  constructor({language='eng',scriptUrl=DEFAULT_SCRIPT,onProgress=null}={}){
    this.language=language;
    this.scriptUrl=scriptUrl;
    this.onProgress=onProgress;
    this.worker=null;
  }

  async ensureWorker(){
    if(this.worker)return this.worker;
    const Tesseract=await loadScript(this.scriptUrl);
    this.worker=await Tesseract.createWorker(this.language,1,{
      logger:message=>{
        const progress=Number(message?.progress);
        this.onProgress?.({status:message?.status||'ocr',progress:Number.isFinite(progress)?progress:null});
      },
    });
    return this.worker;
  }

  async recognize(image,{minConfidence=45}={}){
    const worker=await this.ensureWorker();
    const result=await worker.recognize(image,{}, {text:true,tsv:true});
    return {text:result?.data?.text||'',words:parseTsvWords(result?.data?.tsv,{minConfidence})};
  }

  async terminate(){
    if(!this.worker)return;
    const worker=this.worker;
    this.worker=null;
    try{await worker.terminate();}catch{}
  }
}

export const OCR_RUNTIME={name:'Tesseract.js',version:'6.0.1',scriptUrl:DEFAULT_SCRIPT};
