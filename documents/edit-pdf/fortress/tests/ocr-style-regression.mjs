import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inferScannedTextStyle,cssFont,fitScannedWord} from '../../ocr/style-match.js';
import {estimateTextColor} from '../../ocr/background-safety.js';
const require=createRequire(import.meta.url);
const {createCanvas,GlobalFonts}=require('../../../../hybrid-build/node_modules/@napi-rs/canvas');
// Explicit aliases reproduce the browser's three distinct fallback families.
for(const [alias,file] of [['Arial','DejaVuSans'],['Georgia','DejaVuSerif'],['Consolas','DejaVuSansMono']]){
  GlobalFonts.registerFromPath(`/usr/share/fonts/truetype/dejavu/${file}.ttf`,alias);
  GlobalFonts.registerFromPath(`/usr/share/fonts/truetype/dejavu/${file}-Bold.ttf`,alias);
}
globalThis.OffscreenCanvas=class {constructor(w,h){return createCanvas(w,h);}};
let passed=0;
function test(name,fn){fn();console.log(`PASS ${name}`);passed++;}
function fixture({family='sans-serif',weight=400,text='sample',size=32,color=[24,28,35],background=[255,255,255]}={}){
  const canvas=createCanvas(600,130),ctx=canvas.getContext('2d');
  ctx.fillStyle=`rgb(${background})`;ctx.fillRect(0,0,600,130);
  ctx.font=cssFont({family,weight},size);ctx.fillStyle=`rgb(${color})`;ctx.fillText(text,40,80);
  const data=ctx.getImageData(0,0,600,130).data;
  let x0=600,y0=130,x1=0,y1=0;
  for(let y=0;y<130;y++)for(let x=0;x<600;x++){
    const i=(y*600+x)*4;if(Math.hypot(...background.map((v,c)=>data[i+c]-v))>60){x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);}
  }
  return {canvas,ctx,bbox:{x0,y0,x1,y1},text,color,background:{r:background[0],g:background[1],b:background[2]}};
}
for(const family of ['sans-serif','serif','monospace'])for(const weight of [400,700]){
  test(`matches ${family} ${weight} glyphs and baseline`,()=>{
    const f=fixture({family,weight});const s=inferScannedTextStyle(f.ctx,f.bbox,f.text,f.background);
    assert.equal(s.family,family,JSON.stringify(s));assert.equal(s.weight,weight,JSON.stringify(s));
    assert.ok(Math.abs(s.fontPx-32)<2,JSON.stringify(s));assert.ok(Math.abs(s.baseline-80)<=1.5,JSON.stringify(s));
  });
}
for(const color of [[0,0,0],[24,28,35],[30,65,160],[238,240,245]]){
  test(`preserves ink colour ${color}`,()=>{
    const f=fixture({color,background:color[0]>200?[25,30,38]:[255,255,255],size:17});const c=estimateTextColor(f.ctx,f.bbox,f.background);
    assert.ok(Math.max(...['r','g','b'].map((k,i)=>Math.abs(c[k]-color[i])))<=5,JSON.stringify(c));
  });
}
test('digits retain proportional font',()=>{const f=fixture({text:'123456'});assert.equal(inferScannedTextStyle(f.ctx,f.bbox,f.text,f.background).family,'sans-serif');});
test('replacement aligns baseline and stays inside exported patch',()=>{
  const f=fixture(),s=inferScannedTextStyle(f.ctx,f.bbox,f.text,f.background),b=f.bbox;
  const rect={x:b.x0-3,y:b.y0-3,width:b.x1-b.x0+6,height:b.y1-b.y0+6};
  for(const text of ['tested','gyp','jill','WWW']){
    const fit=fitScannedWord(f.ctx,text,s,rect);assert.ok(fit,text);assert.equal(fit.baseline,s.baseline);
    const c=createCanvas(600,130),ctx=c.getContext('2d');ctx.font=cssFont(s,fit.fontPx);ctx.fillText(text,fit.x,fit.baseline);
    const d=ctx.getImageData(0,0,600,130).data;
    for(let y=0;y<130;y++)for(let x=0;x<600;x++)if(d[(y*600+x)*4+3]>20)assert.ok(x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height,`${text}: ${x},${y}`);
  }
  assert.equal(fitScannedWord(f.ctx,'This replacement is much too long to fit',s,rect),null);
});
test('font matching does not mutate source pixels or context',()=>{
  const f=fixture(),before=f.canvas.toBuffer('image/png'),font=f.ctx.font;
  inferScannedTextStyle(f.ctx,f.bbox,f.text,f.background);assert.deepEqual(f.canvas.toBuffer('image/png'),before);assert.equal(f.ctx.font,font);
});
test('available source font wins over a heavier fallback',()=>{
  GlobalFonts.removeAll();
  assert.ok(GlobalFonts.registerFromPath('/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf','Arial'));
  assert.ok(GlobalFonts.registerFromPath('/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf','Arial'));
  assert.ok(GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','DejaVu Sans'));
  const f=fixture();
  f.ctx.fillStyle='#fff';f.ctx.fillRect(0,0,600,130);
  f.ctx.font='32px "DejaVu Sans"';f.ctx.fillStyle='#182023';f.ctx.fillText('sample',40,80);
  const s=inferScannedTextStyle(f.ctx,{x0:40,y0:54,x1:160,y1:88},'sample',f.background);
  assert.match(s.fontFace,/DejaVu Sans/);assert.equal(s.weight,400);assert.ok(Math.abs(s.baseline-80)<=1.5);
});
console.log(`${passed} OCR visual regression checks passed.`);
