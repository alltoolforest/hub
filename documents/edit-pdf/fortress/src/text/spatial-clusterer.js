function estimatedInkWidth(text,fontSize){
  const chars=Array.from(String(text||''));
  if(!chars.length)return 0;
  let visible=0,spaces=0;
  for(const ch of chars){
    if(/\s/u.test(ch))spaces++;
    else visible++;
  }
  return Math.max(fontSize*.5,(visible*fontSize*1.08)+(spaces*fontSize*.62));
}

function visualInkWidth(item,text,fontSize){
  const raw=Math.max(0,Number(item?.width)||0);
  if(!raw)return 0;
  const estimate=estimatedInkWidth(text,fontSize);
  // PDF.js can occasionally include a large positioning advance in item.width
  // even though the visible glyphs occupy only the beginning of that span.
  // Using that inflated width joins neighbouring table cells into one editable
  // block. Clamp only clear outliers; ordinary proportional/letter-spaced text
  // keeps the renderer-provided width.
  if(estimate>0&&raw>estimate*1.5&&raw-estimate>fontSize*2)return estimate;
  return raw;
}

export function clusterVisualRuns(items){
  const runs=items.map((item,index)=>{
    const t=item.transform||[1,0,0,1,0,0]; const fontSize=Math.hypot(t[0],t[1])||item.height||12;
    const text=item.str||'';const width=Math.max(0,Number(item.width)||0);const inkWidth=visualInkWidth(item,text,fontSize);
    return {index,item,text,x:t[4],y:t[5],width,inkWidth,height:item.height||fontSize,fontSize,fontName:item.fontName||'',angle:Math.atan2(t[1],t[0])};
  }).filter(r=>r.text.length>0);
  runs.sort((a,b)=>Math.abs(b.y-a.y)>Math.max(a.fontSize,b.fontSize)*0.35?(b.y-a.y):(a.x-b.x));
  const lines=[];
  for(const run of runs){
    const yTol=Math.max(1.2,run.fontSize*0.25); const angleTol=0.08;
    let best=null,bestScore=Infinity;
    for(const line of lines){
      const baseline=Math.abs(line.y-run.y); if(baseline>yTol||Math.abs(line.angle-run.angle)>angleTol) continue;
      const right=Math.max(...line.runs.map(r=>r.x+(Number.isFinite(r.inkWidth)?r.inkWidth:r.width))); const gap=run.x-right; const gapLimit=Math.max(run.fontSize*1.25,4);
      if(gap < -run.fontSize*0.75 || gap > gapLimit) continue;
      const score=baseline+Math.max(0,gap)*0.1; if(score<bestScore){best=line;bestScore=score;}
    }
    if(!best) lines.push({y:run.y,angle:run.angle,runs:[run]}); else best.runs.push(run);
  }
  for(const l of lines) l.runs.sort((a,b)=>a.x-b.x);
  lines.sort((a,b)=>b.y-a.y || a.runs[0].x-b.runs[0].x);
  return lines;
}
