import { bytesKey, hexToBytes } from '../utils/bytes.js';

function utf16beToString(bytes) {
  if (bytes.length % 2) return null;
  const units=[];
  for(let i=0;i<bytes.length;i+=2) units.push((bytes[i]<<8)|bytes[i+1]);
  try { return String.fromCharCode(...units); } catch { return null; }
}
function hexTokenToBytes(token) {
  const m=token.match(/^<([0-9A-Fa-f\s]+)>$/); return m ? hexToBytes(m[1]) : null;
}
function lexCMap(src) {
  return src.match(/<[^>]*>|\[|\]|\/?[A-Za-z0-9_.+-]+/g) || [];
}
function incrementBytes(bytes, delta) {
  const out=new Uint8Array(bytes); let carry=delta;
  for(let i=out.length-1;i>=0 && carry>0;i--){ const sum=out[i]+(carry&0xff); out[i]=sum&0xff; carry=(carry>>>8)+(sum>>>8); }
  return out;
}

export function parseToUnicodeCMap(input) {
  const src = typeof input==='string' ? input : new TextDecoder('latin1').decode(input);
  if (/\/UseCMap\b|\busecmap\b/i.test(src)) return { supported:false, reason:'USECMAP_INHERITANCE_UNSUPPORTED', codeSpaces:[], forward:new Map(), reverse:new Map() };
  const tokens=lexCMap(src); const forward=new Map(); const codeSpaces=[]; let i=0;
  const readCountBefore=(idx)=> Number.parseInt(tokens[idx-1]||'',10);
  while(i<tokens.length){
    const t=tokens[i];
    if(t==='begincodespacerange'){
      const n=readCountBefore(i); i++;
      for(let k=0;k<n && i+1<tokens.length;k++){ const a=hexTokenToBytes(tokens[i++]); const b=hexTokenToBytes(tokens[i++]); if(a&&b) codeSpaces.push({start:a,end:b,length:a.length}); }
      continue;
    }
    if(t==='beginbfchar'){
      const n=readCountBefore(i); i++;
      for(let k=0;k<n && i+1<tokens.length;k++){ const s=hexTokenToBytes(tokens[i++]); const d=hexTokenToBytes(tokens[i++]); if(s&&d){ const u=utf16beToString(d); if(u!=null) forward.set(bytesKey(s),u); } }
      continue;
    }
    if(t==='beginbfrange'){
      const n=readCountBefore(i); i++;
      for(let k=0;k<n && i+2<tokens.length;k++){
        const start=hexTokenToBytes(tokens[i++]); const end=hexTokenToBytes(tokens[i++]); const dest=tokens[i++];
        if(!start||!end) continue;
        const startNum=bytesToInt(start), endNum=bytesToInt(end); const count=endNum-startNum+1;
        if(count<0 || count>65536) continue;
        if(dest==='['){
          for(let j=0;j<count && i<tokens.length;j++){ const dt=tokens[i++]; if(dt===']') break; const db=hexTokenToBytes(dt); if(db){ const u=utf16beToString(db); if(u!=null) forward.set(bytesKey(intToBytes(startNum+j,start.length)),u); } }
          while(i<tokens.length && tokens[i]!==']') i++; if(tokens[i]===']') i++;
        } else {
          const base=hexTokenToBytes(dest);
          if(base){ for(let j=0;j<count;j++){ const db=incrementBytes(base,j); const u=utf16beToString(db); if(u!=null) forward.set(bytesKey(intToBytes(startNum+j,start.length)),u); } }
        }
      }
      continue;
    }
    i++;
  }
  const reverse=new Map(); const ambiguous=new Set();
  for(const [k,u] of forward){ if(reverse.has(u) && reverse.get(u)!==k) ambiguous.add(u); else reverse.set(u,k); }
  for(const u of ambiguous) reverse.delete(u);
  const lengths=[...new Set([...forward.keys()].map((k)=>k.length/2).concat(codeSpaces.map((c)=>c.length)))].sort((a,b)=>b-a);
  const decodeCode=(bytes)=>forward.get(bytesKey(bytes)) ?? null;
  const encodeUnicode=(u)=>{ const key=reverse.get(u); return key ? hexToBytes(key) : null; };
  return { supported:true, reason:null, codeSpaces, forward, reverse, ambiguous, codeLengths:lengths, decodeCode, encodeUnicode };
}

function bytesToInt(bytes){ let n=0; for(const b of bytes) n=n*256+b; return n; }
function intToBytes(n,len){ const out=new Uint8Array(len); for(let i=len-1;i>=0;i--){ out[i]=n&255; n=Math.floor(n/256); } return out; }

export function decodeCompositeString(bytes, cmap) {
  if(!cmap?.supported) return { success:false, text:'', reason:cmap?.reason||'NO_TOUNICODE' };
  let out=''; let i=0;
  while(i<bytes.length){
    let matched=false;
    for(const len of cmap.codeLengths){ if(i+len>bytes.length) continue; const chunk=bytes.slice(i,i+len); const u=cmap.decodeCode(chunk); if(u!=null){ out+=u; i+=len; matched=true; break; } }
    if(!matched) return { success:false, text:out, reason:'UNMAPPED_COMPOSITE_CODE', byteOffset:i };
  }
  return { success:true, text:out };
}

export function encodeCompositeString(text, cmap) {
  if(!cmap?.supported) return { success:false, bytes:new Uint8Array(), unsupportedCharacters:Array.from(text), reason:cmap?.reason||'NO_TOUNICODE' };
  const parts=[]; const unsupported=[];
  for(const ch of Array.from(text)){ const b=cmap.encodeUnicode(ch); if(!b) unsupported.push(ch); else parts.push(b); }
  if(unsupported.length) return { success:false, bytes:new Uint8Array(), unsupportedCharacters:unsupported, reason:'CID_MAPPING_NOT_REVERSIBLE' };
  const total=parts.reduce((n,p)=>n+p.length,0); const out=new Uint8Array(total); let o=0; for(const p of parts){out.set(p,o);o+=p.length;}
  return { success:true, bytes:out, unsupportedCharacters:[] };
}
