const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML = 'http://www.w3.org/XML/1998/namespace';

function paragraphs(xml) { return [...xml.getElementsByTagNameNS(W, 'p')]; }
function plainText(paragraph) {
  return [...paragraph.getElementsByTagNameNS(W, 't')].map(node => node.textContent).join('');
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
  return {zip, xml, original, text:[...original]};
}

export function updateDocxText(model, index, value) {
  if (!Number.isInteger(index) || index < 0 || index >= model.text.length) throw new Error('Invalid paragraph.');
  model.text[index] = String(value);
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
    const nodes = [...all[i].getElementsByTagNameNS(W, 't')];
    let first = nodes[0];
    if (!first) {
      const run = xml.createElementNS(W, 'w:r');
      first = xml.createElementNS(W, 'w:t');
      run.append(first);
      all[i].append(run);
    }
    // Retain all original objects, relationships, paragraph settings and run
    // properties. A changed paragraph uses its first run's character style.
    first.textContent = model.text[i];
    first.setAttributeNS(XML, 'xml:space', 'preserve');
    for (const node of nodes.slice(1)) node.textContent = '';
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
