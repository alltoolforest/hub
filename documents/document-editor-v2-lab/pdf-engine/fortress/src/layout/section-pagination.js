function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function median(values,fallback=12){
  const list=(values||[]).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!list.length)return fallback;
  const m=Math.floor(list.length/2);
  return list.length%2?list[m]:(list[m-1]+list[m])/2;
}
function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function headingLike(text){
  const value=normalizeText(text);
  if(!value||value.length>72)return false;
  const letters=[...value].filter(ch=>/[A-Za-z]/.test(ch));
  if(letters.length<4)return false;
  const upper=letters.filter(ch=>ch===ch.toUpperCase()).length;
  const ratio=upper/letters.length;
  return ratio>=.78&&!/[.!?]$/.test(value);
}
function itemRect(item){
  const text=normalizeText(item?.str);
  if(!text)return null;
  const t=item?.transform||[];
  const x=Number(t[4]),baseline=Number(t[5]);
  const size=Math.max(1,Math.hypot(Number(t[0])||0,Number(t[1])||0));
  const width=Math.max(1,Number(item?.width)||Array.from(text).length*size*.5);
  if(![x,baseline,size,width].every(Number.isFinite))return null;
  return {text,left:x,right:x+width,bottom:baseline-size*.30,top:baseline+size*.90,baseline,size};
}
function visualLines(items=[]){
  const rects=items.map(itemRect).filter(Boolean);
  if(!rects.length)return [];
  const size=median(rects.map(r=>r.size),12);
  const tolerance=Math.max(1.5,size*.22);
  const lines=[];
  for(const rect of rects.sort((a,b)=>b.baseline-a.baseline||a.left-b.left)){
    let line=lines.find(entry=>Math.abs(entry.baseline-rect.baseline)<=tolerance);
    if(!line){line={baseline:rect.baseline,left:rect.left,right:rect.right,bottom:rect.bottom,top:rect.top,size:rect.size,parts:[]};lines.push(line);}
    line.parts.push(rect);
    line.left=Math.min(line.left,rect.left);line.right=Math.max(line.right,rect.right);line.bottom=Math.min(line.bottom,rect.bottom);line.top=Math.max(line.top,rect.top);line.size=Math.max(line.size,rect.size);
  }
  for(const line of lines){line.parts.sort((a,b)=>a.left-b.left);line.text=normalizeText(line.parts.map(p=>p.text).join(' '));}
  return lines.sort((a,b)=>b.baseline-a.baseline||a.left-b.left);
}

/**
 * Detect conservative "keep together" groups from native PDF text geometry.
 * The first milestone intentionally limits section starts to short all-caps
 * headings. This covers common resume/report headings without guessing that
 * arbitrary paragraphs are semantic sections.
 */
export function detectSectionKeepGroups(items=[],{pageHeight=842}={}){
  const lines=visualLines(items);
  if(lines.length<2)return [];
  const headingIndexes=[];
  for(let i=0;i<lines.length;i++)if(headingLike(lines[i].text))headingIndexes.push(i);
  const groups=[];
  for(let h=0;h<headingIndexes.length;h++){
    const start=headingIndexes[h];
    const end=(headingIndexes[h+1]??lines.length);
    const segment=lines.slice(start,end);
    if(segment.length<2)continue;
    const top=Math.max(...segment.map(line=>line.top));
    const bottom=Math.min(...segment.map(line=>line.bottom));
    const height=top-bottom;
    if(!(height>0)||height>pageHeight*.48)continue;
    const heading=segment[0];
    groups.push({
      id:`section:${start}:${normalizeText(heading.text).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,
      label:heading.text,
      bottom,top,height,
      left:Math.min(...segment.map(line=>line.left)),
      right:Math.max(...segment.map(line=>line.right)),
      lineCount:segment.length,
      confidence:'ALL_CAPS_SECTION_HEADING',
    });
  }
  return groups;
}

export function normalizeKeepGroups(groups=[],{footerTop=0,bodyTop=Infinity}={}){
  return (groups||[]).map(group=>{
    const bottom=Number(group?.bottom),top=Number(group?.top);
    if(![bottom,top].every(Number.isFinite)||top<=bottom)return null;
    const clippedBottom=Math.max(bottom,footerTop);
    const clippedTop=Math.min(top,bodyTop);
    if(clippedTop<=clippedBottom+.5)return null;
    return {...group,bottom:clippedBottom,top:clippedTop,height:clippedTop-clippedBottom};
  }).filter(Boolean).sort((a,b)=>b.top-a.top);
}

/** Raise a bottom-overflow boundary to the top of a semantic section if the
 * boundary would otherwise split that section. The caller still performs its
 * existing full safety/link preflight after this adjustment. */
export function snapBoundaryToKeepGroup(boundary,groups=[],{footerTop=0,bodyTop=Infinity,safetyGap=4}={}){
  let current=clamp(Number(boundary)||footerTop,footerTop,bodyTop);
  let snappedGroup=null;
  const pad=Math.max(.8,Math.min(2.5,(Number(safetyGap)||4)*.28));
  for(let pass=0;pass<8;pass++){
    const crossing=(groups||[]).find(group=>group.bottom<current-.5&&group.top>current+.5);
    if(!crossing)break;
    const candidate=Math.min(bodyTop,crossing.top+pad);
    if(candidate<=current+.1||candidate>bodyTop-.1)break;
    current=candidate;
    snappedGroup=crossing;
  }
  return {boundary:current,snapped:!!snappedGroup,groupId:snappedGroup?.id||null,groupLabel:snappedGroup?.label||null};
}

export function partitionKeepGroups(groups=[],{outgoingBoundary,footerTop=0,bodyTop=Infinity,shift=0}={}){
  const stay=[]; const outgoing=[];
  for(const group of groups||[]){
    if(group.top<=footerTop+.5||group.bottom>=bodyTop-.5){stay.push({...group});continue;}
    if(group.top<=outgoingBoundary+.5){outgoing.push({...group});continue;}
    if(group.bottom>=outgoingBoundary-.5){stay.push({...group,bottom:group.bottom-shift,top:group.top-shift});continue;}
    // A partially sliced semantic group is no longer trusted as a future keep
    // group. The visible content is still handled by the existing reflow path.
  }
  return {stay,outgoing};
}

export function placeIncomingKeepGroups(groups=[],incoming,{bodyTopY}={}){
  if(!Array.isArray(groups)||!groups.length||!incoming)return [];
  const sourceBottom=Number(incoming.bottom),sourceTop=Number(incoming.top);
  const targetTop=Number(bodyTopY);
  if(![sourceBottom,sourceTop,targetTop].every(Number.isFinite)||sourceTop<=sourceBottom)return [];
  const h=sourceTop-sourceBottom;
  const targetBottom=targetTop-h;
  return groups.map(group=>{
    const bottom=Number(group?.bottom),top=Number(group?.top);
    if(![bottom,top].every(Number.isFinite)||top<=sourceBottom+.1||bottom>=sourceTop-.1)return null;
    const clippedBottom=Math.max(bottom,sourceBottom),clippedTop=Math.min(top,sourceTop);
    if(clippedTop<=clippedBottom+.5)return null;
    return {...group,bottom:targetBottom+(clippedBottom-sourceBottom),top:targetBottom+(clippedTop-sourceBottom)};
  }).filter(Boolean);
}

export function annotateFlowLinesWithKeepGroups(lines=[],{pageHeight=842}={}){
  const ordered=(lines||[]).map(line=>({...line})).sort((a,b)=>Number(b.top)-Number(a.top));
  const headings=[];
  for(let i=0;i<ordered.length;i++)if(headingLike(ordered[i]?.text))headings.push(i);
  for(let h=0;h<headings.length;h++){
    const start=headings[h],end=headings[h+1]??ordered.length;
    const segment=ordered.slice(start,end);
    if(segment.length<2)continue;
    const top=Math.max(...segment.map(line=>Number(line.top)).filter(Number.isFinite));
    const bottom=Math.min(...segment.map(line=>Number(line.bottom)).filter(Number.isFinite));
    if(![top,bottom].every(Number.isFinite)||top<=bottom||top-bottom>pageHeight*.48)continue;
    const label=normalizeText(segment[0]?.text);
    const id=`flow-section:${label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}:${start}`;
    for(let i=start;i<end;i++)ordered[i]={...ordered[i],keepGroupId:id,keepGroupLabel:label,keepGroupTop:top,keepGroupBottom:bottom};
  }
  return ordered;
}
