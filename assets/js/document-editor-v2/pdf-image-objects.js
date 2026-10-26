import {PDFName,PDFDict,PDFRawStream} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/pdf-lib.js';
import {getPageContentStreams,replacePageContentStream} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/document-model.js';
import {parseContentStream} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/parser/content-stream-parser.js';
import {rewriteByteRanges} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/mutation/content-stream-editor.js';
import {multiply,invert,IDENTITY} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/utils/matrices.js';

// Only independent, axis-aligned Image XObject placements are exposed. Form
// contents, inline images, clipping and reflected/rotated placements stay intact.
export function imagesIn(doc){
  const images=[];
  for(const [pageIndex,page] of doc.getPages().entries()){
    const resources=page.node.Resources(),xobjects=resources?.lookupMaybe(PDFName.of('XObject'),PDFDict);
    if(!xobjects)continue;
    let matrix=[...IDENTITY],clipped=false,stack=[],ordinal=0;const found=[];
    try{
      for(const stream of getPageContentStreams(doc,pageIndex)){
        for(const instruction of parseContentStream(stream.bytes).instructions){
          const {op,values}=instruction;
          if(op==='q')stack.push({matrix:[...matrix],clipped});
          else if(op==='Q'){const saved=stack.pop();if(!saved)throw new Error('Unbalanced graphics state');({matrix,clipped}=saved);}
          else if(op==='cm'){
            if(values.length!==6||!values.every(Number.isFinite))throw new Error('Invalid image transform');matrix=multiply(values,matrix);
          }else if(op==='W'||op==='W*')clipped=true;
          else if(op==='Do'){
            const resourceName=String(values[0]||'').replace(/^\//,''),object=doc.context.lookup(xobjects.get(PDFName.of(resourceName)));
            if(!(object instanceof PDFRawStream)||object.dict.get(PDFName.of('Subtype'))?.toString()!=='/Image')continue;
            const occurrence=ordinal++;
            if(clipped||Math.abs(matrix[1])>1e-8||Math.abs(matrix[2])>1e-8||matrix[0]<=0||matrix[3]<=0||!matrix.every(Number.isFinite))continue;
            const source={resourceName,occurrence,matrix:[...matrix],pixelWidth:object.dict.lookup(PDFName.of('Width'))?.asNumber?.(),pixelHeight:object.dict.lookup(PDFName.of('Height'))?.asNumber?.()};
            found.push({id:`source-image:${pageIndex}:${occurrence}`,kind:'image',pageIndex,x:matrix[4],y:matrix[5],width:matrix[0],height:matrix[3],source,streamIndex:stream.streamIndex,start:instruction.start,end:instruction.end});
          }
        }
      }
      if(stack.length)throw new Error('Unbalanced graphics state');
      images.push(...found);
    }catch{/* An ambiguous page remains viewable but its image placements are protected. */}
  }
  return images;
}

export async function applyImageChanges(doc,changes){
  const placements=imagesIn(doc),buckets=new Map();
  for(const item of changes.filter(value=>value.kind==='image'&&value.source)){
    const placement=placements.find(value=>value.id===item.id&&JSON.stringify(value.source)===JSON.stringify(item.source));
    if(!placement)throw new Error('An original image placement changed. Its edit cannot be applied safely.');
    let replacement='';
    if(!item.deleted){
      let resource=PDFName.of(placement.source.resourceName);
      if(item.bytes){
        const image=item.format==='png'?await doc.embedPng(item.bytes):await doc.embedJpg(item.bytes),page=doc.getPage(item.pageIndex);
        const resources=page.node.Resources().clone(doc.context),xobjects=resources.lookup(PDFName.of('XObject'),PDFDict).clone(doc.context);
        resource=PDFName.of(`ATFImage${crypto.randomUUID().replaceAll('-','')}`);xobjects.set(resource,image.ref);resources.set(PDFName.of('XObject'),xobjects);page.node.set(PDFName.of('Resources'),resources);
      }
      const relative=multiply([item.width,0,0,item.height,item.x,item.y],invert(placement.source.matrix));
      replacement=`q\n${relative.map(value=>Number(value.toFixed(8))).join(' ')} cm\n${resource.toString()} Do\nQ\n`;
    }
    const key=`${item.pageIndex}:${placement.streamIndex}`,bucket=buckets.get(key)||{pageIndex:item.pageIndex,streamIndex:placement.streamIndex,edits:[]};
    bucket.edits.push({start:placement.start,end:placement.end,replacement});buckets.set(key,bucket);
  }
  for(const bucket of buckets.values()){
    const stream=getPageContentStreams(doc,bucket.pageIndex).find(value=>value.streamIndex===bucket.streamIndex);
    replacePageContentStream(doc,bucket.pageIndex,bucket.streamIndex,rewriteByteRanges(stream.bytes,bucket.edits));
  }
}
