// CSV Viewer & Cleaner — Task 1 import-only helpers. No mutation of source bytes.
export const ENCODINGS = [
  ['auto','Auto-detect (UTF-8 preferred)'],['utf-8','UTF-8'],
  ['windows-1252','Western European (Windows-1252)'],
  ['windows-1251','Cyrillic (Windows-1251)'],
  ['iso-8859-1','Western European (ISO-8859-1)'],
  ['shift_jis','Japanese (Shift JIS)'],
  ['gb18030','Chinese (GB18030)'],
  ['big5','Traditional Chinese (Big5)'],
  ['euc-kr','Korean (EUC-KR)'],
  ['utf-16le','UTF-16 LE'],['utf-16be','UTF-16 BE']
];
export const DELIMITERS = [
  ['auto','Auto-detect'],[',','Comma (,)'],[';','Semicolon (;)'],
  ['\\t','Tab'],['|','Pipe (|)']
];
function declaredEncoding(bytes) {
  if(bytes.length>=3 && bytes[0]===0xef && bytes[1]===0xbb && bytes[2]===0xbf) return 'utf-8';
  if(bytes.length>=2 && bytes[0]===0xff && bytes[1]===0xfe) return 'utf-16le';
  if(bytes.length>=2 && bytes[0]===0xfe && bytes[1]===0xff) return 'utf-16be';
  return null;
}
export function decodeCsvBytes(bytes, selected='auto'){
  const bom=declaredEncoding(bytes);
  let encoding=selected==='auto'?(bom||'utf-8'):selected;
  let decoded;
  try { decoded=new TextDecoder(encoding,{fatal:true}).decode(bytes); }
  catch(e) {
    if(selected==='auto') throw Error('This file is not valid UTF-8. Select its original text encoding in Import options, then open it again.');
    throw Error('Unable to decode using '+encoding+'. Choose the correct encoding, then retry.');
  }
  if(decoded.charCodeAt(0)===0xfeff) decoded=decoded.slice(1);
  if(decoded.includes('\u0000')) throw Error('The decoded file contains NUL characters. Check the selected encoding or file type.');
  return {text:decoded,encoding,bom:bom||'none'};
}
export function inspectCsv(parser,text,{delimiter='auto',header=false,encoding='utf-8',bom='none'}={}){
  const opts={skipEmptyLines:false};
  if(delimiter!=='auto') opts.delimiter=delimiter==='\\t'?'\t':delimiter;
  const result=parser.parse(text,opts);
  const errors=result.errors||[];
  const quoteError=errors.find(e=>e.type==='Quotes');
  if(quoteError) throw Error('Malformed quoted CSV field at row '+(Number.isInteger(quoteError.row)?quoteError.row+1:'unknown')+'. Check the original file.');
  const rows=result.data||[];
  const width=rows.reduce((largest,r)=>Math.max(largest,r.length),0);
  const counts=new Map();
  for(const row of rows) counts.set(row.length,(counts.get(row.length)||0)+1);
  let expected=rows.length?rows[0].length:0;
  let maxCount=-1;
  for(const [len,count] of counts) if(count>maxCount){expected=len;maxCount=count;}
  const irregular=[];
  rows.forEach((r,i)=>{if(r.length!==expected) irregular.push(i+1);});
  const warnings=errors.map(e=>e.message||e.code||String(e));
  if(irregular.length) warnings.push(irregular.length+' row(s) have a different column count (first rows: '+irregular.slice(0,8).join(', ')+'). No cells were discarded.');
  if(!text.trim()) warnings.push('The CSV file is empty.');
  const actualDelimiter=result.meta?.delimiter|| (delimiter==='auto'?',':delimiter==='\\t'?'\t':delimiter);
  if(delimiter==='auto'&&errors.some(e=>e.code==='UndetectableDelimiter')) warnings.push('Delimiter could not be reliably detected. Choose a delimiter manually if columns appear merged.');
  const cols=width;
  return {rows:rows.length?rows:[['']],diagnostics:{
    rows:rows.length,columns:cols,delimiter:actualDelimiter,encoding,bom,
    linebreak:result.meta?.linebreak||'unknown',headerSelected:!!header,
    headerPreview:header&&rows.length?rows[0].slice():[],
    irregularRows:irregular.length,warnings:[...new Set(warnings)]}};
}
export async function importCsvFile(file,parser,options={}){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const decoded=decodeCsvBytes(bytes,options.encoding||'auto');
  return inspectCsv(parser,decoded.text,{...options,encoding:decoded.encoding,bom:decoded.bom});
}
export function formatImportSummary(d){
  const dl=d.delimiter==='\t'?'tab':d.delimiter===';'?'semicolon':d.delimiter==='|'?'pipe':d.delimiter===','?'comma':d.delimiter;
  const lb=d.linebreak==='\r\n'?'CRLF':d.linebreak==='\n'?'LF':d.linebreak==='\r'?'CR':d.linebreak;
  return 'Imported '+d.rows+' rows · '+d.columns+' columns · '+dl+' · '+d.encoding+' · '+lb+
    ' · Header: '+(d.headerSelected?'selected':'not selected')+
    (d.warnings.length?'\nWarnings:\n- '+d.warnings.join('\n- '):'\nNo import warnings.');
}