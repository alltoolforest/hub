const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML = 'http://www.w3.org/XML/1998/namespace';

function paragraphs(xml) { return [...xml.getElementsByTagNameNS(W, 'p')]; }
function textRuns(paragraph) { return [...paragraph.getElementsByTagNameNS(W, 't')].map(node => node.textContent); }
function protectedParagraph(paragraph) {
  return ['drawing','pict','fldChar','instrText','br','tab','cr','sdt','del','ins','footnoteReference','endnoteReference','sym'].some(tag =>
    paragraph.getElementsByTagNameNS(W, tag).length > 0) || paragraphs(paragraph).length > 0;
}

// Apply a single text replacement while keeping unchanged text in its original
// run (and therefore its font, emphasis, hyperlink and other run properties).
export function replaceRunText(runs, next) {
  const old = runs.join('');
  let start = 0, end = old.length, nextEnd = next.length;
  while (start < old.length && start < next.length && old[start] === next[start]) start++;
  while (end > start && nextEnd > start && old[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
  if (old === next) return [...runs];
  return replaceRunRange(runs, start, end, next.slice(start, nextEnd));
}
export function replaceRunRange(runs, start, end, replacement) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > runs.join('').length)
    throw new Error('Invalid replacement range.');
  if (!runs.length) return [replacement];
  let offset = 0, inserted = false;
  const result = runs.map(text => {
    const from = offset, to = offset + text.length; offset = to;
    const prefix = text.slice(0, Math.max(0, Math.min(text.length, start - from)));
    const suffix = text.slice(Math.max(0, Math.min(text.length, end - from)));
    let middle = '';
    if (!inserted && start >= from && (start < to || start === to && end === start)) { middle = replacement; inserted = true; }
    return prefix + middle + suffix;
  });
  if (!inserted) result[result.length - 1] += replacement;
  return result;
}
function plainText(paragraph) {
  return [...paragraph.getElementsByTagNameNS(W, '*')].map(node =>
    node.localName === 't' ? node.textContent : node.localName === 'tab' ? '\t' :
      ['br','cr'].includes(node.localName) ? '\n' : '').join('');
}
function parse(xmlText, Parser) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) throw new Error('The Word document contains unsupported XML declarations.');
  const xml = new Parser().parseFromString(xmlText, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length || xml.documentElement.localName !== 'document' ||
      xml.documentElement.namespaceURI !== W) throw new Error('The Word document XML is invalid.');
  return xml;
}
export async function readDocx(file, Zip, Parser) {
  const zip = await Zip.loadAsync(file);
  if (Object.keys(zip.files).length > 20000 || Object.keys(zip.files).some(name =>
    name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || /vbaProject\.bin$/i.test(name)))
    throw new Error('The Word package contains unsafe or unsupported parts.');
  const part = zip.file('word/document.xml');
  if (!part || !zip.file('[Content_Types].xml')) throw new Error('The Word package is incomplete.');
  const source = await part.async('string');
  if (source.length > 20_000_000) throw new Error('Document XML is too large to edit safely on this device.');
  const xml = parse(source, Parser);
  const original = paragraphs(xml).map(plainText);
  return {zip, xml, original, text:[...original], runs:paragraphs(xml).map(p => protectedParagraph(p) ? [plainText(p)] : textRuns(p)),
    protected:paragraphs(xml).map(protectedParagraph)};
}

export function updateDocxText(model, index, value) {
  if (!Number.isInteger(index) || index < 0 || index >= model.text.length) throw new Error('Invalid paragraph.');
  value = String(value);
  if (model.protected[index] && value !== model.text[index]) throw new Error('This paragraph contains protected document structures.');
  model.runs[index] = replaceRunText(model.runs[index], value);
  model.text[index] = value;
}

export function snapshotDocx(model) { return {text:[...model.text], runs:model.runs.map(runs => [...runs])}; }
export function restoreDocx(model, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.text) || !Array.isArray(snapshot.runs) || snapshot.text.length !== model.text.length || snapshot.runs.length !== model.text.length)
    throw new Error('Draft no longer matches this document.');
  snapshot.text.forEach((text, i) => {
    if (typeof text !== 'string' || !Array.isArray(snapshot.runs[i]) || snapshot.runs[i].some(run => typeof run !== 'string') || snapshot.runs[i].join('') !== text ||
        (model.protected[i] && text !== model.original[i])) throw new Error('The document draft is invalid.');
  });
  model.text = [...snapshot.text]; model.runs = snapshot.runs.map(runs => [...runs]);
}

export function documentBlocks(model) {
  const body = model.xml.getElementsByTagNameNS(W, 'body')[0];
  const all = paragraphs(model.xml);
  const indexes = new Map(all.map((paragraph, index) => [paragraph, index]));
  const item = paragraph => ({
    index:indexes.get(paragraph),
    pageBreak:paragraph.getElementsByTagNameNS(W, 'pageBreakBefore').length > 0 ||
      [...paragraph.getElementsByTagNameNS(W, 'br')].some(br => br.getAttributeNS(W, 'type') === 'page'),
    hasDrawing:paragraph.getElementsByTagNameNS(W, 'drawing').length > 0,
    protected:protectedParagraph(paragraph),
    style:paragraph.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') || ''
  });
  const blocks = [];
  for (const child of body?.children || []) {
    if (child.namespaceURI !== W) continue;
    if (child.localName === 'p') blocks.push({kind:'paragraph', paragraph:item(child)});
    if (child.localName === 'tbl') {
      const rows = [...child.children].filter(node => node.namespaceURI === W && node.localName === 'tr').map(row =>
        [...row.children].filter(node => node.namespaceURI === W && node.localName === 'tc').map(cell =>
          [...cell.getElementsByTagNameNS(W, 'p')].map(item)));
      blocks.push({kind:'table', rows});
    }
  }
  return blocks;
}

export async function writeDocx(model, Zip, Parser, Serializer) {
  const xml = parse(new Serializer().serializeToString(model.xml), Parser);
  const all = paragraphs(xml);
  if (all.length !== model.text.length) throw new Error('The document structure changed unexpectedly.');
  for (let i = 0; i < all.length; i++) {
    if (model.text[i] === model.original[i]) continue;
    if (model.protected[i]) throw new Error('Export would change a protected paragraph.');
    const nodes = [...all[i].getElementsByTagNameNS(W, 't')];
    let first = nodes[0];
    if (!first) {
      const run = xml.createElementNS(W, 'w:r');
      first = xml.createElementNS(W, 'w:t');
      run.append(first);
      all[i].append(run);
    }
    const targetNodes = nodes.length ? nodes : [first];
    if (targetNodes.length !== model.runs[i].length || model.runs[i].join('') !== model.text[i]) throw new Error('The paragraph run structure is invalid.');
    targetNodes.forEach((node, index) => {
      // Newlines and tabs require Word elements, not literal XML text.
      const pieces = model.runs[i][index].split(/([\n\t])/);
      node.textContent = pieces[0]; node.setAttributeNS(XML, 'xml:space', 'preserve');
      let anchor = node;
      for (const piece of pieces.slice(1)) {
        const extra = xml.createElementNS(W, piece === '\n' ? 'w:br' : piece === '\t' ? 'w:tab' : 'w:t');
        if (extra.localName === 't') { extra.textContent = piece; extra.setAttributeNS(XML, 'xml:space', 'preserve'); }
        anchor.parentNode.insertBefore(extra, anchor.nextSibling); anchor = extra;
      }
    });
  }
  const output = model.zip.clone();
  output.file('word/document.xml', new Serializer().serializeToString(xml));
  const blob = await output.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
  // Reopen the actual exported bytes before offering them for download.
  const reopened = await readDocx(blob, Zip, Parser);
  if (reopened.text.length !== model.text.length || reopened.text.some((text, i) => text !== model.text[i]) ||
      Object.keys(model.zip.files).some(name => !reopened.zip.files[name]))
    throw new Error('DOCX export validation failed. Your draft is retained.');
  return blob;
}

export function replaceDocxRange(model, index, start, end, replacement) {
  if (!Number.isInteger(index) || index < 0 || index >= model.text.length || model.protected[index])
    throw new Error('This paragraph cannot be replaced.');
  model.runs[index] = replaceRunRange(model.runs[index], start, end, replacement);
  model.text[index] = model.runs[index].join('');
}
