const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const kids=(n,name)=>[...(n?.children||[])].filter(c=>c.namespaceURI===W&&c.localName===name),kid=(n,name)=>kids(n,name)[0];
const make=(doc,name,attrs={})=>{const n=doc.createElementNS(W,'w:'+name);for(const[k,v]of Object.entries(attrs))n.setAttributeNS(W,'w:'+k,String(v));return n;};
const number=(value,min,max)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error('Invalid table grid selection.');return value;};
function blank(doc){const tc=make(doc,'tc');tc.append(make(doc,'p'));return tc;}
function properties(doc,cell,span,vertical){let pr=kid(cell,'tcPr');if(!pr){pr=make(doc,'tcPr');cell.prepend(pr);}for(const n of [...kids(pr,'gridSpan'),...kids(pr,'vMerge'),...kids(pr,'hMerge')])n.remove();const order=['cnfStyle','tcW','gridSpan','hMerge','vMerge','tcBorders','shd','noWrap','tcMar','textDirection','tcFitText','vAlign','hideMark'];function add(name,attrs){const n=make(doc,name,attrs);pr.insertBefore(n,[...pr.children].find(x=>order.indexOf(x.localName)>order.indexOf(name))||null);}if(span>1)add('gridSpan',{val:span});if(vertical)add('vMerge',vertical==='restart'?{val:'restart'}:{});}
export function tableGrid(table){
 const rows=kids(table,'tr'),owners=[],matrix=[];let width=0;
 if(!rows.length||rows.length>1000||[...table.children].some(n=>!['tblPr','tblGrid','tr'].includes(n.localName)))throw new Error('Tracked or wrapped table rows are not supported.');
 rows.forEach((row,r)=>{const pr=kid(row,'trPr');if(kid(pr,'gridBefore')||kid(pr,'gridAfter')||[...row.children].some(n=>!['trPr','tc'].includes(n.localName)))throw new Error('Skipped or tracked table cells are not supported.');const line=[];let c=0;
  for(const cell of kids(row,'tc')){const props=kid(cell,'tcPr');if(kid(props,'hMerge')||kid(props,'cellIns')||kid(props,'cellDel')||kid(props,'cellMerge'))throw new Error('Legacy or tracked cell merges are not supported.');const raw=kid(props,'gridSpan')?.getAttributeNS(W,'val'),span=raw==null?1:number(Number(raw),1,100),merge=kid(props,'vMerge');let owner;
   if(merge&&merge.getAttributeNS(W,'val')!=='restart'){if([...cell.children].some(n=>n.localName!=='tcPr'&&(n.localName!=='p'||[...n.children].some(x=>x.localName!=='pPr'))))throw new Error('Merged continuation cells with content are protected.');owner=matrix[r-1]?.[c];if(!owner||owner.c!==c||owner.cs!==span||!owner.vertical||owner.r+owner.rs!==r)throw new Error('Invalid vertical table merge.');owner.rs++;}
   else{owner={r,c,rs:1,cs:span,cell,vertical:!!merge};owners.push(owner);}
   for(let i=0;i<span;i++)line[c++]=owner;
  }
  if(!c||c>100||r&&c!==width)throw new Error('Table rows must cover a consistent grid.');width=c;matrix.push(line);
 });
 const grid=kids(kid(table,'tblGrid'),'gridCol');if(grid.length&&grid.length!==width)throw new Error('Table grid width does not match its rows.');return {rows,owners,matrix,width,height:rows.length,grid};
}
export function editTableStructure(doc,table,command){
 const g=tableGrid(table),r=number(command.row,0,g.height-1),c=number(command.column,0,g.width-1);let owners=g.owners.map(o=>({...o})),rows=[...g.rows],width=g.width,grid=g.grid.map(n=>n.cloneNode(true));
 if(!grid.length)grid=Array.from({length:width},()=>make(doc,'gridCol',{w:Math.floor(9000/width)}));
 const selected=g.matrix[r][c];
 if(command.action==='add-row'){
  if(rows.length>=1000)throw new Error('Table row limit reached.');const at=r+1,row=make(doc,'tr'),pr=kid(rows[r],'trPr');if(pr){const clone=pr.cloneNode(true);kid(clone,'tblHeader')?.remove();row.append(clone);}rows.splice(at,0,row);
  for(const o of owners){if(o.r<at&&o.r+o.rs>at)o.rs++;else if(o.r>=at)o.r++;}
  for(let col=0;col<width;){const covering=owners.find(o=>o.r<=at&&o.r+o.rs>at&&o.c<=col&&o.c+o.cs>col);if(covering){col=covering.c+covering.cs;continue;}const template=g.matrix[r][col],span=Math.min(template.cs,width-col);const cell=blank(doc),pr=kid(template.cell,'tcPr');if(pr)cell.prepend(pr.cloneNode(true));owners.push({r:at,c:col,rs:1,cs:span,cell});col+=span;}
 }else if(command.action==='delete-row'){
  if(rows.length===1)throw new Error('Keep at least one table row.');rows.splice(r,1);owners=owners.filter(o=>!(o.r===r&&o.rs===1));for(const o of owners){if(o.r<=r&&o.r+o.rs>r)o.rs--;else if(o.r>r)o.r--;}
 }else if(command.action==='add-column'){
  if(width>=100)throw new Error('Table column limit reached.');const at=c+1;grid.splice(at,0,grid[c].cloneNode(true));width++;
  for(const o of owners){if(o.c<at&&o.c+o.cs>at)o.cs++;else if(o.c>=at)o.c++;}
  for(let row=0;row<rows.length;row++)if(!owners.some(o=>o.r<=row&&o.r+o.rs>row&&o.c<=at&&o.c+o.cs>at))owners.push({r:row,c:at,rs:1,cs:1,cell:blank(doc)});
 }else if(command.action==='delete-column'){
  if(width===1)throw new Error('Keep at least one table column.');grid.splice(c,1);width--;owners=owners.filter(o=>!(o.c===c&&o.cs===1));for(const o of owners){if(o.c<=c&&o.c+o.cs>c)o.cs--;else if(o.c>c)o.c--;}
 }else if(command.action==='merge'){
  const endRow=number(command.endRow,r,rows.length-1),endColumn=number(command.endColumn,c,width-1),within=owners.filter(o=>o.r<=endRow&&o.r+o.rs>r&&o.c<=endColumn&&o.c+o.cs>c);
  if(within.some(o=>o.r<r||o.c<c||o.r+o.rs>endRow+1||o.c+o.cs>endColumn+1))throw new Error('Select the complete merged cells before merging.');
  within.sort((a,b)=>a.r-b.r||a.c-b.c);const first=within[0];for(const o of within.slice(1))for(const n of [...o.cell.children])if(n.localName!=='tcPr')first.cell.append(n);first.r=r;first.c=c;first.rs=endRow-r+1;first.cs=endColumn-c+1;owners=owners.filter(o=>!within.includes(o)||o===first);
 }else if(command.action==='split'){
  for(let y=selected.r;y<selected.r+selected.rs;y++)for(let x=selected.c;x<selected.c+selected.cs;x++)if(y!==selected.r||x!==selected.c)owners.push({r:y,c:x,rs:1,cs:1,cell:blank(doc)});const o=owners.find(o=>o.cell===selected.cell);o.rs=o.cs=1;
 }else throw new Error('Unknown table action.');
 let gridNode=kid(table,'tblGrid');if(!gridNode){gridNode=make(doc,'tblGrid');table.insertBefore(gridNode,kids(table,'tr')[0]||null);}gridNode.replaceChildren(...grid);
 for(const row of kids(table,'tr'))row.remove();
 rows.forEach((row,y)=>{for(const cell of kids(row,'tc'))cell.remove();for(const o of owners.filter(o=>o.r<=y&&o.r+o.rs>y).sort((a,b)=>a.c-b.c)){const cell=y===o.r?o.cell:blank(doc);if(y!==o.r){const pr=kid(o.cell,'tcPr');if(pr)cell.prepend(pr.cloneNode(true));}properties(doc,cell,o.cs,o.rs>1?(y===o.r?'restart':'continue'):null);if(cell.lastElementChild?.localName!=='p')cell.append(make(doc,'p'));row.append(cell);}table.append(row);});
 tableGrid(table); // Validate the resulting merge graph before serializing.
}
