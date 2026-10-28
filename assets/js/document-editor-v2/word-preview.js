const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
// Only embedded raster images are previewed. Never fetch external relationships.
export async function readPreviewImages(model,Parser){
  const result=new Map(),part=model.zip.file('word/_rels/document.xml.rels');
  if(!part)return result;
  const text=await part.async('string');
  if(text.length>5_000_000||/<!DOCTYPE|<!ENTITY/i.test(text))return result;
  const xml=new Parser().parseFromString(text,'application/xml'),relationships=new Map();
  for(const rel of xml.getElementsByTagNameNS('*','Relationship')){
    const target=rel.getAttribute('Target')||'';
    if(rel.getAttribute('TargetMode')==='External'||!rel.getAttribute('Type')?.endsWith('/image')||!/^media\/[\w .()-]+\.(png|jpe?g|gif|webp)$/i.test(target))continue;
    relationships.set(rel.getAttribute('Id'),'word/'+target);
  }
  const cache=new Map();
  for(const [index,p] of [...model.xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','p')].entries()){
    const images=[];
    for(const blip of p.getElementsByTagNameNS(A,'blip')){
      const path=relationships.get(blip.getAttributeNS(R,'embed'));if(!path)continue;
      if(!cache.has(path)){
        const file=model.zip.file(path);if(!file)continue;
        const bytes=await file.async('uint8array');if(bytes.length>20_000_000)continue;
        const ext=path.split('.').at(-1).toLowerCase(),mime=ext==='jpg'?'jpeg':ext;
        cache.set(path,`data:image/${mime};base64,${await file.async('base64')}`);
      }
      let drawing=blip;while(drawing&&drawing.localName!=='drawing')drawing=drawing.parentElement;
      const extent=drawing?.getElementsByTagNameNS('*','extent')[0],description=drawing?.getElementsByTagNameNS('*','docPr')[0];
      const rawWidth=Number(extent?.getAttribute('cx'))/9525,rawHeight=Number(extent?.getAttribute('cy'))/9525,width=Number.isFinite(rawWidth)&&rawWidth>0?Math.min(2000,rawWidth):300,height=Number.isFinite(rawHeight)&&rawHeight>0&&rawWidth>0?width*rawHeight/rawWidth:null;
      images.push({src:cache.get(path),width,height,alt:description?.getAttribute('descr')||'Embedded document image'});
    }
    if(images.length)result.set(index,images);
  }
  return result;
}
export function fontAvailability(doc,font){
  // Compare against two fallback metrics; FontFaceSet.check alone can report true for a nonexistent font.
  if(!doc.defaultView?.CanvasRenderingContext2D)return null;
  const canvas=doc.createElement('canvas');let ctx;try{ctx=canvas.getContext('2d');}catch{return null;}if(!ctx)return null;
  const sample='mmmmmmmmmmWWWWWWWWWW0123456789';
  const width=family=>{ctx.font=`72px ${family}`;return ctx.measureText(sample).width;};
  return ['monospace','serif'].some(base=>width(`${JSON.stringify(font)}, ${base}`)!==width(base));
}
export function showFontAvailability(host,model){
  const fonts=new Set(model.formatting.formats.flatMap(f=>[f.base.font,...f.runs.map(r=>r.font)]));
  const status=document.createElement('div');status.setAttribute('aria-label','Document font availability');
  for(const font of fonts){const available=fontAvailability(document,font);if(available===true)continue;
    const item=document.createElement('p');
    if(available===false){item.dataset.missingFont=font;item.textContent=`Font unavailable: ${font}. Preview uses a substitute; export retains the original font.`;}
    else {item.dataset.uncheckedFont=font;item.textContent=`Unable to check font availability: ${font}.`;}
    status.append(item);
  }
  host.append(status);
}
