import { PDFName, PDFArray, PDFDict, PDFRawStream, PDFRef, decodePDFRawStream } from './pdf-lib.js';
import { inspectFontResource } from '../fonts/font-inspector.js';
import { allocateSameLengthResourceName, rewriteFormInvocationName } from '../export/form-invocation-rewriter.js';

function key(ref){return ref?.toString?.() ?? String(ref);}
function contentsRefs(page){
  const raw=page.node.get(PDFName.of('Contents'));
  if(!raw) return [];
  if(raw instanceof PDFArray) return raw.asArray();
  return [raw];
}
function decodedStream(ctx,ref){
  const obj=ref instanceof PDFRawStream?ref:ctx.lookup(ref);
  if(!(obj instanceof PDFRawStream)) return null;
  const bytes=decodePDFRawStream(obj).getBytes();
  return {obj,bytes:new Uint8Array(bytes)};
}
function xObjectNames(dict){
  const names=[];
  if(!(dict instanceof PDFDict))return names;
  for(const [name] of dict.entries()){
    const value=name?.asString?.()?.replace(/^\//,'')||name?.toString?.()?.replace(/^\//,'');
    if(value)names.push(value);
  }
  return names;
}
function assertFormStream(ctx,rawRef,expectedRefKey=null){
  if(!rawRef)throw new Error('FORM_XOBJECT_DISAPPEARED');
  if(expectedRefKey&&key(rawRef)!==expectedRefKey)throw new Error('FORM_XOBJECT_CHANGED');
  const oldRaw=rawRef instanceof PDFRawStream?rawRef:ctx.lookup(rawRef);
  if(!(oldRaw instanceof PDFRawStream))throw new Error('FORM_XOBJECT_STREAM_MISSING');
  const subtype=oldRaw.dict.lookup(PDFName.of('Subtype'));
  const subtypeName=subtype?.asString?.()?.replace(/^\//,'')||subtype?.toString?.()?.replace(/^\//,'');
  if(subtypeName!=='Form')throw new Error('FORM_XOBJECT_TYPE_CHANGED');
  return oldRaw;
}
function cloneDecodedStreamDict(ctx,rawStream){
  const dict=rawStream.dict.clone(ctx);
  for(const k of ['Length','Filter','DecodeParms','DL','F','FFilter','FDecodeParms'])dict.delete(PDFName.of(k));
  return dict;
}

export function getPageContentStreams(pdfDoc,pageIndex){
  const page=pdfDoc.getPage(pageIndex); const ctx=pdfDoc.context; const refs=contentsRefs(page);
  return refs.map((ref,streamIndex)=>{
    const d=decodedStream(ctx,ref);
    return {streamIndex,ref,refKey:key(ref),bytes:d?.bytes??new Uint8Array(),rawStream:d?.obj??null};
  });
}

export function buildStreamReferenceCounts(pdfDoc){
  const counts=new Map();
  for(let i=0;i<pdfDoc.getPageCount();i++){
    for(const ref of contentsRefs(pdfDoc.getPage(i))){ const k=key(ref); counts.set(k,(counts.get(k)||0)+1); }
  }
  return counts;
}

export function replacePageContentStream(pdfDoc,pageIndex,streamIndex,newBytes,{cloneShared=true}={}){
  const page=pdfDoc.getPage(pageIndex); const ctx=pdfDoc.context; const raw=page.node.get(PDFName.of('Contents'));
  const refs=contentsRefs(page); if(streamIndex<0||streamIndex>=refs.length) throw new Error('Invalid stream index');
  const counts=buildStreamReferenceCounts(pdfDoc); const oldRef=refs[streamIndex]; const shared=(counts.get(key(oldRef))||0)>1;
  const dict=ctx.obj({}); const newRef=ctx.register(PDFRawStream.of(dict,newBytes));
  if(raw instanceof PDFArray){ raw.set(streamIndex,newRef); }
  else page.node.set(PDFName.of('Contents'),newRef);
  return {oldRef,newRef,sharedCloned:cloneShared&&shared};
}

export function getPageFormXObjectStream(pdfDoc,pageIndex,{resourceName,expectedRefKey=null}={}){
  if(!resourceName)throw new Error('FORM_RESOURCE_NAME_MISSING');
  const page=pdfDoc.getPage(pageIndex); const ctx=pdfDoc.context;
  const resources=page.node.Resources();
  if(!(resources instanceof PDFDict))throw new Error('PAGE_RESOURCES_MISSING');
  const xobjects=resources.lookup(PDFName.of('XObject'));
  if(!(xobjects instanceof PDFDict))throw new Error('PAGE_XOBJECTS_MISSING');
  const rawRef=xobjects.get(PDFName.of(resourceName));
  const raw=assertFormStream(ctx,rawRef,expectedRefKey);
  const d=decodedStream(ctx,rawRef);
  if(!d)throw new Error('FORM_XOBJECT_STREAM_MISSING');
  return {resourceName,ref:rawRef,refKey:key(rawRef),bytes:d.bytes,rawStream:raw};
}

export function replacePageFormXObjectStream(pdfDoc,pageIndex,{resourceName,expectedRefKey=null}={},newBytes){
  if(!resourceName)throw new Error('FORM_RESOURCE_NAME_MISSING');
  const page=pdfDoc.getPage(pageIndex); const ctx=pdfDoc.context;
  const resources=page.node.Resources();
  if(!(resources instanceof PDFDict))throw new Error('PAGE_RESOURCES_MISSING');
  const xobjects=resources.lookup(PDFName.of('XObject'));
  if(!(xobjects instanceof PDFDict))throw new Error('PAGE_XOBJECTS_MISSING');
  const name=PDFName.of(resourceName);
  const oldRef=xobjects.get(name);
  const oldRaw=assertFormStream(ctx,oldRef,expectedRefKey);
  const dict=cloneDecodedStreamDict(ctx,oldRaw);
  const newRef=ctx.register(PDFRawStream.of(dict,newBytes));

  // Page resource dictionaries are frequently shared. Clone both dictionaries
  // before replacing the resource so an edit on one page cannot mutate another
  // page or another invocation of the same form.
  const xobjectsClone=xobjects.clone(ctx);
  xobjectsClone.set(name,newRef);
  const resourcesClone=resources.clone(ctx);
  resourcesClone.set(PDFName.of('XObject'),xobjectsClone);
  page.node.set(PDFName.of('Resources'),resourcesClone);
  return {oldRef,newRef,resourceName,resourcesCloned:true};
}

export function replacePageFormXObjectInvocationStream(pdfDoc,pageIndex,{resourceName,expectedRefKey=null,pageStreamIndex,invocationOperatorIndex}={},newBytes){
  if(!resourceName)throw Object.assign(new Error('Form resource name is missing.'),{code:'FORM_RESOURCE_NAME_MISSING'});
  const streamIndex=Number(pageStreamIndex),operatorIndex=Number(invocationOperatorIndex);
  if(!Number.isInteger(streamIndex)||streamIndex<0||!Number.isInteger(operatorIndex)||operatorIndex<0){
    throw Object.assign(new Error('Form invocation identity is incomplete.'),{code:'FORM_INVOCATION_IDENTITY_MISSING'});
  }
  const page=pdfDoc.getPage(pageIndex); const ctx=pdfDoc.context;
  const resources=page.node.Resources();
  if(!(resources instanceof PDFDict))throw Object.assign(new Error('Page resources are unavailable.'),{code:'PAGE_RESOURCES_MISSING'});
  const xobjects=resources.lookup(PDFName.of('XObject'));
  if(!(xobjects instanceof PDFDict))throw Object.assign(new Error('Page XObjects are unavailable.'),{code:'PAGE_XOBJECTS_MISSING'});
  const oldName=PDFName.of(resourceName);
  const oldRef=xobjects.get(oldName);
  const oldRaw=assertFormStream(ctx,oldRef,expectedRefKey);

  const streams=getPageContentStreams(pdfDoc,pageIndex);
  const pageStream=streams.find(item=>item.streamIndex===streamIndex);
  if(!pageStream)throw Object.assign(new Error('The page stream containing this Form invocation disappeared.'),{code:'FORM_INVOCATION_PAGE_STREAM_MISSING'});

  const newResourceName=allocateSameLengthResourceName(new Set(xObjectNames(xobjects)),resourceName,{seed:streamIndex*4099+operatorIndex});
  if(!newResourceName){
    throw Object.assign(new Error('No safe same-length Form resource name is available for invocation isolation.'),{code:'FORM_INVOCATION_RESOURCE_NAME_UNAVAILABLE'});
  }
  const renamed=rewriteFormInvocationName(pageStream.bytes,{operatorIndex,expectedResourceName:resourceName,newResourceName});

  const formDict=cloneDecodedStreamDict(ctx,oldRaw);
  const newFormRef=ctx.register(PDFRawStream.of(formDict,newBytes));
  const xobjectsClone=xobjects.clone(ctx);
  xobjectsClone.set(PDFName.of(newResourceName),newFormRef);
  const resourcesClone=resources.clone(ctx);
  resourcesClone.set(PDFName.of('XObject'),xobjectsClone);

  const pageReplacement=replacePageContentStream(pdfDoc,pageIndex,streamIndex,renamed.bytes);
  page.node.set(PDFName.of('Resources'),resourcesClone);
  return {
    oldRef,
    newRef:newFormRef,
    originalResourceName:resourceName,
    resourceName:newResourceName,
    pageStreamIndex:streamIndex,
    invocationOperatorIndex:operatorIndex,
    pageStreamCloned:!!pageReplacement.sharedCloned,
    resourcesCloned:true,
  };
}

export function listPageFontContexts(pdfDoc,pageIndex){
  const page=pdfDoc.getPage(pageIndex); const fonts=page.node.Resources()?.lookup(PDFName.of('Font'));
  if(!(fonts instanceof PDFDict)) return [];
  const out=[];
  for(const [name] of fonts.entries()){
    const n=name?.asString?.()?.replace(/^\//,'') || name?.toString?.()?.replace(/^\//,'');
    if(n) out.push(inspectFontResource(pdfDoc,pageIndex,n));
  }
  return out.filter(Boolean);
}

export function detectDocumentFlags(pdfDoc){
  const ctx=pdfDoc.context; const trailer=ctx.trailerInfo||{};
  const encrypted=!!trailer.Encrypt;
  const acroForm=pdfDoc.catalog?.lookup?.(PDFName.of('AcroForm'));
  let hasAcroForm=acroForm instanceof PDFDict;
  let signed=false;
  if(hasAcroForm){
    const visit=(obj,depth=0)=>{
      if(depth>16||signed) return;
      const d=obj instanceof PDFDict?obj:ctx.lookup(obj);
      if(!(d instanceof PDFDict)) return;
      const ft=d.lookup(PDFName.of('FT')); const name=ft?.asString?.()?.replace(/^\//,'')||ft?.toString?.()?.replace(/^\//,'');
      if(name==='Sig'||d.get(PDFName.of('V'))&&name==='Sig'){signed=true;return;}
      const kids=d.lookup(PDFName.of('Kids')); if(kids instanceof PDFArray) for(const k of kids.asArray()) visit(k,depth+1);
    };
    const fields=acroForm.lookup(PDFName.of('Fields'));
    if(fields instanceof PDFArray) for(const f of fields.asArray()) visit(f);
  }
  return {encrypted,hasAcroForm,signed};
}

export class DocumentModel{
  constructor(pdfDoc){this.pdfDoc=pdfDoc;this.flags=detectDocumentFlags(pdfDoc);}
  page(index){
    const page=this.pdfDoc.getPage(index); const mb=page.getMediaBox(); const cb=page.getCropBox();
    return {index,rotation:page.getRotation().angle,mediaBox:mb,cropBox:cb,streams:getPageContentStreams(this.pdfDoc,index),fonts:listPageFontContexts(this.pdfDoc,index)};
  }
}
