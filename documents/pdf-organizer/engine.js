import {buildOrganizedPdf, initialPlan} from '../../assets/js/pdf-organizer-integrity.js';

export function safeFilename(value) {
  let s=String(value||'organized').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\/:*?"<>|]/g,'_').replace(/[. ]+$/g,'').replace(/\.pdf$/i,'').slice(0,120);
  if(!s || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)) s='organized';
  return s+'.pdf';
}

// Reject active PDF content; do not silently delete or execute it.
export function inspectSecurity(doc,P) {
  const N=P.PDFName.of, seen=new Set();
  const stack=doc.context.enumerateIndirectObjects().map(([,o])=>o);
  while(stack.length) {
    const o=stack.pop(); if(!o || seen.has(o))continue; seen.add(o);
    if(o instanceof P.PDFStream) {stack.push(o.dict);continue;}
    if(o instanceof P.PDFArray) {stack.push(...o.asArray());continue;}
    if(!(o instanceof P.PDFDict))continue;
    for(const key of ['JS','JavaScript','AA','OpenAction','XFA','RichMediaContent'])
      if(o.has(N(key)))throw Error('This PDF contains active or unsupported content ('+key+'). Use a trusted PDF editor to make a safe copy.');
    const action=o.get(N('S'))?.toString();
    if(action && ['/JavaScript','/Launch','/SubmitForm','/ImportData','/GoToR','/GoToE','/Rendition','/Movie','/Sound'].includes(action))throw Error('Active PDF actions are not supported safely.');
    const uri=doc.context.lookup(o.get(N('URI')));
    if(uri && (!uri.decodeText || !/^(https?:|mailto:)/i.test(uri.decodeText())))throw Error('Unsupported link protocol in PDF.');
    if(o.get(N('Type'))?.toString()==='/Sig' || o.get(N('FT'))?.toString()==='/Sig' || o.has(N('ByteRange')))throw Error('Digitally signed PDFs cannot be changed without invalidating their signatures.');
    for(const key of o.keys())stack.push(o.get(key));
  }
}

// Conservative resource-admission guard used by both the inspection worker
// and the export worker. This catches plainly pathological page geometry and
// image dictionaries before PDF.js is asked to render them. It does NOT bound
// decompression, object-stream expansion or total browser memory.
export function assertResourceAdmission(doc,P) {
  const N=P.PDFName.of, lookup=v=>doc.context.lookup(v);
  for (const page of doc.getPages()) {
    const width=page.getWidth(),height=page.getHeight();
    if(!Number.isFinite(width)||!Number.isFinite(height)||
       width<=0||height<=0||width>100000||height>100000) {
      throw Error('This PDF contains unsupported or excessive page dimensions.');
    }
  }
  let imageCount=0;
  for(const [,object] of doc.context.enumerateIndirectObjects()) {
    if(!(object instanceof P.PDFStream)||
       object.dict.get(N('Subtype'))?.toString()!=='/Image')continue;
    imageCount++;
    if(imageCount>20000)throw Error('This PDF contains too many embedded images to inspect safely.');
    const width=lookup(object.dict.get(N('Width')));
    const height=lookup(object.dict.get(N('Height')));
    const w=width instanceof P.PDFNumber?width.asNumber():NaN;
    const h=height instanceof P.PDFNumber?height.asNumber():NaN;
    if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||
       w<1||h<1||w*h>250000000) {
      throw Error('This PDF contains an unsupported or excessively large embedded image.');
    }
  }
}

// Streamed expansion admission: an on-disk PDF can be a few kilobytes but
// contain tens of megabytes of Flate content. This guard runs in the source
// inspection worker BEFORE PDF.js preview and again in the export worker.
// It intentionally fails closed on unknown stacked Flate filters and missing
// browser decompression support. It is not a whole-process memory guarantee.
export async function assertExpandedStreamBudget(doc,P,{
  perStreamLimit=24*1024*1024,totalLimit=128*1024*1024
}={}) {
  const N=P.PDFName.of,ctx=doc.context;
  const streams=ctx.enumerateIndirectObjects();
  let total=0,checked=0;
  const threshold=(bytes,label)=>{
    if(!Number.isSafeInteger(bytes)||bytes<0||bytes>perStreamLimit ||
       total+bytes>totalLimit) {
      throw Error('PDF decompression memory budget exceeded ('+label+'). A safer, smaller PDF is required.');
    }
    total+=bytes;
  };
  for(const [,object] of streams) {
    if(!(object instanceof P.PDFStream))continue;
    const encoded=object.getContents();
    threshold(encoded.length,'encoded streams');
    const filters=ctx.lookup(object.dict.get(N('Filter')));
    const list=filters instanceof P.PDFArray?filters.asArray().map(v=>ctx.lookup(v)?.toString()):
      filters?[filters.toString()]:[];
    if(!list.some(x=>x==='/FlateDecode'||x==='/Fl'))continue;
    if(list.length!==1) {
      // Reject rather than underestimate expansion behind ASCII85/LZW
      // and other layered decoders which cannot be streamed here.
      throw Error('Layered PDF Flate streams require a trusted PDF converter before organizing.');
    }
    if(typeof DecompressionStream!=='function') {
      throw Error('This browser cannot safely inspect compressed PDF streams.');
    }
    let offset=0,expanded=0;
    const input=new ReadableStream({pull(controller){
      if(offset>=encoded.length){controller.close();return;}
      const next=Math.min(offset+65536,encoded.length);
      controller.enqueue(encoded.subarray(offset,next));
      offset=next;
    }});
    const reader=input.pipeThrough(new DecompressionStream('deflate')).getReader();
    try {
      for(;;) {
        const {value,done}=await reader.read();
        if(done)break;
        expanded+=value.byteLength;
        if(expanded>perStreamLimit||total+expanded>totalLimit)
          throw Error('PDF decompression memory budget exceeded (expanded stream). Reduce or convert this PDF before organizing.');
      }
    }catch(error){
      // A malformed compressed stream must never reach the preview renderer.
      if(/budget exceeded/i.test(error.message))throw error;
      throw Error('Cannot safely decode a PDF compressed stream: '+error.message);
    }finally{
      try{await reader.cancel();}catch{}
      try{reader.releaseLock();}catch{}
    }
    // Count expanded bytes, not encoded bytes, against the total budget.
    total-=encoded.length;
    threshold(expanded,'expanded streams');
    checked++;
  }
  return {bytes:total,flateStreams:checked};
}

// Reference-number independent graph fingerprint, including original compressed
// stream bytes. Parent links are excluded only for the top-level page node.
export function fingerprint(doc,object,P,topPage=false) {
  const seen=new Map(); let budget=300000;
  function visit(o,top=false) {
    if(--budget<0)throw Error('PDF object graph exceeds the verification budget.');
    if(o instanceof P.PDFRef) {const r=doc.context.lookup(o);if(!r)throw Error('PDF contains an unresolved object reference.');return visit(r,top);}
    if(o===undefined)return 'undefined';
    if(o===null)return 'null';
    if(o instanceof P.PDFDict || o instanceof P.PDFArray || o instanceof P.PDFStream) {
      if(seen.has(o))return '@'+seen.get(o); seen.set(o,seen.size);
      if(o instanceof P.PDFArray)return '['+o.asArray().map(x=>visit(x)).join('|')+']';
      if(o instanceof P.PDFStream) {
        // Two independent 32-bit checksums avoid retaining a hex copy of huge streams.
        let a=2166136261,b=5381;const bytes=o.getContents();
        for(const x of bytes){a=Math.imul(a^x,16777619);b=Math.imul(b,33)^x;}
        return visit(o.dict)+'stream:'+bytes.length+':'+(a>>>0)+':'+(b>>>0);
      }
      return '{'+o.keys().map(k=>k.toString()).filter(k=>!(top&&['/Parent','/Rotate'].includes(k))).sort().map(k=>k+':'+visit(o.get(P.PDFName.of(k.slice(1))))).join('|')+'}';
    }
    return o.toString();
  }
  return visit(object,topPage);
}

// Same-document exports retain object numbers. For page deletion, reject if
// a removed content stream or image/form resource remains reachable in output.
// Fonts are not page content and are excluded from this conservative check.
function verifyRemovedStreams(source,output,kept,P){
  const N=P.PDFName.of,removed=source.getPages().filter((_,i)=>!kept.has(i));
  const refs=new Set(),visited=new Set();
  function collect(value){
    if(!value)return;
    if(value instanceof P.PDFRef){const object=source.context.lookup(value);if(object instanceof P.PDFStream)refs.add(value.toString());if(visited.has(object))return;visited.add(object);collect(object);return;}
    if(value instanceof P.PDFArray){for(const child of value.asArray())collect(child);}
    else if(value instanceof P.PDFStream){const resources=source.context.lookup(value.dict.get(N('Resources')));collect(resources?.get?.(N('XObject')));}
    else if(value instanceof P.PDFDict){for(const key of value.keys())collect(value.get(key));}
  }
  for(const page of removed){
    collect(page.node.get(N('Contents')));
    const resources=source.context.lookup(page.node.getInheritableAttribute(N('Resources')));
    collect(resources?.get?.(N('XObject')));
  }
  const live=new Set(output.context.enumerateIndirectObjects().map(([ref])=>ref.toString()));
  if([...refs].some(ref=>live.has(ref)))throw Error('Removed-page content is still referenced by retained pages or document structures. Export blocked; use a dedicated redaction workflow.');
}

function verifyNoHiddenPages(doc,P){
  const visible=new Set(doc.getPages().map(p=>p.ref.toString()));
  for(const [ref,obj] of doc.context.enumerateIndirectObjects())if(obj instanceof P.PDFDict&&obj.get(P.PDFName.of('Type'))?.toString()==='/Page'&&!visible.has(ref.toString()))throw Error('Export verification found a hidden page object. Download blocked.');
}

// Removing a page is not a redaction operation. Document-level attachments
// can retain complete copies of deleted pages, independently of page-tree
// reachability. Refuse deletion rather than presenting a misleading safe export.
// Other metadata and retained-page content are explicitly outside any claim of
// confidential-data sanitization.
export function assertNoDetachedAttachmentsOnRemoval(doc,P) {
  const N=P.PDFName.of, catalog=doc.catalog;
  const names=doc.context.lookup(catalog.get(N('Names')));
  if (catalog.has(N('AF')) || catalog.has(N('Collection')) ||
      names instanceof P.PDFDict && names.has(N('EmbeddedFiles'))) {
    throw Error('This PDF contains document attachments that could retain removed-page information. Page removal is blocked; use a dedicated secure PDF sanitization workflow.');
  }
}

function assertCopySafe(doc,P) {
  const N=P.PDFName.of;
  const allowed=new Set(['/Type','/Pages']);
  for(const k of doc.catalog.keys())if(!allowed.has(k.toString()))throw Error('Combining, duplicating or inserting pages in PDFs with document structures ('+k+') is not yet supported safely. Reorder/rotate the original document instead.');
  for(const page of doc.getPages()) {
    const allowedPage=new Set(['/Type','/Parent','/Contents','/Resources','/MediaBox','/CropBox','/BleedBox','/TrimBox','/ArtBox','/Rotate','/UserUnit','/Annots']);
    for(const key of page.node.keys())if(!allowedPage.has(key.toString()))throw Error('Unsupported page structure for copy: '+key);
    const annots=page.node.Annots();if(annots&&annots.size())throw Error('Annotations cannot safely be copied in this candidate.');
    for(const key of ['StructParents','AA','PieceInfo','B'])if(page.node.has(N(key)))throw Error('This PDF has annotations, tags or page structures that cannot safely be copied.');
  }
}

export async function buildCandidate(sources,items,P,{blankSize='match',signal,onProgress=()=>{}}={}) {
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  const tick=async(p,m)=>{onProgress(p,m);await new Promise(r=>setTimeout(r,0));check();};
  check();
  if(!Array.isArray(items)||!items.length||items.length>2000)throw Error('Choose between 1 and 2,000 output pages for this candidate.');
  const ids=new Set(items.filter(i=>!i.blank).map(i=>i.src));
  const docs=new Map();
  for(const id of ids){
    const s=sources.find(x=>x.id===id);if(!s)throw Error('Source PDF is missing.');
    const doc=await P.PDFDocument.load(s.bytes,{updateMetadata:false,throwOnInvalidObject:true});
    inspectSecurity(doc,P);assertResourceAdmission(doc,P);await assertExpandedStreamBudget(doc,P);docs.set(id,doc);check();
  }
  for(const it of items) {
    if(!Number.isInteger(it.rot)||it.rot<0||it.rot>=360||it.rot%90)throw Error('Invalid page rotation.');
    if(!it.blank&&(!Number.isInteger(it.page)||it.page<0||it.page>=docs.get(it.src).getPageCount()))throw Error('Invalid source page.');
  }
  const unique=new Set(items.filter(i=>!i.blank).map(i=>i.src+':'+i.page));
  const preserve=ids.size===1&&!items.some(i=>i.blank)&&unique.size===items.length;
  if(preserve) {
    const id=[...ids][0],doc=docs.get(id),original=initialPlan(doc);
    const reordered=items.some((it,i)=>i>0&&it.page<items[i-1].page);
    if(reordered && doc.catalog.has(P.PDFName.of('StructTreeRoot')))throw Error('Reordering this tagged PDF could invalidate its reading order. Export blocked to preserve accessibility.');
    const used=new Set(items.map(i=>i.page));
    if (used.size<doc.getPageCount()) assertNoDetachedAttachmentsOnRemoval(doc,P);
    const plan=items.map(it=>({...original[it.page],rotation:(original[it.page].rotation+it.rot)%360})).concat(original.filter(i=>!used.has(i.index)).map(i=>({...i,keep:false})));
    const bytes=await buildOrganizedPdf(sources.find(s=>s.id===id).bytes,plan,P,{signal,onProgress});
    const output=await P.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
    inspectSecurity(output,P);verifyNoHiddenPages(output,P);
    if(used.size<doc.getPageCount())verifyRemovedStreams(doc,output,used,P);
    // Content, resource and bounding-box verification independent of page refs.
    for(let i=0;i<items.length;i++) {
      const before=doc.getPage(items[i].page),after=output.getPage(i);
      for(const key of ['Contents','Resources','MediaBox','CropBox','BleedBox','TrimBox','ArtBox']) {
        const n=P.PDFName.of(key);
        const get=p=>p.node.getInheritableAttribute(n);
        if(fingerprint(doc,get(before),P)!==fingerprint(output,get(after),P))throw Error('Export verification failed: page content/resources changed.');
      }
      await tick(90+Math.floor(9*(i+1)/items.length),'Checking page content '+(i+1)+'/'+items.length);
    }
    return bytes;
  }
  for(const doc of docs.values())assertCopySafe(doc,P);
  // Do not silently choose one source's metadata when combining documents.
  if(docs.size>1)for(const doc of docs.values()) {
    const info=doc.context.lookup(doc.context.trailerInfo.Info);
    if(info?.keys().length)throw Error('Combining PDFs with document metadata is not yet supported without data loss.');
  }
  const out=await P.PDFDocument.create({updateMetadata:false});
  const only=docs.size===1?[...docs.values()][0]:null;
  if(only?.context.trailerInfo.Info) {
    const copier=P.PDFObjectCopier.for(only.context,out.context);
    out.context.trailerInfo.Info=copier.copy(only.context.trailerInfo.Info);
  }
  let last=P.PageSizes.A4;const expected=[];
  for(let i=0;i<items.length;i++) {
    const it=items[i];let page;
    if(it.blank) {const size=blankSize==='a4'?P.PageSizes.A4:blankSize==='letter'?P.PageSizes.Letter:last;page=out.addPage([...size]);}
    else {const doc=docs.get(it.src);[page]=await out.copyPages(doc,[it.page]);out.addPage(page);last=[page.getWidth(),page.getHeight()];}
    page.setRotation(P.degrees((page.getRotation().angle+it.rot)%360));
    expected.push({fp:fingerprint(out,page.node,P,true),rot:page.getRotation().angle,w:page.getWidth(),h:page.getHeight()});
    await tick(10+Math.floor(60*(i+1)/items.length),'Building page '+(i+1)+'/'+items.length);
  }
  const bytes=await out.save({updateFieldAppearances:false});check();
  const verified=await P.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
  verifyNoHiddenPages(verified,P);
  if(verified.getPageCount()!==items.length)throw Error('Export page count verification failed.');
  for(let i=0;i<expected.length;i++) {
    const page=verified.getPage(i),e=expected[i];
    if(page.getRotation().angle!==e.rot || page.getWidth()!==e.w || page.getHeight()!==e.h || fingerprint(verified,page.node,P,true)!==e.fp)throw Error('Export page integrity verification failed.');
    await tick(80+Math.floor(19*(i+1)/items.length),'Verifying page '+(i+1)+'/'+items.length);
  }
  if(fingerprint(out,out.context.trailerInfo.Info,P)!==fingerprint(verified,verified.context.trailerInfo.Info,P))throw Error('Metadata verification failed.');
  check();return bytes;
}
