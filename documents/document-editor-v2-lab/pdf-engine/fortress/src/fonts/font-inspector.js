import {
  PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream,
} from '../core/pdf-lib.js';
import { buildEncodingTable } from './simple-encoding.js';
import { parseToUnicodeCMap } from './tounicode-parser.js';
import { classifyFontSupport } from './font-support.js';

function nameOf(obj){
  if(!obj) return undefined;
  try { const s=typeof obj.asString==='function'?obj.asString():obj.toString(); return s.replace(/^\//,''); } catch { return undefined; }
}
function numberOf(obj){ try{return typeof obj?.asNumber==='function'?obj.asNumber():undefined;}catch{return undefined;} }
function refKey(obj){ return obj?.toString?.() ?? null; }
function decodeStream(ctx, obj){
  if(!obj) return null;
  const raw=obj instanceof PDFRawStream?obj:ctx.lookup(obj);
  if(!(raw instanceof PDFRawStream)) return null;
  try{return decodePDFRawStream(raw).getBytes();}catch{return null;}
}
function parseDifferences(encodingEntry){
  if(!(encodingEntry instanceof PDFDict)) return {baseEncoding:undefined,differences:[]};
  const baseEncoding=nameOf(encodingEntry.lookup(PDFName.of('BaseEncoding')));
  const d=encodingEntry.lookup(PDFName.of('Differences'));
  const differences=[];
  if(d instanceof PDFArray){
    for(const el of d.asArray()){
      const n=numberOf(el);
      differences.push(Number.isFinite(n)?n:nameOf(el));
    }
  }
  return {baseEncoding,differences};
}

function parseCidWidths(desc){
  const defaultWidth=numberOf(desc.lookup(PDFName.of('DW'))) ?? 1000;
  const w=desc.lookup(PDFName.of('W'));
  const ranges=[];
  if(w instanceof PDFArray){
    const a=w.asArray(); let i=0;
    while(i<a.length){
      const c1=numberOf(a[i++]); if(!Number.isFinite(c1)) break;
      const next=a[i++];
      if(next instanceof PDFArray){
        const widths=next.asArray().map(numberOf);
        ranges.push({kind:'array',start:c1,widths});
      } else {
        const c2=numberOf(next); const width=numberOf(a[i++]);
        if(Number.isFinite(c2)&&Number.isFinite(width)) ranges.push({kind:'range',start:c1,end:c2,width});
      }
    }
  }
  const widthsLookup=(cid)=>{
    for(const r of ranges){
      if(r.kind==='array' && cid>=r.start && cid<r.start+r.widths.length) return r.widths[cid-r.start];
      if(r.kind==='range' && cid>=r.start && cid<=r.end) return r.width;
    }
    return defaultWidth;
  };
  return {defaultWidth,widthsLookup};
}

export function inspectFontResourceFromResources(pdfDoc,resources,fontName){
  const ctx=pdfDoc.context;
  const resolvedResources=resources instanceof PDFDict?resources:ctx.lookup(resources);
  if(!(resolvedResources instanceof PDFDict)) return null;
  const fonts=resolvedResources.lookup(PDFName.of('Font')); if(!(fonts instanceof PDFDict)) return null;
  const rawRef=fonts.get(PDFName.of(fontName)); if(!rawRef) return null;
  const dict=rawRef instanceof PDFDict?rawRef:ctx.lookup(rawRef); if(!(dict instanceof PDFDict)) return null;
  const subtype=nameOf(dict.lookup(PDFName.of('Subtype')));
  const baseFont=nameOf(dict.lookup(PDFName.of('BaseFont')));
  const toUnicodeRef=dict.get(PDFName.of('ToUnicode'));
  const toUnicodeBytes=decodeStream(ctx,toUnicodeRef);
  const toUnicode=toUnicodeBytes?parseToUnicodeCMap(toUnicodeBytes):null;
  const fontDescriptorRef=dict.get(PDFName.of('FontDescriptor'));
  const descriptor=fontDescriptorRef?ctx.lookup(fontDescriptorRef):null;
  const embedded=descriptor instanceof PDFDict && ['FontFile','FontFile2','FontFile3'].some((n)=>!!descriptor.get(PDFName.of(n)));
  const subset=/^[A-Z]{6}\+/.test(baseFont||'');

  if(subtype==='Type0'){
    const encoding=nameOf(dict.lookup(PDFName.of('Encoding')));
    const descendants=dict.lookup(PDFName.of('DescendantFonts'));
    let desc=null, descendantSubtype, widthsLookup, defaultWidth=1000;
    if(descendants instanceof PDFArray && descendants.size()>0){
      const first=descendants.get(0); desc=first instanceof PDFDict?first:ctx.lookup(first);
      if(desc instanceof PDFDict){
        descendantSubtype=nameOf(desc.lookup(PDFName.of('Subtype')));
        ({widthsLookup,defaultWidth}=parseCidWidths(desc));
      }
    }
    const codeLengths=toUnicode?.codeLengths?.length?toUnicode.codeLengths:[encoding==='Identity-H'||encoding==='Identity-V'?2:1];
    const meta={
      resourceName:fontName,fontObjectRef:refKey(rawRef),subtype,baseFont,embedded,subset,isComposite:true,
      encoding,writingMode:encoding==='Identity-V'?'vertical':'horizontal',codeWidth:codeLengths[0]??2,
      descendantSubtype,toUnicode, widthsLookup,defaultWidth, dict,descendantFont:desc,
    };
    Object.assign(meta,classifyFontSupport(meta));
    return meta;
  }

  const enc=dict.lookup(PDFName.of('Encoding'));
  let baseEncoding;
  let differences=[];
  if(enc instanceof PDFDict) ({baseEncoding,differences}=parseDifferences(enc)); else baseEncoding=nameOf(enc) || 'WinAnsiEncoding';
  const encodingTable=buildEncodingTable(baseEncoding,differences);
  const firstChar=numberOf(dict.lookup(PDFName.of('FirstChar'))) ?? 0;
  const widths=dict.lookup(PDFName.of('Widths'));
  let widthsLookup;
  if(widths instanceof PDFArray){ const arr=widths.asArray().map(numberOf); widthsLookup=(code)=>arr[code-firstChar]; }
  const meta={
    resourceName:fontName,fontObjectRef:refKey(rawRef),subtype,baseFont,embedded,subset,isComposite:false,
    encoding:baseEncoding,differences,toUnicode,codeWidth:1,widthsLookup,defaultWidth:500,dict,encodingTable,
  };
  Object.assign(meta,classifyFontSupport(meta));
  return meta;
}

export function inspectFontResource(pdfDoc,pageIndex,fontName){
  const page=pdfDoc.getPage(pageIndex);
  return inspectFontResourceFromResources(pdfDoc,page.node.Resources(),fontName);
}

export function listPageFonts(pdfDoc,pageIndex){
  const page=pdfDoc.getPage(pageIndex); const fonts=page.node.Resources()?.lookup(PDFName.of('Font'));
  if(!(fonts instanceof PDFDict)) return [];
  const out=[];
  for(const [name] of fonts.entries()) { const n=nameOf(name); if(n) out.push(inspectFontResource(pdfDoc,pageIndex,n)); }
  return out.filter(Boolean);
}
