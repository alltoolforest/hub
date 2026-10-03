const NOISE_SECTION_PATTERNS = [
  /^about\s+(us|the company|our company)$/i,
  /^company\s+(overview|profile)$/i,
  /^who\s+we\s+are$/i,
  /^what\s+we\s+offer$/i,
  /^benefits?$/i,
  /^perks?$/i,
  /^equal\s+(opportunity|employment)/i,
  /^eeo$/i,
  /^diversity(,?\s+equity(,?\s+and\s+inclusion)?)?$/i
];

const REQUIREMENT_SECTION_PATTERNS = [
  /requirements?/i,
  /qualifications?/i,
  /what\s+you('|’)ll\s+need/i,
  /what\s+we('|’)re\s+looking\s+for/i,
  /skills?/i,
  /experience/i,
  /education/i,
  /certifications?/i,
  /responsibilities?/i,
  /what\s+you('|’)ll\s+do/i
];

function clean(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function isLikelyHeading(line) {
  const value = line.replace(/[:：]\s*$/, '').trim();
  if (!value || value.length > 80) return false;
  if (/^[-*•▪◦‣]\s+/.test(value)) return false;
  if (/[.!?]$/.test(value)) return false;
  const words = value.split(/\s+/);
  if (words.length > 10) return false;
  return /:$/.test(line) ||
    NOISE_SECTION_PATTERNS.some((pattern) => pattern.test(value)) ||
    REQUIREMENT_SECTION_PATTERNS.some((pattern) => pattern.test(value)) ||
    words.every((word) => /^[A-Z][A-Za-z0-9&/+.'’-]*$/.test(word) || /^(and|or|of|the|to|our)$/i.test(word));
}

function sectionKind(heading) {
  const value = String(heading ?? '').replace(/[:：]\s*$/, '').trim();
  if (NOISE_SECTION_PATTERNS.some((pattern) => pattern.test(value))) return 'noise';
  if (REQUIREMENT_SECTION_PATTERNS.some((pattern) => pattern.test(value))) return 'requirements';
  return 'general';
}

function splitSentences(text) {
  const normalized = clean(text);
  if (!normalized) return [];
  const pieces = normalized.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  return pieces.map((item) => item.trim()).filter(Boolean);
}

export function parseJobDescription(rawText) {
  const raw = clean(rawText);
  if (!raw) return Object.freeze({ rawText: '', segments: Object.freeze([]) });

  const segments = [];
  let currentHeading = '';
  let currentSectionKind = 'general';

  const lines = raw.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex].trim();
    if (!rawLine) continue;

    if (isLikelyHeading(rawLine)) {
      currentHeading = rawLine.replace(/[:：]\s*$/, '').trim();
      currentSectionKind = sectionKind(currentHeading);
      segments.push(Object.freeze({
        id: 'jd-' + segments.length,
        kind: 'heading',
        text: currentHeading,
        sourceText: rawLine,
        lineIndex,
        sectionHeading: currentHeading,
        sectionKind: currentSectionKind
      }));
      continue;
    }

    const bulletMatch = rawLine.match(/^[-*•▪◦‣]\s+(.*)$/);
    const body = bulletMatch ? bulletMatch[1].trim() : rawLine;
    const pieces = bulletMatch ? [body] : splitSentences(body);

    for (const piece of pieces) {
      if (!piece) continue;
      segments.push(Object.freeze({
        id: 'jd-' + segments.length,
        kind: bulletMatch ? 'bullet' : 'sentence',
        text: piece,
        sourceText: rawLine,
        lineIndex,
        sectionHeading: currentHeading,
        sectionKind: currentSectionKind
      }));
    }
  }

  return Object.freeze({
    rawText: raw,
    segments: Object.freeze(segments)
  });
}
