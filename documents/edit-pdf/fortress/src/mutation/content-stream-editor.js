export function rewriteByteRanges(bytes,edits){
  const sorted=[...edits].sort((a,b)=>a.start-b.start); const parts=[]; let cursor=0;
  for(const e of sorted){
    if(e.start<cursor) throw new Error('OVERLAPPING_EDITS');
    if(e.start<0||e.end>bytes.length||e.end<e.start) throw new Error('INVALID_EDIT_RANGE');
    parts.push(bytes.slice(cursor,e.start)); parts.push(new TextEncoder().encode(e.replacement)); cursor=e.end;
  }
  parts.push(bytes.slice(cursor)); const total=parts.reduce((n,p)=>n+p.length,0); const out=new Uint8Array(total); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out;
}
