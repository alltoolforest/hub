// PDF.js includes page rotation and crop origin in this viewport transform.
// Invert it to place a canvas patch back in the original PDF coordinate space.
export function patchPlacement(rect,transform){
  if(!Array.isArray(transform)||transform.length!==6||!transform.every(Number.isFinite))throw new Error('Scanned page geometry is unavailable.');
  const [a,b,c,d,e,f]=transform,det=a*d-b*c;
  if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw new Error('Scanned page geometry is invalid.');
  const point=(x,y)=>({x:(d*(x-e)-c*(y-f))/det,y:(a*(y-f)-b*(x-e))/det});
  const origin=point(rect.x,rect.y+rect.height),right=point(rect.x+rect.width,rect.y+rect.height),top=point(rect.x,rect.y);
  return {x:origin.x,y:origin.y,width:Math.hypot(right.x-origin.x,right.y-origin.y),height:Math.hypot(top.x-origin.x,top.y-origin.y),angle:Math.atan2(right.y-origin.y,right.x-origin.x)*180/Math.PI};
}
