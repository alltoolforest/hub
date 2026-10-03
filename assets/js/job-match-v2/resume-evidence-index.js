import { identifyResumeSectionHeading } from './resume-structure-analyzer.js';
import { findConceptMentions, normalizeWordFamily } from './terminology-normalizer.js';

const MONTHS = Object.freeze({
  jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,
  jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,
  oct:10,october:10,nov:11,november:11,dec:12,december:12
});

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function escaped(value) {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

function phrasePattern(phrase) {
  const value = clean(phrase);
  return new RegExp('(^|[^A-Za-z0-9+#])(' + escaped(value) + ')(?=$|[^A-Za-z0-9+#])', 'i');
}

export function buildResumeEvidenceIndex(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  const sourceLines = raw.split('\n');
  const lines = [];
  let currentSection = 'header';

  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    const line = clean(sourceLines[lineIndex]);
    if (!line) continue;

    const heading = identifyResumeSectionHeading(line);
    if (heading) {
      currentSection = heading;
      lines.push(Object.freeze({
        lineIndex,
        text: line,
        section: heading,
        isHeading: true
      }));
      continue;
    }

    lines.push(Object.freeze({
      lineIndex,
      text: line,
      section: currentSection,
      isHeading: false
    }));
  }

  const sections = {};
  for (const line of lines) {
    if (!sections[line.section]) sections[line.section] = [];
    sections[line.section].push(line);
  }

  return Object.freeze({
    text: raw,
    lines: Object.freeze(lines),
    sections: Object.freeze(Object.fromEntries(
      Object.entries(sections).map(([name, items]) => [name, Object.freeze(items)])
    ))
  });
}

export function findExactPhraseEvidence(index, phrase, sections = null) {
  const value = clean(phrase);
  if (!value) return Object.freeze([]);

  const pattern = phrasePattern(value);
  const allowed = Array.isArray(sections) && sections.length ? new Set(sections) : null;
  const found = [];

  for (const line of index.lines || []) {
    if (allowed && !allowed.has(line.section)) continue;
    const match = line.text.match(pattern);
    if (!match) continue;
    found.push(Object.freeze({
      section: line.section,
      lineIndex: line.lineIndex,
      excerpt: line.text,
      matchedText: match[2],
      method: 'exact_phrase'
    }));
  }

  return Object.freeze(found);
}

export function findNormalizedConceptEvidence(index, conceptId, sections = null) {
  if (!conceptId) return Object.freeze([]);
  const allowed = Array.isArray(sections) && sections.length ? new Set(sections) : null;
  const found = [];

  for (const line of index.lines || []) {
    if (allowed && !allowed.has(line.section)) continue;
    const mentions = findConceptMentions(line.text, conceptId, index.text);
    for (const mention of mentions) {
      found.push(Object.freeze({
        section: line.section,
        lineIndex: line.lineIndex,
        excerpt: line.text,
        matchedText: mention.matchedText,
        canonical: mention.canonical,
        method: mention.method === 'canonical' ? 'normalized_canonical' : 'normalized_alias'
      }));
    }
  }

  return Object.freeze(found);
}

export function findWordFamilyEvidence(index, word, sections = null) {
  const canonical = normalizeWordFamily(word);
  if (!canonical || canonical === clean(word)) return Object.freeze([]);
  const allowed = Array.isArray(sections) && sections.length ? new Set(sections) : null;
  const found = [];

  for (const line of index.lines || []) {
    if (allowed && !allowed.has(line.section)) continue;
    const words = line.text.match(/[\p{L}]+/gu) || [];
    if (!words.some((item) => normalizeWordFamily(item) === canonical)) continue;
    found.push(Object.freeze({
      section: line.section,
      lineIndex: line.lineIndex,
      excerpt: line.text,
      matchedText: word,
      canonical,
      method: 'word_family'
    }));
  }

  return Object.freeze(found);
}

function monthValue(token, boundary, referenceDate) {
  const value = clean(token).replace(/\.$/, '');
  if (/^(present|current|ongoing|till date|to date)$/i.test(value)) {
    return referenceDate.getFullYear() * 12 + (referenceDate.getMonth() + 1);
  }

  let match = value.match(/^(\d{4})$/);
  if (match) {
    const year = Number(match[1]);
    return year * 12 + (boundary === 'start' ? 1 : 12);
  }

  match = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (match) return Number(match[2]) * 12 + Number(match[1]);

  match = value.match(/^(\d{4})-(\d{1,2})$/);
  if (match) return Number(match[1]) * 12 + Number(match[2]);

  match = value.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    return month ? Number(match[2]) * 12 + month : null;
  }

  return null;
}

export function estimateExperienceDuration(index, referenceDate = new Date()) {
  const experienceLines = index.sections?.experience || [];
  const rangePattern = /(\d{1,2}\/\d{4}|\d{4}-\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4})\s*(?:-|–|—|to)\s*(\d{1,2}\/\d{4}|\d{4}-\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4}|present|current|ongoing|till date|to date)/i;
  const ranges = [];
  let yearOnly = false;

  for (const line of experienceLines) {
    const match = line.text.match(rangePattern);
    if (!match) continue;
    const start = monthValue(match[1], 'start', referenceDate);
    const end = monthValue(match[2], 'end', referenceDate);
    if (start === null || end === null || end < start) continue;
    if (/^\d{4}$/.test(clean(match[1])) || /^\d{4}$/.test(clean(match[2]))) yearOnly = true;
    ranges.push({ start, end, sourceText: line.text });
  }

  if (!ranges.length) {
    return Object.freeze({
      totalMonths: null,
      ranges: Object.freeze([]),
      confidence: 'none',
      limitation: 'No usable employment date ranges were detected in the Work Experience section.'
    });
  }

  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + 1) {
      merged.push({ ...range, sources: [range.sourceText] });
    } else {
      last.end = Math.max(last.end, range.end);
      last.sources.push(range.sourceText);
    }
  }

  const totalMonths = merged.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
  return Object.freeze({
    totalMonths,
    ranges: Object.freeze(merged.map((range) => Object.freeze({
      start: range.start,
      end: range.end,
      sourceText: range.sources.join(' | ')
    }))),
    confidence: yearOnly ? 'medium' : 'high',
    limitation: yearOnly
      ? 'At least one employment range used year-only dates, so duration is an estimate.'
      : 'Duration was derived from non-overlapping employment date ranges.'
  });
}
