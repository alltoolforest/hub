function finite(value){return Number.isFinite(Number(value));}
function rectArea(rect){return Math.max(0,rect.right-rect.left)*Math.max(0,rect.bottom-rect.top);}
function overlapAmount(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}
function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function iou(a,b){
  const w=overlapAmount(a.left,a.right,b.left,b.right),h=overlapAmount(a.top,a.bottom,b.top,b.bottom),intersection=w*h;
  if(intersection<=0)return 0;
  const union=rectArea(a)+rectArea(b)-intersection;
  return union>0?intersection/union:0;
}
function isUsable(rect){return rect&&[rect.left,rect.right,rect.top,rect.bottom].every(finite)&&rect.right-rect.left>1&&rect.bottom-rect.top>1&&normalizeText(rect.text);}
function sameVisualLine(a,b){
  const minHeight=Math.max(1,Math.min(a.bottom-a.top,b.bottom-b.top));
  const baselineA=finite(a.baseline)?Number(a.baseline):(a.top+a.bottom)/2;
  const baselineB=finite(b.baseline)?Number(b.baseline):(b.top+b.bottom)/2;
  const angleA=finite(a.angle)?Number(a.angle):0,angleB=finite(b.angle)?Number(b.angle):0;
  return Math.abs(angleA-angleB)<.12&&Math.abs(baselineA-baselineB)<=Math.max(1.25,minHeight*.30);
}

export function assessVisualGeometry(rectangles,{width,height,tolerance=2}={}){
  const pageWidth=Math.max(1,Number(width)||1),pageHeight=Math.max(1,Number(height)||1);
  const rects=(rectangles||[]).filter(isUsable).map((rect,index)=>({...rect,index,text:normalizeText(rect.text)}));
  const outOfBounds=[];
  for(const rect of rects){
    const overflow={left:Math.max(0,-rect.left),right:Math.max(0,rect.right-pageWidth),top:Math.max(0,-rect.top),bottom:Math.max(0,rect.bottom-pageHeight)};
    const amount=Math.max(overflow.left,overflow.right,overflow.top,overflow.bottom);
    if(amount>tolerance)outOfBounds.push({index:rect.index,text:rect.text,amount,overflow,rect});
  }

  const collisions=[],duplicates=[];
  const sorted=[...rects].sort((a,b)=>a.left-b.left||a.top-b.top);
  for(let i=0;i<sorted.length;i++){
    const a=sorted[i],aw=a.right-a.left,ah=a.bottom-a.top;
    for(let j=i+1;j<sorted.length;j++){
      const b=sorted[j];if(b.left>a.right+1)break;
      const bw=b.right-b.left,bh=b.bottom-b.top;
      const overlapW=overlapAmount(a.left,a.right,b.left,b.right),overlapH=overlapAmount(a.top,a.bottom,b.top,b.bottom);
      if(overlapW<=0||overlapH<=0)continue;
      const horizontalRatio=overlapW/Math.max(1,Math.min(aw,bw)),verticalRatio=overlapH/Math.max(1,Math.min(ah,bh));
      const pairIou=iou(a,b);
      if(a.text===b.text&&pairIou>=.78){
        duplicates.push({a:a.index,b:b.index,text:a.text,iou:pairIou});continue;
      }
      if(sameVisualLine(a,b))continue;
      const rotated=Math.abs(Number(a.angle)||0)>.12||Math.abs(Number(b.angle)||0)>.12;
      if(rotated)continue;
      if(horizontalRatio>=.28&&verticalRatio>=.48){
        collisions.push({a:a.index,b:b.index,textA:a.text,textB:b.text,horizontalRatio,verticalRatio,severity:horizontalRatio*verticalRatio});
      }
    }
  }
  collisions.sort((a,b)=>b.severity-a.severity);duplicates.sort((a,b)=>b.iou-a.iou);
  return {rectangleCount:rects.length,outOfBounds,collisions,duplicates,maxCollisionSeverity:collisions[0]?.severity||0};
}

export function compareVisualGeometry(output,baseline=null){
  const before=baseline||{outOfBounds:[],collisions:[],duplicates:[],maxCollisionSeverity:0,rectangleCount:0};
  const failures=[];
  if(output.outOfBounds.length>before.outOfBounds.length){
    failures.push({code:'VISUAL_TEXT_OUT_OF_BOUNDS',delta:output.outOfBounds.length-before.outOfBounds.length,samples:output.outOfBounds.slice(0,5)});
  }
  if(output.duplicates.length>before.duplicates.length){
    failures.push({code:'VISUAL_DUPLICATE_TEXT',delta:output.duplicates.length-before.duplicates.length,samples:output.duplicates.slice(0,5)});
  }
  if(output.collisions.length>before.collisions.length){
    failures.push({code:'VISUAL_TEXT_COLLISION',delta:output.collisions.length-before.collisions.length,samples:output.collisions.slice(0,5)});
  }else if(output.maxCollisionSeverity>before.maxCollisionSeverity+.18){
    failures.push({code:'VISUAL_COLLISION_SEVERITY_INCREASED',before:before.maxCollisionSeverity,after:output.maxCollisionSeverity,samples:output.collisions.slice(0,5)});
  }
  return {ok:failures.length===0,failures,output,baseline:before};
}
