import { sanitizeDisplayFilename, sanitizeUserText } from './input-safety.js';
import { PROVENANCE_KIND, RESUME_SOURCE_KIND } from './contracts.js';

export const RESUME_FILE_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_RESUME_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PASTED_TEXT_CHARS = 250000;
export const MAX_JOB_DESCRIPTION_CHARS = 150000;
export const MAX_EXTRACTED_RESUME_CHARS = 500000;
export const MAX_PDF_PAGES = 100;
export const MAX_DOCX_HTML_CHARS = 2000000;

export const INGESTION_ERROR = Object.freeze({
  NO_INPUT: 'no_input',
  UNSUPPORTED_FORMAT: 'unsupported_format',
  FILE_TOO_LARGE: 'file_too_large',
  EMPTY_FILE: 'empty_file',
  EMPTY_TEXT: 'empty_text',
  TEXT_TOO_LARGE: 'text_too_large',
  PASSWORD_PROTECTED: 'password_protected',
  CORRUPT_FILE: 'corrupt_file',
  IMAGE_ONLY_OR_UNREADABLE: 'image_only_or_unreadable',
  MEMORY_LIMIT: 'memory_limit',
  PARSER_UNAVAILABLE: 'parser_unavailable',
  PARSE_FAILED: 'parse_failed'
});

export class ResumeIngestionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ResumeIngestionError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function clean(value) {
  return sanitizeUserText(value);
}

function utf8ByteLength(value) {
  const text = String(value ?? '');
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
  return unescape(encodeURIComponent(text)).length;
}

function extensionOf(name) {
  const value = clean(name).toLowerCase();
  const index = value.lastIndexOf('.');
  return index >= 0 ? value.slice(index + 1) : '';
}

export function classifyResumeFile(file) {
  if (!file) {
    throw new ResumeIngestionError(INGESTION_ERROR.NO_INPUT, 'Choose a PDF or DOCX resume.');
  }

  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new ResumeIngestionError(INGESTION_ERROR.EMPTY_FILE, 'The selected resume file is empty.');
  }
  if (size > MAX_RESUME_FILE_BYTES) {
    throw new ResumeIngestionError(
      INGESTION_ERROR.FILE_TOO_LARGE,
      'Choose a resume file smaller than 25 MB for reliable in-browser processing.',
      { sizeBytes: size, maxBytes: MAX_RESUME_FILE_BYTES }
    );
  }

  const ext = extensionOf(file.name);
  const mime = clean(file.type).toLowerCase();
  const isPdf = ext === 'pdf' || mime === 'application/pdf';
  const isDocx = ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (!isPdf && !isDocx) {
    throw new ResumeIngestionError(
      INGESTION_ERROR.UNSUPPORTED_FORMAT,
      'Unsupported resume format. Choose PDF or DOCX, or paste the resume text.'
    );
  }

  const kind = isPdf ? RESUME_SOURCE_KIND.PDF : RESUME_SOURCE_KIND.DOCX;
  return Object.freeze({
    kind,
    name: sanitizeDisplayFilename(file.name),
    mediaType: mime || (isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    sizeBytes: size,
    provenance: PROVENANCE_KIND.USER_INPUT
  });
}

export function ingestPastedResumeText(value) {
  const text = clean(value);
  if (!text) {
    throw new ResumeIngestionError(INGESTION_ERROR.EMPTY_TEXT, 'Paste resume text before analyzing it.');
  }
  if (text.length > MAX_PASTED_TEXT_CHARS) {
    throw new ResumeIngestionError(
      INGESTION_ERROR.TEXT_TOO_LARGE,
      'The pasted resume is too large for this browser workflow. Use a resume under 250,000 characters.',
      { length: text.length, maxLength: MAX_PASTED_TEXT_CHARS }
    );
  }

  return Object.freeze({
    source: Object.freeze({
      kind: RESUME_SOURCE_KIND.TEXT,
      name: 'Pasted resume text',
      mediaType: 'text/plain',
      sizeBytes: utf8ByteLength(text),
      provenance: PROVENANCE_KIND.USER_INPUT
    }),
    extractedText: text,
    parsedSections: [],
    parsing: Object.freeze({
      pageCount: null,
      textDensity: null,
      suspiciouslyEmpty: false,
      probableImageOnly: false,
      readingOrderRisk: 'not_applicable',
      warnings: Object.freeze([]),
      provenance: PROVENANCE_KIND.USER_INPUT
    })
  });
}

export function ingestJobDescriptionText(value) {
  const text = clean(value);
  if (!text) {
    throw new ResumeIngestionError(INGESTION_ERROR.EMPTY_TEXT, 'Paste a job description before analyzing it.');
  }
  if (text.length > MAX_JOB_DESCRIPTION_CHARS) {
    throw new ResumeIngestionError(
      INGESTION_ERROR.TEXT_TOO_LARGE,
      'The job description is too large for this browser workflow.',
      { length: text.length, maxLength: MAX_JOB_DESCRIPTION_CHARS }
    );
  }
  return Object.freeze({ rawText: text, provenance: PROVENANCE_KIND.USER_INPUT });
}

export function mapParserError(error, kind = '') {
  if (error instanceof ResumeIngestionError) return error;

  const name = clean(error?.name).toLowerCase();
  const message = clean(error?.message);
  const lower = message.toLowerCase();

  if (name.includes('password') || /password|encrypted/.test(lower)) {
    return new ResumeIngestionError(
      INGESTION_ERROR.PASSWORD_PROTECTED,
      'This resume is password-protected. Unlock it in a trusted application, save an unlocked copy, and try again.'
    );
  }

  if (/invalid pdf|pdf header|corrupt|central directory|zip|end of central/.test(lower)) {
    return new ResumeIngestionError(
      INGESTION_ERROR.CORRUPT_FILE,
      'This resume appears to be corrupted or incomplete. Open and resave the original file, then try again.',
      { kind }
    );
  }

  if (error instanceof RangeError || /out of memory|allocation failed|memory/.test(lower)) {
    return new ResumeIngestionError(
      INGESTION_ERROR.MEMORY_LIMIT,
      'This resume could not be processed within the browser memory available on this device. Try a smaller file or pasted text.',
      { kind }
    );
  }

  return new ResumeIngestionError(
    INGESTION_ERROR.PARSE_FAILED,
    'The resume could not be parsed in this browser. Try another copy of the file or paste the resume text.',
    { kind, cause: message }
  );
}
