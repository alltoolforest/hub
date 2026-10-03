import { CONFIDENCE_LEVEL, PROVENANCE_KIND } from './contracts.js';
import {
  INGESTION_ERROR,
  ResumeIngestionError,
  mapParserError
} from './ingestion.js';

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function textFromMarkup(value) {
  return clean(decodeEntities(String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ')));
}

function parseTable(tableHtml) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(tableHtml))) {
    const cells = [];
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      const value = textFromMarkup(cellMatch[1]);
      if (value) cells.push(value);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export function extractDocxBlocksFromHtml(html) {
  const source = String(html ?? '');
  const blocks = [];
  const pattern = /<(h[1-6]|p|li|table)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = pattern.exec(source))) {
    const tag = match[1].toLowerCase();

    if (tag === 'table') {
      const rows = parseTable(match[0]);
      if (rows.length) {
        blocks.push(Object.freeze({
          type: 'table',
          level: null,
          text: rows.map((row) => row.join(' | ')).join('\n'),
          rows: Object.freeze(rows.map((row) => Object.freeze([...row])))
        }));
      }
      continue;
    }

    const text = textFromMarkup(match[2]);
    if (!text) continue;
    const heading = /^h[1-6]$/.test(tag);

    blocks.push(Object.freeze({
      type: heading ? 'heading' : tag === 'li' ? 'list_item' : 'paragraph',
      level: heading ? Number(tag.slice(1)) : null,
      text,
      rows: Object.freeze([])
    }));
  }

  return Object.freeze(blocks);
}

function sectionsFromBlocks(blocks) {
  const sections = [];
  let current = null;

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (current) sections.push(Object.freeze(current));
      current = {
        heading: block.text,
        level: block.level,
        text: ''
      };
      continue;
    }

    if (current) {
      current.text = [current.text, block.text].filter(Boolean).join('\n');
    }
  }

  if (current) sections.push(Object.freeze(current));
  return Object.freeze(sections);
}

export async function parseDocxArrayBuffer(arrayBuffer, mammoth) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
    throw new ResumeIngestionError(INGESTION_ERROR.EMPTY_FILE, 'The selected DOCX resume is empty.');
  }
  if (!mammoth?.convertToHtml) {
    throw new ResumeIngestionError(INGESTION_ERROR.PARSER_UNAVAILABLE, 'The local DOCX parser is unavailable.');
  }

  try {
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      { convertImage: mammoth.images?.imgElement ? mammoth.images.imgElement(() => Promise.resolve({ src: '' })) : undefined }
    );

    const html = String(result?.value ?? '');
    const blocks = extractDocxBlocksFromHtml(html);
    const extractedText = blocks.map((block) => block.text).filter(Boolean).join('\n').trim();
    const parsedSections = sectionsFromBlocks(blocks);
    const warnings = [];

    if (/<img\b/i.test(html)) {
      warnings.push('Embedded images are not used as resume text. Review the extracted text if important information is stored inside an image.');
    }

    for (const message of result?.messages || []) {
      const text = clean(message?.message);
      if (text) warnings.push('DOCX parser: ' + text);
    }

    if (!extractedText) {
      throw new ResumeIngestionError(
        INGESTION_ERROR.EMPTY_TEXT,
        'No readable resume text could be extracted from this DOCX file. Try another copy or paste the resume text.'
      );
    }

    return Object.freeze({
      extractedText,
      parsedSections,
      blocks,
      parsing: Object.freeze({
        pageCount: null,
        textDensity: extractedText.replace(/\s/g, '').length,
        suspiciouslyEmpty: extractedText.replace(/\s/g, '').length < 50,
        probableImageOnly: false,
        readingOrderRisk: 'not_assessed',
        warnings: Object.freeze([...new Set(warnings)]),
        confidence: CONFIDENCE_LEVEL.MEDIUM,
        provenance: PROVENANCE_KIND.PARSED,
        limitation: 'DOCX text is reconstructed in logical document order; complex floating layouts, headers, footers, and text inside images may not be fully represented.'
      })
    });
  } catch (error) {
    throw mapParserError(error, 'docx');
  }
}
