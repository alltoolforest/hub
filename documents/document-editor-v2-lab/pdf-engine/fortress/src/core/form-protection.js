import {mapFlowRectangle} from '../export/flow-map.js';
import {PDFName,PDFArray,PDFDict,PDFRef,PDFRawStream,decodePDFRawStream,PDFDocument} from './pdf-lib.js';

const name=key=>PDFName.of(key);
export function inspectFormWidgets(doc){
  const widgets=[];let known=true;
  try{
    const form=doc.catalog.lookup(name('AcroForm'));
    if(form instanceof PDFDict&&form.has(name('XFA')))known=false;
    const located=new Set();
    for(const [pageIndex,page] of doc.getPages().entries()){
      const annotations=page.node.lookup(name('Annots'));
      if(!annotations)continue;
      if(!(annotations instanceof PDFArray)){known=false;continue;}
      for(const ref of annotations.asArray()){
        const item=doc.context.lookup(ref);
        if(!(item instanceof PDFDict)){known=false;continue;}
        if(item.lookup(name('Subtype'))?.toString()!=='/Widget')continue;
        located.add(item);
        const rect=item.lookup(name('Rect'));
        const values=rect instanceof PDFArray?rect.asArray().map(n=>doc.context.lookup(n)?.asNumber?.()):[];
        if(values.length!==4||!values.every(Number.isFinite)){known=false;continue;}
        const [x1,y1,x2,y2]=values;
        widgets.push({pageIndex,bounds:{x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)}});
      }
    }
    const visited=new Set();
    function visit(ref,depth=0){
      const item=doc.context.lookup(ref);if(visited.has(item))return;visited.add(item);
      if(!(item instanceof PDFDict)||depth>32){known=false;return;}
      if(item.lookup(name('Subtype'))?.toString()==='/Widget'&&!located.has(item))known=false;
      const kids=item.lookup(name('Kids'));
      if(kids instanceof PDFArray)for(const kid of kids.asArray())visit(kid,depth+1);
    }
    const fields=form instanceof PDFDict?form.lookup(name('Fields')):null;
    if(fields instanceof PDFArray)for(const field of fields.asArray())visit(field);
    else if(form)known=false;
  }catch{known=false;}
  return {formWidgets:widgets,formSafetyKnown:known};
}

export function formRegionSafe(flags,pageIndex,bounds){
  if(!flags.hasAcroForm&&!flags.formWidgets?.length)return true;
  if(!flags.formSafetyKnown||!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite))return false;
  const pad=3;
  return !flags.formWidgets.some(w=>w.pageIndex===pageIndex&&bounds.x<w.bounds.x+w.bounds.width+pad&&bounds.x+bounds.width>w.bounds.x-pad&&bounds.y<w.bounds.y+w.bounds.height+pad&&bounds.y+bounds.height>w.bounds.y-pad);
}

// Compare the complete field/appearance graph, excluding widget back-links to
// page content (which is intentionally edited). Existing object IDs stay stable.
export function formFingerprint(doc){
  const seen=new Set();let size=0,streamBytes=0;
  function encode(value){
    if(++size>100000)throw new Error('PDF form graph is too complex to verify safely.');
    if(value instanceof PDFRef){const key=value.toString();if(seen.has(key))return ['ref',key];seen.add(key);const resolved=doc.context.lookup(value);if(!resolved)throw new Error('PDF form contains a missing object.');return ['ref',key,encode(resolved)];}
    if(value instanceof PDFArray)return value.asArray().map(encode);
    if(value instanceof PDFRawStream){const bytes=decodePDFRawStream(value).decode();if((streamBytes+=bytes.length)>20_000_000)throw new Error('PDF form appearance is too large to verify safely.');return ['stream',dictionary(value.dict,new Set(['Length','Filter','DecodeParms'])),Array.from({length:Math.ceil(bytes.length/4096)},(_,i)=>String.fromCharCode(...bytes.subarray(i*4096,(i+1)*4096))).join('')];}
    if(value instanceof PDFDict)return dictionary(value);
    return value?.toString?.()??null;
  }
  function dictionary(dict,skip=new Set()){
    const widget=dict.lookup(name('Subtype'))?.toString()==='/Widget';
    return dict.entries().filter(([key])=>!skip.has(key.decodeText())&&!(widget&&key.decodeText()==='P')).sort(([a],[b])=>a.toString().localeCompare(b.toString())).map(([key,val])=>[key.toString(),encode(val)]);
  }
  const form=doc.catalog.get(name('AcroForm'));
  const widgets=doc.getPages().map(page=>{const annots=page.node.lookup(name('Annots'));return annots instanceof PDFArray?annots.asArray().filter(ref=>doc.context.lookup(ref)?.lookup?.(name('Subtype'))?.toString()==='/Widget').map(encode):[];});
  return JSON.stringify([form?encode(form):null,widgets]);
}

export async function verifyFormPreservation(originalBytes,editedBytes,{reflowMetrics=[]}={}){
  const original=await PDFDocument.load(originalBytes.slice(),{updateMetadata:false});
  const signature=original.catalog.lookup(name('Perms'));
  const visited=new Set();
  function signed(ref,depth=0){
    const item=original.context.lookup(ref);if(!(item instanceof PDFDict)||visited.has(item)||depth>32)return false;visited.add(item);
    if(item.lookup(name('FT'))?.toString()==='/Sig')return true;
    const kids=item.lookup(name('Kids'));return kids instanceof PDFArray&&kids.asArray().some(kid=>signed(kid,depth+1));
  }
  const form=original.catalog.lookup(name('AcroForm')),fields=form instanceof PDFDict?form.lookup(name('Fields')):null;
  const protectedSignature=signature instanceof PDFDict||fields instanceof PDFArray&&fields.asArray().some(field=>signed(field));
  if(protectedSignature&&(originalBytes.length!==editedBytes.length||originalBytes.some((b,i)=>b!==editedBytes[i])))throw Object.assign(new Error('Signed PDFs are protected. Exporting edits would invalidate the signature.'),{code:'PDF_SIGNATURE_PROTECTED'});
  if(!original.catalog.has(name('AcroForm'))&&!inspectFormWidgets(original).formWidgets.length)return;
  const edited=await PDFDocument.load(editedBytes.slice(),{updateMetadata:false});
  if(reflowMetrics.length){
    if(!inspectFormWidgets(original).formSafetyKnown)throw new Error('Unknown form geometry cannot be moved.');
    const transfers=[];for(const [pageIndex,page]of original.getPages().entries()){const annotations=page.node.lookup(name('Annots'));if(!(annotations instanceof PDFArray))continue;for(let i=0;i<annotations.size();i++){const ref=annotations.get(i),dict=original.context.lookup(ref);if(dict?.lookup?.(name('Subtype'))?.toString()!=='/Widget')continue;const values=dict.lookup(name('Rect')).asArray().map(n=>n.asNumber()),[x1,y1,x2,y2]=values,moved=mapFlowRectangle({x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)},pageIndex,reflowMetrics);if(moved.pageIndex>=edited.getPageCount())throw new Error('Invalid form destination page.');dict.set(name('Rect'),original.context.obj([x1+moved.x-Math.min(x1,x2),y1+moved.y-Math.min(y1,y2),x2+moved.x-Math.min(x1,x2),y2+moved.y-Math.min(y1,y2)]));if(moved.pageIndex!==pageIndex)transfers.push({pageIndex,index:i,ref,destination:moved.pageIndex});}}
    while(original.getPageCount()<edited.getPageCount())original.addPage([edited.getPage(original.getPageCount()).getWidth(),edited.getPage(original.getPageCount()).getHeight()]);
    for(const item of [...transfers].sort((a,b)=>b.pageIndex-a.pageIndex||b.index-a.index))original.getPage(item.pageIndex).node.lookup(name('Annots')).remove(item.index);
    for(const item of transfers){const page=original.getPage(item.destination);let annotations=page.node.lookup(name('Annots'));if(!(annotations instanceof PDFArray)){annotations=original.context.obj([]);page.node.set(name('Annots'),annotations);}annotations.push(item.ref);}
  }
  if(formFingerprint(original)!==formFingerprint(edited))throw Object.assign(new Error('Export would change PDF form fields or appearances. Your edit has not been exported.'),{code:'PDF_FORM_PRESERVATION_FAILED'});
}
