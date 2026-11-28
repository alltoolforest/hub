// Reconstruct only where the recognized words provide geometric evidence.
export const NUMERIC_WHITELIST='0123456789.+,-−$€£¥₹%‰()eE';
const numeral='\\d[\\d.,]*(?:[eE][+−-]?\\d+)?';
const numeric=new RegExp('^(?:(?:[+−-]?[$€£¥₹]?|[$€£¥₹][+−-])'+numeral+
 '(?:[%‰$€£¥₹])?|\\([$€£¥₹]?'+numeral+'[$€£¥₹]?\\))$','u');
export const isNumeric=text=>numeric.test(text);
const center = word => word.y + word.h / 2;
const right = word => word.x + word.w;
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];
const lineText = words => words.map(word => word.text).join(' ');
const wordsMatch = (words, raw) => lineText(words) === raw.trim().replace(/\s+/g,' ');

export function rasterBlank(data) {
 let min = 255, max = 0;
 for(let offset=0;offset<data.length;offset+=4){
  const level=Math.min(data[offset],data[offset+1],data[offset+2]);
  if(level<236)return false;
  min=Math.min(min,level);
  max=Math.max(max,level);
  if(max-min>4)return false;
 }
 return max>=242 && min>=242;
}

// Rule detection runs only after the original OCR cannot explain the layout.
// Require a grid on both axes so one underline or a border alone cannot trigger it.
export function eraseDetectedGrid(image){
 const {data,width,height}=image;
 const horizontal=[],vertical=[];
 for(let y=0;y<height;y++){
  let dark=0;
  for(let x=0;x<width;x+=2)if(data[(y*width+x)*4]<190)dark++;
  if(dark>=width*.28)horizontal.push(y);
 }
 for(let x=0;x<width;x++){
  let dark=0;
  for(let y=0;y<height;y+=2)if(data[(y*width+x)*4]<190)dark++;
  if(dark>=height*.16)vertical.push(x);
 }
 const groups=values=>values.filter((value,i)=>!i||value-values[i-1]>1).length;
 if(groups(horizontal)<3||groups(vertical)<3||horizontal.length>height*.06||vertical.length>width*.06)return false;
 const firstX=vertical[0],lastX=vertical.at(-1),firstY=horizontal[0],lastY=horizontal.at(-1);
 const xLines=new Set(vertical),yLines=new Set(horizontal);
 const outside=(line,step,lines)=>{while(lines.has(line))line+=step;return line;};
 const at=(x,y)=>(y*width+x)*4;
 const isDark=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&data[at(x,y)]<175;
 for(const y of horizontal){
  const above=outside(y,-1,yLines),below=outside(y,1,yLines);
  for(let x=firstX;x<=lastX;x++){
   if(!xLines.has(x)&&isDark(x,above)&&isDark(x,below))continue;
   const i=at(x,y);data[i]=data[i+1]=data[i+2]=255;
  }
 }
 for(const x of vertical){
  const left=outside(x,-1,xLines),right=outside(x,1,xLines);
  for(let y=firstY;y<=lastY;y++){
   if(!yLines.has(y)&&isDark(left,y)&&isDark(right,y))continue;
   const i=at(x,y);data[i]=data[i+1]=data[i+2]=255;
  }
 }
 return true;
}

function visualRows(words, height) {
 const rows=[];
 for(const word of [...words].sort((a,b)=>center(a)-center(b))){
  const row=rows.at(-1);
  if(row && Math.abs(center(word)-row.y)<=height*.48){
   row.words.push(word);
  }else rows.push({y:center(word),words:[word]});
 }
 for(const row of rows)row.words.sort((a,b)=>a.x-b.x);
 return rows;
}

function segments(words, gap) {
 const cells=[];
 for(const word of words){
  const cell=cells.at(-1);
  if(cell && word.x-right(cell.at(-1))<gap)cell.push(word);
  else cells.push([word]);
 }
 return cells;
}

export function detectTable(words, raw) {
 if(words.length<16 || !wordsMatch(words,raw))return null;
 const height=median(words.map(word=>word.h));
 const rows=visualRows(words,height);
 for(let start=0;start+4<rows.length;start++){
  const head=segments(rows[start].words,height*1.65);
  if(head.length<3 || head.length>12)continue;
  const headerless=head.some(cell=>numeric.test(lineText(cell)));
  // A headerless run needs both textual and numerical evidence in its first row.
  if(!head.every(cell=>/\p{L}/u.test(lineText(cell))||numeric.test(lineText(cell))) ||
     !head.some(cell=>/\p{L}/u.test(lineText(cell))&&!numeric.test(lineText(cell))))continue;
  const anchors=head.map(cell=>cell[0].x);
  const assign=row=>{
   const cells=anchors.map(()=>[]);
   for(const segment of segments(row.words,height*1.65)){
    let column=anchors.findIndex(x=>Math.abs(x-segment[0].x)<=height*1.25);
    if(column<0&&numeric.test(lineText(segment))){
     // A right-aligned numeric value may begin just to the left of its
     // exemplar. Require unique, close geometric evidence.
     const possible=anchors.map((x,i)=>i).filter(i=>{
      const a=head[i];
      return numeric.test(lineText(a))&&Math.abs(right(a.at(-1))-right(segment.at(-1)))<=height*.6;
     });
     if(possible.length===1)column=possible[0];
    }
    if(column<0&&/\d/u.test(lineText(segment))){
     // Numeric text may align to either edge of its column. The entire
     // segment must fit in a unique header-delimited interval.
     const start=segment[0].x,end=right(segment.at(-1));
     const candidate=anchors.findIndex((x,i)=>i>=2&&start>=x-height*.65&&
      end<(anchors[i+1]??Infinity)-height*.25);
     if(candidate>=0)column=candidate;
    }
    if(column<0 || cells[column].length)return null;
    cells[column]=segment;
   }
   return cells;
  };
  const body=headerless?[{...rows[start],cells:head}]:[];
  const step=rows[start+1].y-rows[start].y;
  let end=start+1;
  for(;end<rows.length && body.length<500;end++){
   const i=end;
   const row=rows[i];
   const previous=body.at(-1);
   const delta=row.y-(previous?.y??rows[start].y);
   const cells=assign(row);
   if(!cells)break;
   const filled=cells.map((cell,column)=>column).filter(column=>cells[column].length);
   const continuation=filled.length===1 && filled[0]>0 && previous?.cells[filled[0]].length &&
    cells[filled[0]].every(word=>/^\p{L}/u.test(word.text));
   if(delta<step*.55 && delta>step*.18 && continuation){
    previous.cells[filled[0]].push(...cells[filled[0]]);
    continue;
   }
   const sparse=head.length>=5&&cells[0].length&&cells[1].length&&
    filled.length>=head.length-2&&filled.slice(2).some(column=>numeric.test(lineText(cells[column])));
   if(delta<step*.55 || delta>step*1.85 || (filled.length<head.length-1&&!sparse))break;
   body.push({...row,cells});
  }
  if(body.length<4)continue;
  const numberColumns=anchors.map((x,i)=>i).filter(i=>{
   const values=body.map(row=>lineText(row.cells[i])).filter(Boolean);
   const label=lineText(head[i]);
   const headerEvidence=!headerless&&i>=2&&/^(?:qty|quantity|count|amount|net amount|price|total|adjustment|balance)(?:\s|$)/i.test(label);
   return headerEvidence||values.length>=2&&values.filter(value=>numeric.test(value)).length>=values.length*.7;
  });
  if(!numberColumns.length || !numberColumns.some(i=>body.filter(row=>row.cells[i].length).length>=body.length*.65))continue;
  const left=rows.slice(0,start);
  const rightRows=rows.slice(end);
  return {anchors,header:headerless?[]:head,body,numberColumns,height,step,left,rightRows};
 }
 return null;
}

function blockBounds(words){
 return {words,left:Math.min(...words.map(w=>w.x)),right:Math.max(...words.map(right)),
  top:Math.min(...words.map(w=>w.y)),bottom:Math.max(...words.map(w=>w.y+w.h))};
}

export function orderColumnBlocks(words,raw){
 if(words.length<30 || !wordsMatch(words,raw))return '';
 const blocks=new Map();
 for(const word of words){
  if(!blocks.has(word.block))blocks.set(word.block,[]);
  blocks.get(word.block).push(word);
 }
 const boxes=[...blocks.values()].map(blockBounds);
 const height=median(words.map(w=>w.h));
 for(const left of boxes){
  if(left.words.length<8)continue;
  const rightBox=boxes.find(b=>b.left-left.right>height*2 && b.words.length>=8 &&
   Math.abs(left.top-b.top)<height*1.5 && Math.min(left.bottom,b.bottom)-Math.max(left.top,b.top)>height*2);
  if(!rightBox)continue;
  const gutter=(left.right+rightBox.left)/2;
  let top=Math.min(left.top,rightBox.top), bottom=Math.max(left.bottom,rightBox.bottom);
  const headingGap=height*3;
  const lane=boxes.filter(b=>b.right<gutter || b.left>gutter);
  for(const box of [...lane].sort((a,b)=>b.top-a.top)){
   if(box.top<top && top-box.bottom<headingGap)top=box.top;
  }
  for(const box of [...lane].sort((a,b)=>a.top-b.top)){
   if(box.top>=top && box.top-bottom<headingGap)bottom=Math.max(bottom,box.bottom);
  }
  const region=boxes.filter(b=>b.top>=top && b.bottom<=bottom);
  if(region.some(b=>b.left<gutter && b.right>gutter))continue;
  const first=region.filter(b=>b.right<=gutter);
  const second=region.filter(b=>b.left>=gutter);
  if(first.length<2 || second.length<2 || first.length+second.length!==region.length)continue;
  const outside=boxes.filter(b=>!region.includes(b));
  const ordered=[outside.filter(b=>b.top<top),first,second,outside.filter(b=>b.top>=top)]
   .flatMap(group=>group.sort((a,b)=>a.top-b.top));
  return ordered.map(b=>lineText(b.words)).join('\n\n');
 }
 return '';
}

// Some OCR modes group both columns in the same blocks. A repeated
// whitespace gutter within a prose region is stronger evidence than those
// block IDs. Spanning headings remain outside the column region.
export function orderProseRows(rows){
 if(rows.length<6)return '';
 const words=rows.flatMap(row=>row.words);
 const height=median(words.map(word=>word.h));
 const min=Math.min(...words.map(word=>word.x)),max=Math.max(...words.map(right));
 const width=max-min;
 if(!width)return '';
 let best=null;
 for(let n=35;n<=65;n++){
  const gutter=min+width*n/100;
  let start=-1,score=0;
  for(let i=0;i<=rows.length;i++){
   const words=rows[i]?.words??[];
   const lhs=words.filter(word=>right(word)<=gutter);
   const rhs=words.filter(word=>word.x>=gutter);
   const gap=lhs.length&&rhs.length?rhs[0].x-right(lhs.at(-1)):0;
   if(lhs.length+rhs.length===words.length&&lhs.length>=2&&rhs.length>=2&&gap>=height*1.5){
    if(start<0)start=i;
    score+=Math.min(gap,height*5);
    continue;
   }
   if(start>=0&&i-start>=5&&(!best||score>best.score))best={start,end:i,gutter,score};
   start=-1;
   score=0;
  }
 }
 if(!best)return '';
 const slice=rows.slice(best.start,best.end);
 const lines=part=>part.map(row=>lineText(row.words)).join('\n');
 const lane=filter=>slice.map(row=>lineText(row.words.filter(filter))).join('\n');
 return [lines(rows.slice(0,best.start)),lane(word=>right(word)<=best.gutter),
  lane(word=>word.x>=best.gutter),lines(rows.slice(best.end))].filter(Boolean).join('\n\n');
}

export function hasUnverifiedTableRows(words){
 if(words.length<16)return false;
 const height=median(words.map(word=>word.h));
 let matches=0;
 for(const row of visualRows(words,height)){
  const cells=segments(row.words,height*1.65);
  if(cells.length>=3&&cells.some(cell=>numeric.test(lineText(cell)))&&++matches>=3)return true;
 }
 return false;
}

export function detectFollowingTable(table) {
 const words=table.rightRows.flatMap(row=>row.words);
 return detectTable(words,lineText(words));
}

export function regionBudget(constrained){
 const deadline=performance.now()+(constrained?10000:14000);
 let remaining=constrained?50:140;
 return {
  take(){if(remaining===0||performance.now()>=deadline)return false;remaining--;return true;},
  milliseconds(){return Math.max(0,Math.floor(deadline-performance.now()));}
 };
}

export function corroboratedRupee(original, result) {
 if(!result?.agreement||!/^₹\d/u.test(result.text)||!isNumeric(result.text))return false;
 const digits=result.text.slice(1);
 // Accept only when the numerical suffix agrees and the original differs
 // by at most one leading symbol or confusable character.
 return original===digits||
  (original.length===digits.length+1&&original.slice(1)===digits&&!/[-−+()$€£¥₹]/u.test(original[0]));
}

export async function reconstructTable(table, recognize, job, refine=false, verifyIds=false, budget=regionBudget(false)){
 const {anchors,header,body,numberColumns,height,step,left,rightRows}=table;
 const cells=body.map(row=>row.cells.map(lineText));
 const warnings=[];
 let uncertain=0, attempts=0;
 const missing=cells.reduce((count,row)=>count+numberColumns.filter(column=>!row[column]).length,0);
 const maxAttempts=Math.min(missing,verifyIds?42:112,Math.max(12,body.length*numberColumns.length));
 const warn=(row,column,message)=>{
  uncertain++;
  if(warnings.length<8)warnings.push('Row '+(row+1)+', column '+(column+1)+': '+message);
 };
 for(let row=0;row<body.length;row++){
  for(const column of numberColumns){
   job.check();
   if(cells[row][column]){
    if(!isNumeric(cells[row][column])||body[row].cells[column].some(word=>word.confidence<75))warn(row,column,'check numerical reading');
    continue;
   }
   if(attempts>=maxAttempts||!budget.take()){warn(row,column,'not verified within OCR budget');continue;}
   attempts++;
   const x=anchors[column]-height*.4;
   const end=anchors[column+1] ?? (anchors[column]+height*8);
   const half=Math.min(step*.37,height*1.1);
   const value=await recognize({x,y:body[row].y-half,width:end-x-height*.4,height:half*2},true);
   if(!value)continue;
   if(numeric.test(value.text) && (value.confidence>=55 || value.agreement&&value.confidence>=45)){
    cells[row][column]=value.text;
    if(value.confidence<85)warn(row,column,'check recovered value');
   }else warn(row,column,'visible or ambiguous content could not be read');
  }
 }
 for(let row=0;row<body.length;row++){
  for(const column of numberColumns){
   if(!/\b(?:amount|price|balance|total)\b/i.test(lineText(header[column]??[])))continue;
   const original=cells[row][column];
   if(!/\d,\d{3}[.,]/u.test(original)||/[$€£¥₹()−-]/u.test(original))continue;
   job.check();
   if(!budget.take()){warn(row,column,'currency not verified within OCR budget');continue;}
   const bounds=blockBounds(body[row].cells[column]);
   const left=Math.max(anchors[column]-height*.55,bounds.left-height*.95);
   const result=await recognize({x:left,y:bounds.top-height*.25,
    width:bounds.right-left+height*.25,height:bounds.bottom-bounds.top+height*.5},'currency');
   if(corroboratedRupee(original,result)){
    cells[row][column]=result.text;
    if(result.confidence<65)warn(row,column,'verify the recovered currency symbol');
   }
   else if(!result?.text||result.text!==original)warn(row,column,'currency or amount could not be verified');
  }
 }
 const refined=new Map();
 const fragmented=body.map(row=>row.cells[0]).filter(cell=>cell.length>1&&
  /^[A-Za-z]+-\s+\d+$/.test(lineText(cell)));
 if(refine||verifyIds||fragmented.length){
  const textRegions=refine?[...left.slice(0,3).map(row=>row.words),
   ...body.flatMap(row=>row.cells.slice(1).filter(cell=>cell.length>1))]:[];
  const identifiers=[...fragmented,...(verifyIds?body.map(row=>row.cells[0]).filter(cell=>cell.length===1):[])];
  const regions=[...textRegions,...identifiers];
  for(const words of regions.slice(0,30)){
   const original=lineText(words);
   const joined=original.replace(/\s+/g,'');
   const id=/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]+$/.test(joined);
   if(!id&&!/^[\p{L}\s/]+$/u.test(original))continue;
   job.check();
   if(!budget.take())break;
   const bounds=blockBounds(words);
   const pad=height*.28;
   const result=await recognize({x:bounds.left-pad,y:bounds.top-pad,width:bounds.right-bounds.left+pad*2,height:bounds.bottom-bounds.top+pad*2},false);
   const baseline=words.reduce((sum,word)=>sum+word.confidence,0)/words.length;
   if(!result||result.text===original)continue;
   const reliableId=id&&result.agreement&&result.confidence>=Math.max(87,baseline-3)&&
    result.text.length>=joined.length&&result.text.length<=joined.length+1&&/^[A-Za-z0-9_-]+$/.test(result.text);
   const reliableText=!id&&result.confidence>=Math.max(88,baseline-4)&&
    result.text.length>=original.length*.85&&/^[\p{L}\s/]+$/u.test(result.text);
   if(reliableId||reliableText){
    refined.set(words,result.text);
    uncertain++;
   }
  }
 }
 for(let i=0;i<body.length;i++)for(let j=0;j<cells[i].length;j++){
  if(refined.has(body[i].cells[j]))cells[i][j]=refined.get(body[i].cells[j]);
 }
 const original=row=>refined.get(row.words)??lineText(row.words);
 const prose=rows=>{
  const words=rows.flatMap(row=>row.words);
  return rows.some(row=>refined.has(row.words))?rows.map(original).join('\n'):
   orderProseRows(rows)||orderColumnBlocks(words,lineText(words))||rows.map(original).join('\n');
 };
 const tableText=[...(header.length?[header.map(lineText)]:[]),...cells].map(row=>row.join('\t')).join('\n');
 return {text:[prose(left),tableText,prose(rightRows)].filter(Boolean).join('\n\n'),uncertain,warnings};
}
