// CSV Viewer & Cleaner Task 2. Operates on copies; source data is never mutated.
export const cloneRows=rows=>rows.map(row=>row.slice());
export function transformRows(rows,kind,{header=false}={}){
 const next=cloneRows(rows),start=header?1:0;
 let changed=0,removed=0;
 if(kind==='trim'){
   for(let i=start;i<next.length;i++)for(let j=0;j<next[i].length;j++){
     const v=next[i][j];if(typeof v==='string'&&v!==v.trim()){next[i][j]=v.trim();changed++;}
   }
 }else if(kind==='blank'){
   for(let i=next.length-1;i>=start;i--)if(next[i].every(v=>String(v??'').trim()==='')){next.splice(i,1);removed++;}
 }else if(kind==='duplicates'){
   const seen=new Set();
   for(let i=start;i<next.length;){
     const key=JSON.stringify(next[i]);
     if(seen.has(key)){next.splice(i,1);removed++;}else{seen.add(key);i++;}
   }
 }else throw Error('Unknown CSV cleanup operation.');
 return {rows:next,changed,removed,description:kind==='trim'?changed+' cells will be trimmed':removed+' rows will be removed'};
}
export function formulaRisk(value){
 if(typeof value!=='string')return false;
 const t=value.trimStart();
 if(!t)return false;
 // Signed decimal literals are data, not spreadsheet expressions.
 if(/^[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(t))return false;
 // Preserve recognizable international numbers with spacing/grouping.
 // Do not whitelist arithmetic chains such as +1-2-3-4 or +1234567-8.
 if(t.startsWith('+') && /^[+\\d\\s().-]+$/.test(t)){
   const digits=t.replace(/\\D/g,'');
   const groups=t.match(/\\d+/g)||[];
   if(digits.length>=7 && digits.length<=15 &&
      groups.some(g=>g.length>=4) && /[\\s()]/.test(t) &&
      !/[\\t\\r\\n]/.test(t))return false;
 }
 return ['=','+','-','@'].some(prefix=>t.startsWith(prefix)) ||
   /^[\\t\\r\\n]/.test(value);
}
// CSV cannot represent a spreadsheet-safe formula literal without changing its underlying
// value. Refuse unsafe CSV exports rather than corrupting legitimate source values.
export function csvExportCheck(rows){
 const risky=[];
 rows.forEach((row,i)=>row.forEach((value,j)=>{if(formulaRisk(value))risky.push([i+1,j+1]);}));
 return risky;
}
export function escapeForXlsx(value){
 if(typeof value!=='string')return value;
 // Store as a typed string cell, never a formula. ExcelJS addRow(string) uses string cell type.
 return value;
}
export class CsvHistory {
 constructor(limit=20){this.limit=limit;this.undoStack=[];this.redoStack=[];}
 record(rows){this.undoStack.push(cloneRows(rows));if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];}
 undo(current){if(!this.undoStack.length)return null;this.redoStack.push(cloneRows(current));return this.undoStack.pop();}
 redo(current){if(!this.redoStack.length)return null;this.undoStack.push(cloneRows(current));return this.redoStack.pop();}
 reset(){this.undoStack=[];this.redoStack=[];}
}
