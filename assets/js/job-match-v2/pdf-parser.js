import { CONFIDENCE_LEVEL, PROVENANCE_KIND } from './contracts.js';
import {
  INGESTION_ERROR,
  ResumeIngestionError,
  mapParserError
} from './ingestion.js';

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}

function groupPageLines(items) {
  const lines = [];
  let current = [];
  let currentY = null;

  for (const item of items || []) {
    const text = clean(item?.str);
    if (!text) continue;

    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4]);
    const y = Number(transform[5]);
    const safeX = Number.isFinite(x) ? x : null;
    const safeY = Number.isFinite(y) ? y : null;

    if (current.length && (
      item.hasEOL ||
      (safeY !== null && currentY !== null && Math.abs(safeY - currentY) > 3)
    )) {
      lines.push(current);
      current = [];
      currentY = null;
    }

    if (currentY === null && safeY !== null) currentY = safeY;
    current.push({ text, x: safeX, y: safeY });

    if (item.hasEOL) {
      lines.push(current);
      current = [];
      currentY = null;
    }
  }

  if (current.length) lines.push(current);
  return lines;
}

function lineText(line) {
  return line
    .slice()
    .sort((a, b) => {
      if (a.x === null || b.x === null) return 0;
      return a.x - b.x;
    })
    .map((item) => item.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectReadingOrderRisk(lines) {
  const yValues = lines
    .map((line) => line.find((item) => Number.isFinite(item.y))?.y)
    .filter(Number.isFinite);

  if (yValues.length < 8) return { risk: 'none_detected', backwardJumps: 0, samples: yValues.length };

  let backwardJumps = 0;
  for (let i = 1; i < yValues.length; i += 1) {
    if (yValues[i] > yValues[i - 1] + 8) backwardJumps += 1;
  }

  const ratio = backwardJumps / Math.max(1, yValues.length - 1);
  return {
    risk: ratio >= 0.18 ? 'possible' : 'none_detected',
    backwardJumps,
    samples: yValues.length
  };
}

export async function parsePdfArrayBuffer(arrayBuffer, pdfjs) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
    throw new ResumeIngestionError(INGESTION_ERROR.EMPTY_FILE, 'The selected PDF resume is empty.');
  }
  if (!pdfjs?.getDocument) {
    throw new ResumeIngestionError(INGESTION_ERROR.PARSER_UNAVAILABLE, 'The local PDF parser is unavailable.');
  }

  let loadingTask;
  let documentProxy;

  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer).slice(),
      isEvalSupported: false
    });
    documentProxy = await loadingTask.promise;

    const pages = [];
    const textParts = [];
    let totalCharacters = 0;
    let pagesWithVeryLittleText = 0;
    let possibleReadingOrderPages = 0;

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const lines = groupPageLines(content.items);
        const textLines = lines.map(lineText).filter(Boolean);
        const pageText = textLines.join('\n').trim();
        const characterCount = pageText.replace(/\s/g, '').length;
        const readingOrder = detectReadingOrderRisk(lines);

        if (characterCount < 30) pagesWithVeryLittleText += 1;
        if (readingOrder.risk === 'possible') possibleReadingOrderPages += 1;

        totalCharacters += characterCount;
        if (pageText) textParts.push(pageText);

        pages.push(Object.freeze({
          pageNumber,
          text: pageText,
          characterCount,
          lineCount: textLines.length,
          readingOrderRisk: readingOrder.risk,
          readingOrderDiagnostics: Object.freeze({
            backwardJumps: readingOrder.backwardJumps,
            samples: readingOrder.samples
          })
        }));
      } finally {
        page.cleanup?.();
      }
    }

    const extractedText = textParts.join('\n\n').trim();
    const pageCount = documentProxy.numPages;
    const textDensity = pageCount ? totalCharacters / pageCount : 0;
    const sparsePageRatio = pageCount ? pagesWithVeryLittleText / pageCount : 1;
    const suspiciouslyEmpty = totalCharacters < Math.max(50, pageCount * 20);
    const probableImageOnly = suspiciouslyEmpty && sparsePageRatio >= 0.8;
    const warnings = [];

    if (possibleReadingOrderPages > 0) {
      warnings.push('Some pages show a possible reading-order risk. Review the extracted text because multi-column or complex layouts may not follow the visual order.');
    }
    if (probableImageOnly) {
      warnings.push('Very little selectable text was extracted. This PDF may be scanned or image-only and may require OCR before text-based analysis.');
    } else if (suspiciouslyEmpty) {
      warnings.push('Only a small amount of text was extracted. Review the extracted text before relying on the analysis.');
    }

    if (!extractedText && pageCount > 0) {
      throw new ResumeIngestionError(
        INGESTION_ERROR.IMAGE_ONLY_OR_UNREADABLE,
        'No selectable resume text could be extracted from this PDF. It may be scanned or image-only.',
        { pageCount }
      );
    }

    return Object.freeze({
      extractedText,
      parsedSections: Object.freeze([]),
      pages: Object.freeze(pages),
      parsing: Object.freeze({
        pageCount,
        textDensity,
        suspiciouslyEmpty,
        probableImageOnly,
        readingOrderRisk: possibleReadingOrderPages > 0 ? 'possible' : 'none_detected',
        warnings: Object.freeze(warnings),
        confidence: probableImageOnly ? CONFIDENCE_LEVEL.LOW : CONFIDENCE_LEVEL.MEDIUM,
        provenance: PROVENANCE_KIND.PARSED,
        limitation: 'Successful PDF text extraction does not guarantee identical parsing by every employer ATS.'
      })
    });
  } catch (error) {
    throw mapParserError(error, 'pdf');
  } finally {
    try {
      await documentProxy?.destroy?.();
    } catch {}
    try {
      await loadingTask?.destroy?.();
    } catch {}
  }
}
