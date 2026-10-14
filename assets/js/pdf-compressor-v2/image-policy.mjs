// AllToolForest PDF Compressor — Task 3 isolated image eligibility policy.
// No PDF mutation, no side effects, no dependency on shared/frozen tools.
// Decisions are deliberately conservative: unsupported images remain intact.
export const IMAGE_LIMITS=Object.freeze({
  maxPixels:8_000_000,maxDecodedBytes:32_000_000,
  maxImages:1000, maxPagePixels:8_000_000
});
export const QUALITY_MODES=Object.freeze({
  balanced:Object.freeze({jpegQuality:0.82,maxDimension:2400}),
  strong:Object.freeze({jpegQuality:0.68,maxDimension:1800})
});
function name(v){return typeof v==='string'?v.trim():'';}
export function assessImage(item,mode='balanced',limits=IMAGE_LIMITS,{allowJpeg=false,allowAdaptive=false}={}){
  if(!QUALITY_MODES[mode])throw new RangeError('Unknown image quality mode');
  const skip=(reason)=>({eligible:false,action:'preserve',reason,mode});
  if(!item||typeof item!=='object')return skip('invalid-image-descriptor');
  const {width,height,bitsPerComponent,filter,colorSpace,softMask,mask,decode,
    interpolate,decodeParms,associatedWithSignature,encrypted}=item;
  if(encrypted||associatedWithSignature)return skip('restricted-document');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)
    return skip('invalid-dimensions');
  const pixels=width*height;
  if(!Number.isSafeInteger(pixels))return skip('invalid-dimensions');
  const adaptive=pixels>limits.maxPixels||pixels*4>limits.maxDecodedBytes;
  if(adaptive&&!allowAdaptive)return skip('pixel-budget-exceeded');
  if(softMask||mask)return skip('mask-or-transparency');
  if(decode||decodeParms)return skip('custom-decode-parameters');
  if(bitsPerComponent!==8)return skip('unsupported-bit-depth');
  if(!['/DeviceRGB','/DeviceGray'].includes(name(colorSpace))&&
    !(colorSpace==='/DeviceCMYK'&&filter==='/DCTDecode'&&allowJpeg))
    return skip('unverified-color-profile');
  if(!['/FlateDecode','/DCTDecode'].includes(name(filter)))
    return skip('unsupported-image-encoding');
  if(name(filter)==='/DCTDecode'&&!allowJpeg)
    return skip('existing-jpeg-no-safe-decode-path');
  // Flate and explicitly enabled, independently decoded JPEG streams are ONLY
  // candidates. The independent transform must still
  // validate decoded pixel bytes, original color, new stream, output PDF and
  // no visual/text or structural regression before export.
  const channels=colorSpace==='/DeviceGray'?1:colorSpace==='/DeviceCMYK'?4:3;
  if(pixels*channels>limits.maxDecodedBytes&&!allowAdaptive)return skip('decoded-byte-budget');
  return {
    eligible:true,action:'candidate-only',reason:filter==='/DCTDecode'?'bounded-opaque-jpeg-raster':'bounded-opaque-flate-raster',
    mode,pixels,adaptive,expectedRawBytes:pixels*channels,
    jpegQuality:QUALITY_MODES[mode].jpegQuality,
    maxDimension:QUALITY_MODES[mode].maxDimension,
    guarantee:'none; must independently validate encoded candidate and PDF'
  };
}
export function classifyDocument(images,{pages=1,hasSignature=false,encrypted=false,
  mode='balanced',limits=IMAGE_LIMITS}={}){
  if(!Number.isSafeInteger(pages)||pages<1)
    return {safe:false,reason:'invalid-page-count',items:[]};
  if(!Array.isArray(images)||images.length>limits.maxImages)
    return {safe:false,reason:'invalid-image-inventory',items:[]};
  if(hasSignature||encrypted)
    return {safe:false,reason:'signed-or-encrypted-document',items:[]};
  const items=images.map(image=>assessImage(image,mode,limits));
  return {
    safe:true,mode,images:images.length,
    candidates:items.filter(x=>x.eligible).length,
    preserved:items.filter(x=>!x.eligible).length,items,
    // This is never proof that any PDF bytes have been changed.
    outputStatus:'not-compressed'
  };
}
