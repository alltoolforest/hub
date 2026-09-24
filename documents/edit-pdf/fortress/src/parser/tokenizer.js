import { hexToBytes } from '../utils/bytes.js';

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMS = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));
const isWs = (b) => WS.has(b);
const isDelim = (b) => DELIMS.has(b);
const isRegular = (b) => !isWs(b) && !isDelim(b);

export class PdfContentSyntaxError extends Error {}

function readLiteral(bytes, start, limits) {
  let i = start + 1;
  let depth = 1;
  const out = [];
  while (i < bytes.length && depth > 0) {
    if (out.length > limits.maxStringBytes) throw new PdfContentSyntaxError('String exceeds parser limit');
    const b = bytes[i];
    if (b === 0x5c) {
      const n = bytes[i + 1];
      if (n === undefined) throw new PdfContentSyntaxError('Dangling string escape');
      if (n === 0x0a) { i += 2; continue; }
      if (n === 0x0d) { i += bytes[i + 2] === 0x0a ? 3 : 2; continue; }
      const escaped = new Map([[0x6e,10],[0x72,13],[0x74,9],[0x62,8],[0x66,12],[0x28,40],[0x29,41],[0x5c,92]]);
      if (n >= 0x30 && n <= 0x37) {
        let oct = '';
        let j = i + 1;
        while (j < bytes.length && oct.length < 3 && bytes[j] >= 0x30 && bytes[j] <= 0x37) {
          oct += String.fromCharCode(bytes[j]); j++;
        }
        out.push(Number.parseInt(oct, 8) & 0xff);
        i = j; continue;
      }
      out.push(escaped.has(n) ? escaped.get(n) : n);
      i += 2; continue;
    }
    if (b === 0x28) { depth++; if (depth > limits.maxNesting) throw new PdfContentSyntaxError('String nesting exceeds limit'); out.push(b); i++; continue; }
    if (b === 0x29) { depth--; i++; if (depth > 0) out.push(b); continue; }
    out.push(b); i++;
  }
  if (depth !== 0) throw new PdfContentSyntaxError('Unterminated literal string');
  return { value: new Uint8Array(out), end: i, syntax: 'literal' };
}

function readHex(bytes, start, limits) {
  let i = start + 1;
  let hex = '';
  while (i < bytes.length && bytes[i] !== 0x3e) {
    if (!isWs(bytes[i])) hex += String.fromCharCode(bytes[i]);
    if (hex.length > limits.maxStringBytes * 2) throw new PdfContentSyntaxError('Hex string exceeds parser limit');
    i++;
  }
  if (i >= bytes.length) throw new PdfContentSyntaxError('Unterminated hex string');
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new PdfContentSyntaxError('Invalid hex string');
  return { value: hexToBytes(hex), end: i + 1, syntax: 'hex' };
}

function skipInlineImage(bytes, start) {
  let i = start;
  while (i + 2 < bytes.length) {
    if (isWs(bytes[i]) && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x49 && (i + 3 >= bytes.length || isWs(bytes[i + 3]) || isDelim(bytes[i + 3]))) {
      return i + 3;
    }
    i++;
  }
  return bytes.length;
}

export function tokenizeContentStream(bytes, options = {}) {
  const limits = {maxTokens: options.maxTokens ?? 200000,maxStringBytes: options.maxStringBytes ?? 8 * 1024 * 1024,maxNesting: options.maxNesting ?? 64};
  const tokens = []; let i = 0;
  const push = (t) => { tokens.push(t); if (tokens.length > limits.maxTokens) throw new PdfContentSyntaxError('Operator/token limit exceeded'); };
  while (i < bytes.length) {
    const b = bytes[i];
    if (isWs(b)) { i++; continue; }
    if (b === 0x25) { while (i < bytes.length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++; continue; }
    if (b === 0x28) { const r = readLiteral(bytes, i, limits); push({ type:'string', value:r.value, syntax:r.syntax, start:i, end:r.end }); i = r.end; continue; }
    if (b === 0x3c) {
      if (bytes[i + 1] === 0x3c) { push({ type:'dictStart', start:i, end:i+2 }); i += 2; continue; }
      const r = readHex(bytes, i, limits); push({ type:'string', value:r.value, syntax:r.syntax, start:i, end:r.end }); i = r.end; continue;
    }
    if (b === 0x3e && bytes[i + 1] === 0x3e) { push({ type:'dictEnd', start:i, end:i+2 }); i += 2; continue; }
    if (b === 0x5b) { push({ type:'arrayStart', start:i, end:i+1 }); i++; continue; }
    if (b === 0x5d) { push({ type:'arrayEnd', start:i, end:i+1 }); i++; continue; }
    if (b === 0x2f) {
      const start = i; let j = i + 1; let name = '';
      while (j < bytes.length && isRegular(bytes[j])) {
        if (bytes[j] === 0x23 && j + 2 < bytes.length) { const h = String.fromCharCode(bytes[j+1], bytes[j+2]); if (/^[0-9a-fA-F]{2}$/.test(h)) { name += String.fromCharCode(Number.parseInt(h,16)); j += 3; continue; } }
        name += String.fromCharCode(bytes[j]); j++;
      }
      push({ type:'name', value:name, start, end:j }); i = j; continue;
    }
    const start = i; let j = i; while (j < bytes.length && isRegular(bytes[j])) j++;
    if (j === start) { i++; continue; }
    const raw = new TextDecoder('latin1').decode(bytes.slice(start,j));
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) push({ type:'num', value:Number(raw), start, end:j });
    else if (raw === 'true' || raw === 'false') push({ type:'bool', value:raw === 'true', start, end:j });
    else if (raw === 'null') push({ type:'null', value:null, start, end:j });
    else if (raw === 'BI') { const end = skipInlineImage(bytes, j); push({ type:'opaque', value:'INLINE_IMAGE', start, end }); i = end; continue; }
    else push({ type:'op', value:raw, start, end:j });
    i = j;
  }
  return tokens;
}

export function groupOperators(tokens) {
  const out = []; let pending = []; let start = null;
  for (const token of tokens) {
    if (token.type === 'op' || token.type === 'opaque') { out.push({ op: token.type === 'opaque' ? token.value : token.value, args: pending, start: start ?? token.start, opStart: token.start, end: token.end }); pending = []; start = null; }
    else { if (start === null) start = token.start; pending.push(token); }
  }
  return out;
}

export function operandsToValues(args) {
  const result = []; let i = 0;
  while (i < args.length) {
    const t = args[i];
    if (t.type === 'arrayStart') {
      const arr = []; let depth = 1; i++;
      while (i < args.length && depth > 0) {
        const el = args[i];
        if (el.type === 'arrayStart') { depth++; arr.push({nestedArrayStart:true}); i++; continue; }
        if (el.type === 'arrayEnd') { depth--; i++; if (depth === 0) break; continue; }
        if (el.type === 'string') arr.push({ str: el.value, syntax: el.syntax, token: el }); else arr.push(el.value);
        i++;
      }
      result.push(arr); continue;
    }
    if (t.type === 'string') result.push({ str:t.value, syntax:t.syntax, token:t }); else result.push(t.value); i++;
  }
  return result;
}
