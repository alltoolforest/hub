// Selection checks file boundaries only. Full structural, security, resource and
// independent-content inspection is mandatory inside compressAndVerifyPDF.
export async function preflightPDFFile(file,{signal,limits}={}){
 signal?.throwIfAborted();
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 if(!file||!Number.isSafeInteger(file.size)||file.size<16)fail('invalid-input');
 if(file.size>limits.maxBytes)fail('file-limit');
 const [head,tail]=await Promise.all([file.slice(0,16).text(),file.slice(Math.max(0,file.size-1024)).text()]);
 signal?.throwIfAborted();
 if(!/^%PDF-1\.[0-7](?:\s|$)/.test(head)&&!/^%PDF-2\.0(?:\s|$)/.test(head))fail('unsupported-header');
 if(!/%%EOF\s*$/.test(tail))fail('incomplete-pdf');
 return {valid:true,sourceBytes:file.size,preflightOnly:true};
}
