// Spatial/luminance diagnostics; uncertain texture is not permission to smooth.
import {assertDimensions} from './photo-integrity.js';
const Y=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
export function createNoiseMap(width,height){assertDimensions(width,height);const tile=Math.max(32,Math.ceil(Math.max(width,height)/48)),cols=Math.ceil(width/tile),rows=Math.ceil(height/tile);return {width,height,tile,cols,rows,step:Math.max(1,Math.ceil(Math.sqrt(width*height/180000))),bins:new Uint32Array(cols*rows*3*64),chromaBins:new Uint32Array(cols*rows*3*64),counts:new Uint32Array(cols*rows*3),examined:new Uint32Array(cols*rows*3),structured:new Uint32Array(cols*rows*3)};}
export function collectNoise(map,data,width,stripHeight,startRow,rowCount,offsetY){
 if(width!==map.width||data.length!==width*stripHeight*4||startRow<0||startRow+rowCount>stripHeight)throw new Error('Invalid noise analysis strip');
 const step=map.step;
 for(let y=startRow;y<startRow+rowCount;y++){const gy=y+offsetY;if(gy%step||gy<2||gy>=map.height-2||y<2||y>=stripHeight-2)continue;
  for(let x=2;x<width-2;x+=step){const p=(y*width+x)*4;if(data[p+3]!==255)continue;
   const l=Y(data,p),band=l<64?0:l<192?1:2,k=(Math.floor(gy/map.tile)*map.cols+Math.floor(x/map.tile))*3+band;map.examined[k]++;
   let xx=0,yy=0,xy=0,valid=true;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q=((y+dy)*width+x+dx)*4;if([q-4,q+4,q-width*4,q+width*4].some(i=>data[i+3]!==255)){valid=false;continue;}const gx=(Y(data,q+4)-Y(data,q-4))/2,gy=(Y(data,q+width*4)-Y(data,q-width*4))/2;xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;}
   if(!valid)continue;
   const energy=(xx+yy)/9,coherence=Math.sqrt((xx-yy)**2+4*xy*xy)/(xx+yy+1e-9);
   if(energy>4&&coherence>.55){map.structured[k]++;continue;}
   // High-energy isotropic detail is ambiguous, not confirmed noise.
   if(energy>110||l<8||l>247)continue;
   const neighbors=[p-4,p+4,p-width*4,p+width*4],average=neighbors.reduce((a,q)=>a+Y(data,q),0)/4;
   const residual=Math.abs(l-average);map.bins[k*64+Math.min(63,Math.round(residual*2))]++;
   const chroma=Math.max(...[0,2].map(c=>Math.abs((data[p+c]-l)-neighbors.reduce((a,q)=>a+data[q+c]-Y(data,q),0)/4)));
   map.chromaBins[k*64+Math.min(63,Math.round(chroma*2))]++;map.counts[k]++;
  }
 }
}
export function finishNoise(map){
 const median=(bins,k,n)=>{let total=0;for(let i=0;i<64;i++){total+=bins[k*64+i];if(total>n/2)return i/2;}return 0;};
 const cells=Array.from(map.counts,(n,k)=>{const evidence=n/Math.max(1,map.examined[k]);return {samples:n,noise:n>=16?median(map.bins,k,n)/.754:null,chroma:n>=16?median(map.chromaBins,k,n)/.754:null,confidence:n>=16?Math.min(1,n/64)*evidence:0,structuredFraction:map.structured[k]/Math.max(1,map.examined[k]),reason:n<16?'insufficient flat evidence':evidence<.4?'structure/texture uncertainty':'flat residual estimate; not noise ground truth'};});
 return {width:map.width,height:map.height,tile:map.tile,cols:map.cols,rows:map.rows,step:map.step,cells};
}
export function noiseAt(map,x,y,luma){const band=luma<64?0:luma<192?1:2;return map.cells[(Math.min(map.rows-1,Math.floor(y/map.tile))*map.cols+Math.min(map.cols-1,Math.floor(x/map.tile)))*3+band];}
