// Move original rows, retaining editable cell nodes and their listeners. Keep
// row-group containers so restoring a view also restores the original structure.
export function tableRowGroups(table){
 const rows=[...table.rows],groups=[];
 for(let start=0;start<rows.length;){let end=start+1;
  for(let i=start;i<end;i++)for(const cell of rows[i].cells){
   const sectionEnd=rows.findIndex((row,j)=>j>i&&row.parentNode!==rows[i].parentNode);
   const limit=sectionEnd<0?rows.length:sectionEnd;
   end=Math.max(end,Math.min(limit,cell.rowSpan===0?limit:i+cell.rowSpan));
  }
  groups.push(rows.slice(start,end));start=end;
 }
 return groups;
}
export function fragmentWordTable(table,{remaining,advance,width,place}){
 const rows=[...table.rows],groups=tableRowGroups(table),fragments=[];if(groups.length<2)return null;
 const origins=rows.map(row=>({row,parent:row.parentNode,next:row.nextSibling}));
 const columns=[...table.children].filter(n=>n.tagName==='COLGROUP').map(n=>n.cloneNode(true));let current=table;
 const containers=new Map();
 function append(group){for(const row of group){const origin=origins.find(item=>item.row===row).parent;
  if(origin===table){current.append(row);continue;}
  let container=current===table?origin:containers.get(origin);
  if(!container){container=origin.cloneNode(false);container.removeAttribute('id');current.append(container);containers.set(origin,container);}
  container.append(row);
 }}
 function continuation(){current=table.cloneNode(false);current.removeAttribute('id');current.dataset.wordContinuation='true';current.append(...columns.map(n=>n.cloneNode(true)));table.parentNode.insertBefore(current,fragments.at(-1)?.nextSibling||table.nextSibling);fragments.push(current);containers.clear();current.style.width=width()+'pt';}
 for(const row of rows)row.remove();
 for(const group of groups){current.style.width=width()+'pt';append(group);
  if(current.getBoundingClientRect().height>remaining()+.5){
   const otherRows=[...current.rows].filter(row=>!group.includes(row));
   if(otherRows.length){for(const row of group)row.remove();place(current);advance();continuation();append(group);}
   else if(remaining()<0.01){advance();current.style.width=width()+'pt';}
  }
 }
 place(current);
 let restored=false;
 return {restore(){if(restored)return;restored=true;
  // Reverse insertion preserves comments and other siblings between rows.
  for(const {row,parent,next} of [...origins].reverse())parent.insertBefore(row,next?.parentNode===parent?next:null);
  for(const fragment of fragments)fragment.remove();
 }};
}
