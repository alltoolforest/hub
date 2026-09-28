import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PDFDocument,StandardFonts} from '../src/core/pdf-lib.js';
import {
  STANDARD_FONT_DATA_PATH,
  localStandardFontDataUrl,
  loadPdfjs,
  pdfjsRuntimePolicy,
  withLocalPdfjsAssets,
} from '../src/rendering/pdfjs.js';

const required=[
  'FoxitDingbats.pfb',
  'FoxitFixed.pfb','FoxitFixedBold.pfb','FoxitFixedBoldItalic.pfb','FoxitFixedItalic.pfb',
  'FoxitSerif.pfb','FoxitSerifBold.pfb','FoxitSerifBoldItalic.pfb','FoxitSerifItalic.pfb',
  'FoxitSymbol.pfb',
  'LiberationSans-Regular.ttf','LiberationSans-Bold.ttf','LiberationSans-Italic.ttf','LiberationSans-BoldItalic.ttf',
  'LICENSE_FOXIT','LICENSE_LIBERATION',
];

assert.equal(STANDARD_FONT_DATA_PATH,'../../vendor/standard_fonts/');
const fontUrl=localStandardFontDataUrl();
assert.match(fontUrl,/\/vendor\/standard_fonts\/$/,'Standard font URL must resolve to the local vendored directory.');
for(const name of required)await access(fileURLToPath(new URL(name,fontUrl)));

const injected=withLocalPdfjsAssets({data:new Uint8Array([1,2,3])});
assert.equal(injected.standardFontDataUrl,fontUrl,'Local standard-font URL was not injected.');
const explicit='file:///explicit-standard-fonts/';
assert.equal(withLocalPdfjsAssets({data:new Uint8Array([1]),standardFontDataUrl:explicit}).standardFontDataUrl,explicit,'Explicit caller font policy must be preserved.');
assert.equal(pdfjsRuntimePolicy().externalStandardFonts,false);

// Exercise a real standard Type1 font through the same PDF.js loader used by
// rendering, OCR classification and export validation. A missing
// standardFontDataUrl historically produced a fetchStandardFontData warning.
const source=await PDFDocument.create();
const page=source.addPage([300,180]);
const helvetica=await source.embedFont(StandardFonts.Helvetica);
page.drawText('Standard Helvetica asset check',{x:24,y:110,size:14,font:helvetica});
const bytes=new Uint8Array(await source.save({useObjectStreams:false}));
const warnings=[];
const previousWarn=console.warn;
console.warn=(...args)=>{const text=args.map(String).join(' ');warnings.push(text);previousWarn(...args);};
try{
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  try{
    const rendered=await pdf.getPage(1);
    await rendered.getOperatorList();
  }finally{
    try{await pdf.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }
}finally{
  console.warn=previousWarn;
}
assert.equal(warnings.some(message=>/fetchStandardFontData|standard font.*url|standardFontDataUrl/i.test(message)),false,'PDF.js still reported missing standard-font assets.');

console.log('PASS 6/6');
console.log('✓ pinned PDF.js standard-font bundle is present locally');
console.log('✓ local standardFontDataUrl is resolved from the module');
console.log('✓ every PDF.js document object receives the local asset path');
console.log('✓ explicit caller overrides remain respected');
console.log('✓ runtime policy reports no external standard-font dependency');
console.log('✓ real standard-font operator loading completes without asset warnings');
