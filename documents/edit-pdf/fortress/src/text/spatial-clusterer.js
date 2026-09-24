export function clusterVisualRuns(items){
  const runs=items.map((item,index)=>{
    const t=item.transform||[1,0,0,1,0,0]; const fontSize=Math.hypot(t[0],t[1])||item.height||12;
    return {index,item,text:item.str||'',x:t[4],y:t[5],width:item.width||0,height:item.height||fontSize,fontSize,fontName:item.fontName||'',angle:Math.atan2(t[1],t[0])};
  }).filter(r=>r.text.length>0);
  runs.sort((a,b)=>Math.abs(b.y-a.y)>Math.max(a.fontSize,b.fontSize)*0.35?(b.y-a.y):(a.x-b.x));
  const lines=[];
  for(const run of runs){
    const yTol=Math.max(1.2,run.fontSize*0.25); const angleTol=0.08;
    let best=null,bestScore=Infinity;
    for(const line of lines){
      const baseline=Math.abs(line.y-run.y); if(baseline>yTol||Math.abs(line.angle-run.angle)>angleTol) continue;
      const right=Math.max(...line.runs.map(r=>r.x+r.width)); const gap=run.x-right; const gapLimit=Math.max(run.fontSize*1.25,4);
      if(gap < -run.fontSize*0.75 || gap > gapLimit) continue;
      const score=baseline+Math.max(0,gap)*0.1; if(score<bestScore){best=line;bestScore=score;}
    }
    if(!best) lines.push({y:run.y,angle:run.angle,runs:[run]}); else best.runs.push(run);
  }
  for(const l of lines) l.runs.sort((a,b)=>a.x-b.x);
  lines.sort((a,b)=>b.y-a.y || a.runs[0].x-b.runs[0].x);
  return lines;
}
