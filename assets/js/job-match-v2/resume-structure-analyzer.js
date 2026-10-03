const SECTION_PATTERNS = Object.freeze({
  summary: [
    /^professional summary$/i,
    /^executive summary$/i,
    /^career summary$/i,
    /^profile$/i,
    /^summary$/i,
    /^career objective$/i,
    /^objective$/i
  ],
  skills: [
    /^skills$/i,
    /^key skills$/i,
    /^technical skills$/i,
    /^core competencies$/i,
    /^competencies$/i,
    /^areas of expertise$/i
  ],
  experience: [
    /^work experience$/i,
    /^professional experience$/i,
    /^experience$/i,
    /^employment history$/i,
    /^work history$/i,
    /^career history$/i
  ],
  education: [
    /^education$/i,
    /^academic qualifications$/i,
    /^academic background$/i,
    /^education and training$/i
  ],
  certifications: [
    /^certifications?$/i,
    /^licenses?$/i,
    /^licences?$/i,
    /^professional certifications?$/i,
    /^certifications? and licenses?$/i
  ],
  projects: [
    /^projects?$/i,
    /^key projects?$/i,
    /^selected projects?$/i,
    /^academic projects?$/i,
    /^professional projects?$/i
  ]
});

const MONTHS = Object.freeze({
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
});

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim();
}

function normalizedLine(value) {
  return clean(value).toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}+#%&/.-]+/gu, ' ').trim();
}

function meaningfulLines(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(clean)
    .filter(Boolean);
}

export function identifyResumeSectionHeading(line) {
  const candidate = clean(line).replace(/[:：]\s*$/, '');
  for (const [section, patterns] of Object.entries(SECTION_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(candidate))) return section;
  }
  return '';
}

function headingLike(line) {
  const value = clean(line);
  if (!value || value.length > 70) return false;
  if (/[@]|https?:\/\/|www\./i.test(value)) return false;
  if (/^\+?[\d\s().-]{7,}$/.test(value)) return false;
  const words = value.replace(/[:：]$/, '').split(/\s+/);
  if (words.length > 7) return false;
  if (/[:：]$/.test(value)) return true;
  if (value.length >= 4 && value === value.toUpperCase() && /[A-Z]/.test(value)) return true;
  return false;
}

function detectSections(lines, parsedSections = []) {
  const found = [];
  const seen = new Set();

  const add = (section, heading, source) => {
    if (!section || seen.has(section)) return;
    seen.add(section);
    found.push(Object.freeze({ section, heading: clean(heading), source }));
  };

  for (const section of parsedSections || []) {
    const canonical = identifyResumeSectionHeading(section?.heading);
    if (canonical) add(canonical, section.heading, 'parsed_heading');
  }

  for (const line of lines) {
    const canonical = identifyResumeSectionHeading(line);
    if (canonical) add(canonical, line.replace(/[:：]\s*$/, ''), 'text_heading');
  }

  const unclearHeadings = lines
    .filter((line) => headingLike(line) && !identifyResumeSectionHeading(line))
    .slice(0, 20);

  return Object.freeze({
    detected: Object.freeze(found),
    unclearHeadings: Object.freeze(unclearHeadings)
  });
}

function likelyName(lines) {
  const candidates = lines.slice(0, 8);
  for (const line of candidates) {
    if (identifyResumeSectionHeading(line)) break;
    if (/[@]|https?:\/\/|www\.|linkedin/i.test(line)) continue;
    if (/\d/.test(line)) continue;

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) continue;
    if (line.length > 70) continue;
    if (!words.every((word) => /^[\p{L}.'’-]+$/u.test(word))) continue;

    return line;
  }
  return '';
}

function contactSignals(text, lines) {
  const email = clean(text).match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || '';
  const phoneCandidates = String(text ?? '').match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || [];
  const phone = phoneCandidates.find((value) => {
    if (/\b(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:19|20)\d{2}\b/i.test(value)) return false;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }) || '';

  return Object.freeze({
    name: likelyName(lines),
    email,
    phone: clean(phone)
  });
}

function dateStyleOf(token) {
  if (/^\d{4}$/.test(token)) return 'year';
  if (/^\d{1,2}\/\d{4}$/.test(token)) return 'numeric_month_year';
  if (/^\d{4}-\d{1,2}$/.test(token)) return 'iso_month_year';
  if (/^[A-Za-z]{3,9}\.?\s+\d{4}$/.test(token)) return 'named_month_year';
  return 'other';
}

function dateValue(token) {
  const value = clean(token).replace(/\.$/, '');
  if (/^\d{4}$/.test(value)) return Number(value) * 12;

  let match = value.match(/^(\d{1,2})\/(\d{4})$/);
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

function analyzeDates(lines) {
  const tokenPattern = /\b(?:\d{1,2}\/\d{4}|\d{4}-\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4})\b/gi;
  const styles = new Set();
  const invalidRanges = [];
  const currentConflicts = [];
  let dateTokenCount = 0;

  for (const line of lines) {
    const tokens = [...line.matchAll(tokenPattern)].map((match) => clean(match[0]));
    for (const token of tokens) {
      styles.add(dateStyleOf(token));
      dateTokenCount += 1;
    }

    const current = /\b(?:present|current|ongoing|till date|to date)\b/i.test(line);
    if (current && tokens.length >= 2) {
      currentConflicts.push(line);
    }

    const range = line.match(/(\d{1,2}\/\d{4}|\d{4}-\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4})\s*(?:-|–|—|to)\s*(\d{1,2}\/\d{4}|\d{4}-\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{4})/i);
    if (range) {
      const start = dateValue(range[1]);
      const end = dateValue(range[2]);
      if (start !== null && end !== null && end < start) invalidRanges.push(line);
    }
  }

  return Object.freeze({
    dateTokenCount,
    styles: Object.freeze([...styles]),
    inconsistentStyles: styles.size > 2,
    invalidRanges: Object.freeze(invalidRanges),
    currentConflicts: Object.freeze(currentConflicts)
  });
}

function duplicateLines(lines) {
  const counts = new Map();
  for (const line of lines) {
    const normalized = normalizedLine(line);
    if (normalized.length < 20 || identifyResumeSectionHeading(line)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return Object.freeze([...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([line, count]) => Object.freeze({ line, count })));
}

function unusualSymbolRatio(text) {
  const value = String(text ?? '');
  if (!value) return 0;
  const unusual = [...value].filter((char) =>
    !/[\p{L}\p{N}\s.,:;!?'"’“”()[\]{}%+\-–—/&@#|•·_*₹$€£]/u.test(char)
  ).length;
  return unusual / value.length;
}

function looksLikeDateOrContact(line) {
  if (/@/.test(line)) return true;
  const digits = line.replace(/\D/g, '');
  if (/^\+?[\d\s().-]{7,}$/.test(line) && digits.length >= 8) return true;
  if (/^(?:\d{4}|\d{1,2}\/\d{4}|\d{4}-\d{1,2})(?:\s*(?:-|–|—|to)\s*(?:\d{4}|\d{1,2}\/\d{4}|\d{4}-\d{1,2}|present|current))?$/i.test(line)) return true;
  return false;
}

function quantifiedAchievements(lines) {
  const actionPattern = /\b(?:increased|grew|improved|reduced|decreased|cut|saved|generated|delivered|achieved|boosted|raised|lowered|accelerated|resolved|handled|processed|managed|supported|served|completed|exceeded|maintained)\b/i;
  const metricPattern = /(?:[$₹€£]\s?\d[\d,.]*|\d+(?:\.\d+)?\s?%|\b\d[\d,]*(?:\+)?\s+(?:cases?|tickets?|customers?|clients?|users?|orders?|calls?|projects?|reports?|transactions?|employees?|team members?|hours?|days?|weeks?|months?)\b|\b\d+(?:\.\d+)?x\b)/i;
  const outcomePattern = /\b(?:revenue|cost|accuracy|productivity|efficiency|turnaround|response time|resolution time|sla|quality|conversion|retention|satisfaction|throughput|defects?|errors?)\b/i;
  const matches = [];

  for (const line of lines) {
    if (looksLikeDateOrContact(line)) continue;
    if (!/\d/.test(line)) continue;

    const hasMetric = metricPattern.test(line);
    const hasActionAndOutcome = actionPattern.test(line) && outcomePattern.test(line) && /\d/.test(line);
    if (hasMetric || hasActionAndOutcome) matches.push(line);
  }

  return Object.freeze(matches);
}

export function analyzeResumeStructure(text, parsedSections = []) {
  const resumeText = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  const lines = meaningfulLines(resumeText);
  const words = resumeText.match(/\b[\p{L}\p{N}+#.'’-]+\b/gu) || [];
  const sections = detectSections(lines, parsedSections);
  const contacts = contactSignals(resumeText, lines);
  const dates = analyzeDates(lines);
  const duplicates = duplicateLines(lines);
  const symbolRatio = unusualSymbolRatio(resumeText);
  const quantified = quantifiedAchievements(lines);

  return Object.freeze({
    lineCount: lines.length,
    wordCount: words.length,
    characterCount: resumeText.length,
    lines: Object.freeze(lines),
    detectedSections: sections.detected,
    unclearHeadings: Object.freeze(
      sections.unclearHeadings.filter((line) =>
        !contacts.name || normalizedLine(line) !== normalizedLine(contacts.name)
      )
    ),
    contactSignals: contacts,
    dateSignals: dates,
    duplicateLines: duplicates,
    unusualSymbolRatio: symbolRatio,
    quantifiedAchievements: quantified
  });
}
