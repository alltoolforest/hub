import { applyToPoint, invert } from './matrices.js';

export function pdfRectToScreen(matrix, rect) {
  const x=rect?.x||0;
  const y=rect?.y||0;
  const w=rect?.width||0;
  const h=rect?.height||0;
  const points=[
    applyToPoint(matrix,x,y),
    applyToPoint(matrix,x+w,y),
    applyToPoint(matrix,x,y+h),
    applyToPoint(matrix,x+w,y+h),
  ];
  const xs=points.map(p=>p.x);
  const ys=points.map(p=>p.y);
  const left=Math.min(...xs);
  const right=Math.max(...xs);
  const top=Math.min(...ys);
  const bottom=Math.max(...ys);
  return {left,top,width:right-left,height:bottom-top};
}

export function screenPointToPdf(matrix, x, y) {
  const inv = invert(matrix);
  return applyToPoint(inv, x, y);
}
