// The new editor's format gate. Keep this independent from the existing editor.js,
// which also serves the frozen CSV Cleaner.
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const extensions = new Map([
  ['doc', 'doc'], ['docx', 'docx'], ['pdf', 'pdf'],
  ['xls', 'xls'], ['xlsx', 'xlsx'], ['csv', 'csv'], ['txt', 'txt']
]);

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function extensionOf(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

function indexOf(bytes, signature) {
  outer: for (let i = 0; i <= bytes.length - signature.length; i++) {
    for (let j = 0; j < signature.length; j++) if (bytes[i + j] !== signature[j]) continue outer;
    return i;
  }
  return -1;
}

// Read ZIP directory names only. The ZIP payload must still be parsed and
// validated by the format engine before anything from it is displayed.
async function officePackage(file) {
  const tailSize = Math.min(file.size, 65557); // EOCD + maximum ZIP comment.
  const tail = new Uint8Array(await file.slice(file.size - tailSize).arrayBuffer());
  const eocd = [0x50, 0x4b, 0x05, 0x06];
  let offset = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (startsWith(tail.subarray(i), eocd) && i + 22 + (tail[i + 20] | tail[i + 21] << 8) === tail.length) {
      offset = i; break;
    }
  }
  if (offset < 0) throw new Error('The ZIP package is incomplete or damaged.');
  const view = new DataView(tail.buffer, tail.byteOffset + offset);
  const count = view.getUint16(10, true);
  const length = view.getUint32(12, true);
  const start = view.getUint32(16, true);
  if (view.getUint16(4, true) || view.getUint16(6, true) || count !== view.getUint16(8, true) ||
      count > 20000 || length > 8_000_000 || start + length > file.size ||
      count === 0xffff || length === 0xffffffff || start === 0xffffffff) {
    throw new Error('This ZIP package is unsupported or has an invalid directory.');
  }
  const directory = new Uint8Array(await file.slice(start, start + length).arrayBuffer());
  const names = new Set();
  let pos = 0;
  let expanded = 0;
  const decoder = new TextDecoder('utf-8', {fatal: true});
  for (let i = 0; i < count; i++) {
    if (pos + 46 > directory.length || !startsWith(directory.subarray(pos), [0x50, 0x4b, 0x01, 0x02]))
      throw new Error('The ZIP directory is damaged.');
    const entry = new DataView(directory.buffer, directory.byteOffset + pos);
    const flags = entry.getUint16(8, true);
    const method = entry.getUint16(10, true);
    const compressed = entry.getUint32(20, true);
    const uncompressed = entry.getUint32(24, true);
    const nameLength = entry.getUint16(28, true);
    const extraLength = entry.getUint16(30, true);
    const commentLength = entry.getUint16(32, true);
    const next = pos + 46 + nameLength + extraLength + commentLength;
    if (next > directory.length || flags & 1 || ![0, 8].includes(method) ||
        compressed === 0xffffffff || uncompressed === 0xffffffff ||
        uncompressed > 200_000_000 || (compressed && uncompressed > compressed * 200))
      throw new Error('The ZIP package contains an encrypted or unsupported entry.');
    expanded += uncompressed;
    if (expanded > 500_000_000) throw new Error('The Office package is too large to expand safely.');
    const name = decoder.decode(directory.subarray(pos + 46, pos + 46 + nameLength));
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || names.has(name))
      throw new Error('The ZIP package contains an unsafe or duplicate path.');
    names.add(name);
    pos = next;
  }
  if (pos !== directory.length || !names.has('[Content_Types].xml'))
    throw new Error('The Office package is incomplete.');
  if ([...names].some(name => /(^|\/)(vbaProject\.bin|macrosheets)(\/|$)/i.test(name)))
    throw new Error('Macro-enabled files are not supported. Macros are never executed.');
  if (names.has('word/document.xml')) return 'docx';
  if (names.has('xl/workbook.xml')) return 'xlsx';
  throw new Error('This ZIP package is not a supported Word or Excel document.');
}

export async function detectFile(file) {
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) )
    throw new Error('Choose a file.');
  const expected = extensions.get(extensionOf(file.name));
  if (!expected) throw new Error('Supported files: DOC, DOCX, PDF, XLS, XLSX, CSV and TXT.');
  if(!file.size&&expected!=='txt')throw new Error('Choose a nonempty file.');
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  let format;
  if (startsWith(head, ZIP)) format = await officePackage(file);
  else if (startsWith(head, CFB)) format = expected === 'doc' || expected === 'xls' ? expected : 'legacy-office';
  else if (indexOf(head.subarray(0, 1024), [0x25, 0x50, 0x44, 0x46, 0x2d]) >= 0) format = 'pdf';
  else {
    // Text formats have no reliable magic bytes. Reject binary and invalid UTF-8.
    if (head.includes(0)) throw new Error('This file contains binary data and is not text.');
    try { new TextDecoder('utf-8', {fatal: true}).decode(head, {stream: true}); }
    catch { throw new Error('This text file is not valid UTF-8.'); }
    format = expected === 'txt' || expected === 'csv' ? expected : 'unknown';
  }
  if (format !== expected) throw new Error(`The file content does not match its .${expected} extension.`);
  const engine = ['doc', 'docx', 'txt'].includes(format) ? 'document' :
    ['xls', 'xlsx', 'csv'].includes(format) ? 'spreadsheet' : 'pdf';
  return {format, engine, name:file.name, size:file.size};
}
