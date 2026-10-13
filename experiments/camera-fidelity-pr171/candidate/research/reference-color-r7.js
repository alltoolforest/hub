// Portrait-specific offline reference grading. Pointwise color curves only.
// No reference image pixels, texture, geometry or faces are copied to output.
export function fitReferenceCurves(baseRegions,targetRegions){
 const names=['hair','background','skin','shirt'];
 const curves=[];
 for(let channel=0;channel<3;channel++){
  const anchors=[[0,0],...names.map(n=>[baseRegions[n].rgb[channel],targetRegions[n].rgb[channel]]),[255,255]].sort((a,b)=>a[0]-b[0]);
  if(anchors.some((a,i)=>!a.every(Number.isFinite)||a.some(v=>v<0||v>255)||(i&&a[0]<=anchors[i-1][0])))throw new Error('Invalid reference anchors');
  // Limit slopes to [.1,2] in both directions and preserve black/white.
  // This bounds tonal amplification; it does not guarantee noise suppression.
  for(let i=1;i<anchors.length-1;i++){const dx=anchors[i][0]-anchors[i-1][0];anchors[i][1]=Math.max(anchors[i-1][1]+.1*dx,Math.min(anchors[i-1][1]+2*dx,anchors[i][1]));}
  for(let i=anchors.length-2;i>0;i--){const dx=anchors[i+1][0]-anchors[i][0];anchors[i][1]=Math.max(anchors[i+1][1]-2*dx,Math.min(anchors[i+1][1]-.1*dx,anchors[i][1]));}
  const curve=new Float32Array(256);
  for(let v=0;v<256;v++){let j=1;while(j<anchors.length-1&&v>anchors[j][0])j++;const[a,b]=[anchors[j-1],anchors[j]],t=(v-a[0])/(b[0]-a[0]);curve[v]=a[1]*(1-t)+b[1]*t;}
  curves.push({anchors,curve});
 }
 return curves;
}
export function referenceGrade(data,curves,amount=1){
 if(!(data instanceof Uint8ClampedArray)||data.length%4||!Number.isFinite(amount)||amount<0||amount>1||!Array.isArray(curves)||curves.length!==3)throw new Error('Invalid grading inputs');
 for(const c of curves){if(!(c.curve instanceof Float32Array)||c.curve.length!==256)throw new Error('Invalid curve');for(let i=0;i<256;i++)if(!Number.isFinite(c.curve[i])||c.curve[i]<0||c.curve[i]>255||(i&&c.curve[i]<c.curve[i-1]))throw new Error('Nonmonotonic or invalid curve');}
 const out=data.slice();for(let p=0;p<data.length;p+=4)if(data[p+3]===255)for(let c=0;c<3;c++)out[p+c]=data[p+c]+amount*(curves[c].curve[data[p+c]]-data[p+c]);return out;
}
