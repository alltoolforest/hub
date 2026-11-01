// Scans may be divided only through rendered, full-width whitespace. The PDF
// image itself is preserved as clipped vector-page slices, never OCR-regenerated.
export async function rasterFlowProfile(page){
 const base=page.getViewport({scale:1});if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw new Error('Invalid scan page geometry.');if(base.rotation!==0)throw new Error('Rotated scan flow is not supported.');
 const scale=Math.min(2,Math.max(1,Math.sqrt(4_000_000/(base.width*base.height)))),viewport=page.getViewport({scale}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>16384||width*height>64_000_000)throw new Error('Scan exceeds the verified rendering budget.');
 const stripHeight=Math.max(1,Math.min(height,Math.floor(1_000_000/width))),canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,stripHeight):typeof document!=='undefined'?Object.assign(document.createElement('canvas'),{width,height:stripHeight}):null;if(!canvas)throw new Error('Scan flow requires browser rendering.');
 try{const rows=[];let start=null;
  for(let offset=0;offset<height;offset+=stripHeight){canvas.height=Math.min(stripHeight,height-offset);const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Scan flow requires a 2D rendering surface.');await page.render({canvasContext:context,viewport,transform:[1,0,0,1,0,-offset],background:'rgb(255,255,255)',annotationMode:0}).promise;const {data}=context.getImageData(0,0,width,canvas.height);
   for(let y=0;y<canvas.height;y++){let ink=false;for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i+3]>8&&(data[i]<254||data[i+1]<254||data[i+2]<254)){ink=true;break;}}const absolute=offset+y;if(ink&&start===null)start=absolute;if(!ink&&start!==null){rows.push({bottom:Math.max(0,base.height-absolute/scale),top:base.height-start/scale});start=null;}}
  }
  if(start!==null)rows.push({bottom:0,top:base.height-start/scale});if(!rows.length)throw new Error('Empty scan page has no flow geometry.');return {width:base.width,height:base.height,rows,scale};
 }finally{canvas.width=canvas.height=1;}
}
export function rasterPageGeometry(pageIndex,profile){const top=Math.max(...profile.rows.map(r=>r.top)),bottom=Math.min(...profile.rows.map(r=>r.bottom));return {pageIndex,width:profile.width,height:profile.height,rotation:0,textTopY:top,textBottomY:bottom,bodyTopY:Math.min(profile.height,top+4),footerGuardTop:Math.max(0,Math.min(12,bottom-4)),topMargin:0,bottomMargin:0,safetyGap:4,contentBand:{left:0,right:profile.width},confidence:'VERIFIED_RASTER_ROWS',rasterFlow:true};}
export async function verifyRasterFlowCuts(page,{boundaries,bandLeft,bandRight}){if(!Array.isArray(boundaries)||!boundaries.every(Number.isFinite)||!Number.isFinite(bandLeft)||!Number.isFinite(bandRight))return false;const p=await rasterFlowProfile(page);if(bandLeft>.01||bandRight<p.width-.01||boundaries.some(y=>y<0||y>p.height))return false;return boundaries.every(y=>!p.rows.some(r=>r.bottom<y+1&&r.top>y-1));}
