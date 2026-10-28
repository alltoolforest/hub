import '../../assets/vendor/pdf-lib.js';
import {buildCandidate} from './engine.js';
self.onmessage=async({data})=>{
  try {
    const bytes=await buildCandidate(data.sources,data.items,self.PDFLib,{blankSize:data.blankSize,onProgress:(value,message)=>self.postMessage({progress:value,message})});
    self.postMessage({bytes},[bytes.buffer]);
  }catch(error){self.postMessage({error:error?.message||'Export failed safely.'});}
};
