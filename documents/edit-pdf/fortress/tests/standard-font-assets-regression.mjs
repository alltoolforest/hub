import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
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

function buildStandardFontFixture(){
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream='BT\n/F1 14 Tf\n24 110 Td\n(Standard Helvetica asset check) Tj\nET\n';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);

  let pdf='%PDF-1.4\n%ATF1\n';
  const offsets=[0];
  for(let i=0;i<objects.length;i++){
    offsets.push(pdf.length);
    pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n`;
  pdf+='0000000000 65535 f \n';
  for(let i=1;i<offsets.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

assert.equal(STANDARD_FONT_DATA_PATH,'../../vendor/standard_fonts/');
const fontUrl=localStandardFontDataUrl();
assert.match(fontUrl,/\/vendor\/standard_fonts\/$/,'Standard font URL must resolve to the local vendored directory.');
for(const name of required)await access(fileURLToPath(new URL(name,fontUrl)));

const injected=withLocalPdfjsAssets({data:new Uint8Array([1,2,3])});
assert.equal(injected.standardFontDataUrl,fontUrl,'Local standard-font URL was not injected.');
const explicit='file:///explicit-standard-fonts/';
assert.equal(withLocalPdfjsAssets({data:new Uint8Array([1]),standardFontDataUrl:explicit}).standardFontDataUrl,explicit,'Explicit caller font policy must be preserved.');
assert.equal(pdfjsRuntimePolicy().externalStandardFonts,false);

// Exercise an unembedded standard Type1 Helvetica font through the same
// PDF.js loader used by rendering, OCR classification and export validation.
// A missing standardFontDataUrl historically produced a
// fetchStandardFontData warning on this path.
const bytes=buildStandardFontFixture();
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
    const content=await rendered.getTextContent();
    assert.match(content.items.map(item=>item.str).join(' '),/Standard Helvetica asset check/);
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
