import {
  CONFIDENCE_LEVEL,
  PROVENANCE_KIND,
  RESUME_SOURCE_KIND,
  RUN_STATUS
} from './contracts.js';
import {
  INGESTION_ERROR,
  ResumeIngestionError,
  classifyResumeFile,
  ingestJobDescriptionText,
  ingestPastedResumeText,
  mapParserError
} from './ingestion.js';
import { loadLocalMammothEngine, loadLocalPdfEngine } from './parser-loader.js';
import { parsePdfArrayBuffer } from './pdf-parser.js';
import { parseDocxArrayBuffer } from './docx-parser.js';

function parserUnavailable(kind, error) {
  return new ResumeIngestionError(
    INGESTION_ERROR.PARSER_UNAVAILABLE,
    'The local ' + kind.toUpperCase() + ' parsing engine could not be loaded in this browser.',
    { cause: String(error?.message || error || '') }
  );
}

export async function parseResumeFile(file, options = {}) {
  const source = classifyResumeFile(file);
  let arrayBuffer;

  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (error) {
    throw mapParserError(error, source.kind);
  }

  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
    throw new ResumeIngestionError(INGESTION_ERROR.EMPTY_FILE, 'The selected resume file is empty.');
  }

  let parsed;

  if (source.kind === RESUME_SOURCE_KIND.PDF) {
    let pdfjs = options.pdfjs;
    if (!pdfjs) {
      try {
        pdfjs = await loadLocalPdfEngine();
      } catch (error) {
        throw parserUnavailable('pdf', error);
      }
    }
    parsed = await parsePdfArrayBuffer(arrayBuffer, pdfjs);
  } else if (source.kind === RESUME_SOURCE_KIND.DOCX) {
    let mammoth = options.mammoth;
    if (!mammoth) {
      try {
        mammoth = await loadLocalMammothEngine(options.documentRef);
      } catch (error) {
        throw parserUnavailable('docx', error);
      }
    }
    parsed = await parseDocxArrayBuffer(arrayBuffer, mammoth);
  } else {
    throw new ResumeIngestionError(INGESTION_ERROR.UNSUPPORTED_FORMAT, 'Unsupported resume format.');
  }

  return Object.freeze({
    source,
    extractedText: parsed.extractedText,
    parsedSections: parsed.parsedSections,
    pages: parsed.pages || Object.freeze([]),
    blocks: parsed.blocks || Object.freeze([]),
    parsing: parsed.parsing
  });
}

export function parsePastedResume(value) {
  return ingestPastedResumeText(value);
}

export function parsePastedJobDescription(value) {
  return ingestJobDescriptionText(value);
}

export function applyParsedResumeToState(state, parsed) {
  if (!state?.resume || !parsed?.source || !parsed?.parsing) {
    throw new TypeError('A canonical analysis state and parsed resume result are required.');
  }

  const next = typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));

  next.resume.source = { ...parsed.source };
  next.resume.extractedText = String(parsed.extractedText || '');
  next.resume.parsedSections = Array.isArray(parsed.parsedSections)
    ? parsed.parsedSections.map((section) => ({ ...section }))
    : [];
  next.resume.parsing = {
    ...next.resume.parsing,
    status: RUN_STATUS.COMPLETE,
    completedAt: '',
    errorCode: '',
    errorMessage: '',
    pageCount: parsed.parsing.pageCount ?? null,
    textDensity: parsed.parsing.textDensity ?? null,
    suspiciouslyEmpty: Boolean(parsed.parsing.suspiciouslyEmpty),
    probableImageOnly: Boolean(parsed.parsing.probableImageOnly),
    readingOrderRisk: parsed.parsing.readingOrderRisk || 'not_assessed',
    warnings: [...(parsed.parsing.warnings || [])],
    limitation: String(parsed.parsing.limitation || ''),
    confidence: parsed.parsing.confidence || CONFIDENCE_LEVEL.NONE,
    provenance: parsed.parsing.provenance || PROVENANCE_KIND.PARSED
  };
  next.confidence.resumeParsing = next.resume.parsing.confidence;
  next.provenance.resume = parsed.source.provenance || PROVENANCE_KIND.USER_INPUT;

  return next;
}

export function applyJobDescriptionToState(state, input) {
  if (!state?.jobDescription || !input?.rawText) {
    throw new TypeError('A canonical analysis state and pasted job description are required.');
  }

  const next = typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));

  next.jobDescription.rawText = String(input.rawText);
  next.jobDescription.requirements = [];
  next.provenance.jobDescription = input.provenance || PROVENANCE_KIND.USER_INPUT;

  // Requirement extraction belongs to Task 3 and intentionally remains untouched.
  next.confidence.jobRequirements = CONFIDENCE_LEVEL.NONE;
  return next;
}
