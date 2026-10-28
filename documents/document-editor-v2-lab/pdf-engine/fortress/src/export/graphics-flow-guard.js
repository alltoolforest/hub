import {loadPdfjs} from '../rendering/pdfjs.js';
const identity=()=>[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function graphicCrossesFlowBoundary(box,{bandLeft,bandRight,boundaries}){
 const [left,bottom,right,top]=box;if(!box.every(Number.isFinite))return true;
 if(right<=bandLeft||left>=bandRight)return false;
 const low=Math.min(...boundaries),high=Math.max(...boundaries);
 if(top<=low||bottom>=high)return false;
 if(left<bandLeft-.25&&right>bandLeft+.25||left<bandRight-.25&&right>bandRight+.25)return true;
 return boundaries.some(y=>bottom<y-.25&&top>y+.25);
}
export async function validateGraphicsFlow(bytes,pageIndex,geometry){
 let task;
 try{
  const pdfjs=await loadPdfjs();task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false});const pdf=await task.promise,page=await pdf.getPage(pageIndex+1),ops=await page.getOperatorList({annotationMode:pdfjs.AnnotationMode.DISABLE}),O=pdfjs.OPS;
  let matrix=identity();const stack=[];
  const box=raw=>{const [x0,y0,x1,y1]=raw,points=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];};
  for(let i=0;i<ops.fnArray.length;i++){
   const op=ops.fnArray[i],args=ops.argsArray[i];let bounds;
   if(op===O.save){stack.push([...matrix]);continue;}
   if(op===O.restore){if(!stack.length)return {ok:false,reason:'GRAPHICS_STATE_UNBALANCED'};matrix=stack.pop();continue;}
   if(op===O.transform){matrix=multiply(matrix,args);continue;}
   if(op===O.paintFormXObjectBegin){stack.push([...matrix]);if(args?.[0])matrix=multiply(matrix,args[0]);continue;}
   if(op===O.paintFormXObjectEnd){if(!stack.length)return {ok:false,reason:'GRAPHICS_STATE_UNBALANCED'};matrix=stack.pop();continue;}
   if([O.paintImageXObject,O.paintInlineImageXObject,O.paintImageMaskXObject,O.paintSolidColorImageMask].includes(op))bounds=box([0,0,1,1]);
   else if(op===O.constructPath&&args?.[2]?.length===4)bounds=box(args[2]);
   else if([O.paintImageXObjectRepeat,O.paintImageMaskXObjectRepeat,O.paintInlineImageXObjectGroup,O.paintImageMaskXObjectGroup,O.shadingFill].includes(op))return {ok:false,reason:'COMPLEX_GRAPHICS_REFLOW_PROTECTED'};
   if(bounds&&graphicCrossesFlowBoundary(bounds,geometry))return {ok:false,reason:'GRAPHIC_CROSSES_REFLOW_BOUNDARY',bounds};
  }
  return {ok:true};
 }catch(error){return {ok:false,reason:'GRAPHICS_REFLOW_INSPECTION_FAILED',error:String(error)};}
 finally{if(task)await task.destroy();}
}
