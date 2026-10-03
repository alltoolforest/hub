const DANGEROUS_FORMAT_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH_NON_JOINING = /[\u200B\u2060\uFEFF]/g;

export function sanitizeUserText(value, { preserveNewlines = true } = {}) {
  let text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(DANGEROUS_FORMAT_CONTROLS, '')
    .replace(ZERO_WIDTH_NON_JOINING, '');

  if (!preserveNewlines) {
    text = text.replace(/\s+/g, ' ');
  }

  return text.trim();
}

export function sanitizeDisplayFilename(value, maxLength = 255) {
  const clean = sanitizeUserText(value, { preserveNewlines: false })
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim();

  if (!clean) return 'resume';
  if (clean.length <= maxLength) return clean;

  const dot = clean.lastIndexOf('.');
  if (dot > 0 && dot >= clean.length - 10) {
    const ext = clean.slice(dot);
    return clean.slice(0, Math.max(1, maxLength - ext.length)) + ext;
  }
  return clean.slice(0, maxLength);
}

export function containsSuspiciousFormulaPrefix(value) {
  return /^[\s\uFEFF]*[=+\-@]/.test(String(value ?? ''));
}

export const INPUT_SAFETY = Object.freeze({
  stripsControlCharacters: true,
  stripsBidiOverridesAndIsolates: true,
  stripsZeroWidthSpaceWordJoinerBom: true,
  preservesNormalUnicodeLetters: true,
  evaluatesFormulaLikeContent: false
});
