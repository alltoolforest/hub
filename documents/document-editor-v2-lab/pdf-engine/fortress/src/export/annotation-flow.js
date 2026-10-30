import {PDFName,PDFArray} from '../core/pdf-lib.js';
export function attachFlowAnnotations(doc,page,items,dy=0){
 if(!items?.length)return;const key=PDFName.of('Annots'),current=page.node.lookupMaybe(key,PDFArray),array=current?current.clone(doc.context):doc.context.obj([]);
 for(const item of items){const r=item.rect;item.dict.set(PDFName.of('Rect'),doc.context.obj([r[0],r[1]+dy,r[2],r[3]+dy]));item.dict.set(PDFName.of('P'),page.ref);array.push(item.ref||doc.context.register(item.dict));}page.node.set(key,array);
}
