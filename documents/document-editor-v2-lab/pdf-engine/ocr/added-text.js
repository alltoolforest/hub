// Added text is a transparent patch. It never erases the underlying scan.
export function renderAddedText({text,fontSize=12,color='#17211d',x,y},state){
  text=String(text||'').trim();
  if(!text||text.length>2000)throw new Error('Enter between 1 and 2,000 characters.');
  if(!Number.isFinite(fontSize)||fontSize<4||fontSize>144)throw new Error('Choose a text size between 4 and 144 pt.');
  if(!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Choose a valid text colour.');
  const canvas=document.createElement('canvas');let ctx=canvas.getContext('2d');
  const px=fontSize*state.renderPlan.scale,pad=2,lines=text.split(/\r?\n/),lineHeight=px*1.25;
  const font=`${px}px Arial,Helvetica,sans-serif`;ctx.font=font;
  const metrics=lines.map(line=>ctx.measureText(line));
  const left=Math.max(0,...metrics.map(m=>m.actualBoundingBoxLeft||0));
  const ascent=Math.max(px,...metrics.map(m=>m.actualBoundingBoxAscent||0));
  const descent=Math.max(px*.3,...metrics.map(m=>m.actualBoundingBoxDescent||0));
  const width=Math.ceil(left+Math.max(...metrics.map(m=>Math.max(m.width,m.actualBoundingBoxRight||0)))+pad*2);
  const height=Math.ceil(ascent+descent+(lines.length-1)*lineHeight+pad*2);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x+width>state.pixelWidth||y+height>state.pixelHeight)throw new Error('Text extends beyond the page. Use a smaller size, add a line break, or cancel and tap further from the edge.');
  canvas.width=width;canvas.height=height;ctx=canvas.getContext('2d');ctx.font=font;ctx.fillStyle=color;ctx.textBaseline='alphabetic';
  lines.forEach((line,i)=>ctx.fillText(line,pad+left,pad+ascent+i*lineHeight));
  return {canvas,rect:{x,y,width,height}};
}
