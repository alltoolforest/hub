// One job per worker. Its filesystem and password disappear on termination.
importScripts('../../../documents/document-editor-v2-lab/pdf-engine/vendor/qpdf-0.3.0/qpdf.js');
self.onmessage=async({data})=>{
  let qpdf;
  try{
    const errors=[],output=[];console.error=(...args)=>errors.push(args.join(' '));console.log=(...args)=>output.push(args.join(' '));
    qpdf=await Module({locateFile:()=>new URL('../../../documents/document-editor-v2-lab/pdf-engine/vendor/qpdf-0.3.0/qpdf.wasm',self.location.href).href,print:()=>{},printErr:line=>errors.push(String(line))});
    qpdf.FS.writeFile('/input.pdf',data.bytes);qpdf.FS.writeFile('/password.txt',data.password+'\n');
    let countCode;try{countCode=qpdf.callMain(['--password-file=/password.txt','--show-npages','/input.pdf']);}catch(error){countCode=error.status??2;}
    if(countCode!==0&&countCode!==3)throw Object.assign(new Error('Unable to unlock this PDF.'),{wrong:/invalid password|incorrect password/i.test(errors.join('\n'))});
    const pageCount=Number(output.find(line=>/^\d+$/.test(line)));
    if(!Number.isInteger(pageCount)||pageCount<1||pageCount>250)throw new Error('Invalid PDF page count.');
    let code;try{code=qpdf.callMain(['--password-file=/password.txt','--decrypt','/input.pdf','/output.pdf']);}catch(error){code=error.status??2;}
    if(code!==0&&code!==3)throw Object.assign(new Error('Unable to unlock this PDF.'),{wrong:/invalid password|incorrect password/i.test(errors.join('\n'))});
    const bytes=qpdf.FS.readFile('/output.pdf');
    if(bytes.length>60*1024*1024)throw new Error('Unlocked PDF exceeds the editing memory limit.');
    self.postMessage({bytes,pageCount},[bytes.buffer]);
  }catch(error){self.postMessage({error:error.wrong?'The password is incorrect. Try again.':'This PDF could not be unlocked safely.',code:error.wrong?'PDF_PASSWORD_INCORRECT':'PDF_UNLOCK_FAILED'});}
  finally{for(const path of ['/input.pdf','/password.txt','/output.pdf'])try{qpdf?.FS.unlink(path);}catch{}}
};
