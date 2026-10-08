// CSV Viewer & Cleaner — Task 4 core table operations; pure, non-mutating.
export function width(rows){return rows.reduce((n,r)=>Math.max(n,r.length),0)}
export function viewIndices(rows,{header=false,search='',filterColumn=-1,filterText='',sortColumn=-1,descending=false}={}){
 const first=header?1:0,query=search.toLocaleLowerCase(),filter=filterText.toLocaleLowerCase();
 const indices=[];
 for(let i=first;i<rows.length;i++){
  const row=rows[i];
  if(query&&!row.some(v=>String(v??'').toLocaleLowerCase().includes(query)))continue;
  if(filter&&filterColumn>=0&&!String(row[filterColumn]??'').toLocaleLowerCase().includes(filter))continue;
  indices.push(i);
 }
 if(sortColumn>=0){
  const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
  indices.sort((a,b)=>{
   const x=String(rows[a][sortColumn]??''),y=String(rows[b][sortColumn]??'');
   const cmp=collator.compare(x,y);
   return (descending?-cmp:cmp)||(a-b);
  });
 }
 return indices;
}
export function addRow(rows,{header=false,maxRows=2000}={}){
 if(rows.length>=maxRows)throw Error('Maximum 2,000 rows reached.');
 return [...rows.map(r=>r.slice()),Array(Math.max(1,width(rows))).fill('')];
}
export function deleteRow(rows,index,{header=false}={}){
 if(!Number.isInteger(index)||index<0||index>=rows.length)throw Error('Invalid row.');
 if(header&&index===0)throw Error('Header row cannot be deleted using Delete row.');
 return rows.filter((_,i)=>i!==index).map(r=>r.slice());
}
export function addColumn(rows,{maxColumns=100}={}){
 if(width(rows)>=maxColumns)throw Error('Maximum 100 columns reached.');
 return rows.map(r=>[...r,...Array(width(rows)-r.length+1).fill('')]);
}
export function deleteColumn(rows,index){
 if(!Number.isInteger(index)||index<0||index>=width(rows))throw Error('Invalid column.');
 return rows.map(r=>r.filter((_,j)=>j!==index));
}
export function removeDuplicateKeys(rows,columns,{header=false}={}){
 if(!Array.isArray(columns)||!columns.length||columns.some(c=>!Number.isInteger(c)||c<0||c>=width(rows)))throw Error('Select at least one valid comparison column.');
 const seen=new Set(),result=[];let removed=0;
 rows.forEach((row,i)=>{
  if(header&&i===0){result.push(row.slice());return;}
  const key=JSON.stringify(columns.map(j=>row[j]??''));
  if(seen.has(key))removed++;else{seen.add(key);result.push(row.slice());}
 });
 return {rows:result,removed};
}
