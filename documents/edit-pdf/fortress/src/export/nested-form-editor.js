import {PDFName,PDFDict,PDFRawStream,decodePDFRawStream} from '../core/pdf-lib.js';

function refKey(ref){return ref?.toString?.()??String(ref);}
function decodedBytes(raw){return new Uint8Array(decodePDFRawStream(raw).getBytes());}
function formSubtype(raw){
  const value=raw?.dict?.lookup?.(PDFName.of('Subtype'));
  try{return (value?.asString?.()||value?.toString?.()||'').replace(/^\//,'');}catch{return '';}
}
function assertForm(ctx,ref,expectedRefKey=null){
  if(!ref)throw Object.assign(new Error('Nested Form XObject disappeared.'),{code:'NESTED_FORM_DISAPPEARED'});
  if(expectedRefKey&&refKey(ref)!==expectedRefKey)throw Object.assign(new Error('Nested Form XObject identity changed.'),{code:'NESTED_FORM_IDENTITY_CHANGED'});
  const raw=ref instanceof PDFRawStream?ref:ctx.lookup(ref);
  if(!(raw instanceof PDFRawStream)||formSubtype(raw)!=='Form')throw Object.assign(new Error('Nested Form XObject stream is unavailable.'),{code:'NESTED_FORM_STREAM_MISSING'});
  return raw;
}
function cloneDecodedDict(ctx,raw){
  const dict=raw.dict.clone(ctx);
  for(const key of ['Length','Filter','DecodeParms','DL','F','FFilter','FDecodeParms'])dict.delete(PDFName.of(key));
  return dict;
}
function effectiveResources(raw,inherited){
  const own=raw.dict.lookup(PDFName.of('Resources'));
  return own instanceof PDFDict?own:inherited;
}

function resolveNestedPath(pdfDoc,pageIndex,formPath){
  if(!Array.isArray(formPath)||formPath.length<2)throw Object.assign(new Error('Nested Form path must contain at least two Form levels.'),{code:'NESTED_FORM_PATH_INVALID'});
  const page=pdfDoc.getPage(pageIndex),ctx=pdfDoc.context;
  let resources=page.node.Resources();
  if(!(resources instanceof PDFDict))throw Object.assign(new Error('Page resources are unavailable.'),{code:'PAGE_RESOURCES_MISSING'});
  const nodes=[];
  for(const entry of formPath){
    const resourceName=String(entry?.resourceName||'');
    if(!resourceName)throw Object.assign(new Error('Nested Form resource name is missing.'),{code:'NESTED_FORM_PATH_INVALID'});
    const xobjects=resources.lookup(PDFName.of('XObject'));
    if(!(xobjects instanceof PDFDict))throw Object.assign(new Error('Nested Form XObject resources are unavailable.'),{code:'NESTED_FORM_XOBJECTS_MISSING'});
    const ref=xobjects.get(PDFName.of(resourceName));
    const raw=assertForm(ctx,ref,entry?.refKey||null);
    const childResources=effectiveResources(raw,resources);
    nodes.push({resourceName,ref,raw,resources,xobjects,childResources});
    resources=childResources;
  }
  return {page,ctx,nodes};
}

export function getNestedFormXObjectStream(pdfDoc,pageIndex,{formPath}={}){
  const {nodes}=resolveNestedPath(pdfDoc,pageIndex,formPath);
  const node=nodes.at(-1);
  return {resourceName:node.resourceName,ref:node.ref,refKey:refKey(node.ref),bytes:decodedBytes(node.raw),rawStream:node.raw,formPath};
}

export function replaceNestedFormXObjectStream(pdfDoc,pageIndex,{formPath}={},newBytes){
  const {page,ctx,nodes}=resolveNestedPath(pdfDoc,pageIndex,formPath);
  const leaf=nodes.at(-1);
  const leafDict=cloneDecodedDict(ctx,leaf.raw);
  let replacementRef=ctx.register(PDFRawStream.of(leafDict,newBytes));

  // Clone every ancestor from the edited leaf back to the page. This prevents
  // a nested edit from mutating another page or sibling invocation that shares
  // any Form object or inherited resource dictionary.
  for(let index=nodes.length-2;index>=0;index--){
    const parent=nodes[index];
    const child=nodes[index+1];
    const resources=parent.childResources;
    if(!(resources instanceof PDFDict))throw Object.assign(new Error('Nested parent resources are unavailable.'),{code:'NESTED_FORM_RESOURCES_MISSING'});
    const xobjects=resources.lookup(PDFName.of('XObject'));
    if(!(xobjects instanceof PDFDict))throw Object.assign(new Error('Nested parent XObjects are unavailable.'),{code:'NESTED_FORM_XOBJECTS_MISSING'});
    const xobjectsClone=xobjects.clone(ctx);
    xobjectsClone.set(PDFName.of(child.resourceName),replacementRef);
    const resourcesClone=resources.clone(ctx);
    resourcesClone.set(PDFName.of('XObject'),xobjectsClone);
    const parentDict=cloneDecodedDict(ctx,parent.raw);
    parentDict.set(PDFName.of('Resources'),resourcesClone);
    replacementRef=ctx.register(PDFRawStream.of(parentDict,decodedBytes(parent.raw)));
  }

  const pageResources=page.node.Resources();
  const pageXObjects=pageResources?.lookup?.(PDFName.of('XObject'));
  if(!(pageResources instanceof PDFDict)||!(pageXObjects instanceof PDFDict))throw Object.assign(new Error('Page XObject resources are unavailable.'),{code:'PAGE_XOBJECTS_MISSING'});
  const outer=nodes[0];
  const pageXObjectsClone=pageXObjects.clone(ctx);
  pageXObjectsClone.set(PDFName.of(outer.resourceName),replacementRef);
  const pageResourcesClone=pageResources.clone(ctx);
  pageResourcesClone.set(PDFName.of('XObject'),pageXObjectsClone);
  page.node.set(PDFName.of('Resources'),pageResourcesClone);
  return {oldLeafRef:leaf.ref,newOuterRef:replacementRef,depth:nodes.length,formPath,resourcesCloned:true};
}
