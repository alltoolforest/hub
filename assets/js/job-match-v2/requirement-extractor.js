import {
  CONFIDENCE_LEVEL,
  PROVENANCE_KIND,
  REQUIREMENT_CATEGORY,
  REQUIREMENT_IMPORTANCE
} from './contracts.js';

const REQUIRED_SIGNALS = [
  /\bmust\b/i,
  /\brequired\b/i,
  /\bmandatory\b/i,
  /\bessential\b/i,
  /\bminimum\b/i,
  /\bneed(?:ed)?\b/i,
  /\bshall\b/i,
  /\bat least\b/i
];

const PREFERRED_SIGNALS = [
  /\bpreferred\b/i,
  /\bdesirable\b/i,
  /\bnice to have\b/i,
  /\bbonus\b/i,
  /\ba plus\b/i,
  /\badvantageous\b/i
];

const BOILERPLATE_PATTERNS = [
  /equal opportunity employer/i,
  /without regard to race/i,
  /reasonable accommodation/i,
  /competitive (salary|compensation)/i,
  /health (insurance|benefits)/i,
  /dental (insurance|benefits)/i,
  /vision (insurance|benefits)/i,
  /paid time off/i,
  /retirement plan/i,
  /we are a (fast[- ]growing|leading|dynamic|global)/i,
  /our mission is/i,
  /our values/i,
  /join our team and/i
];

const CATALOG = Object.freeze({
  [REQUIREMENT_CATEGORY.HARD_SKILL]: Object.freeze([
    'SQL','Python','Java','JavaScript','TypeScript','C#','C++','R','HTML','CSS',
    'machine learning','data analysis','data modeling','financial modeling',
    'statistical analysis','forecasting','reconciliation','bookkeeping',
    'financial reporting','accounting','auditing','medical coding',
    'clinical documentation','electrical troubleshooting','mechanical design',
    'circuit analysis','CAD','AutoCAD','SolidWorks','technical writing',
    'copywriting','content writing','keyword research','on-page SEO','technical SEO'
  ]),
  [REQUIREMENT_CATEGORY.TOOL_PLATFORM]: Object.freeze([
    'Power BI','Tableau','Microsoft Excel','MS Excel','Excel','Salesforce','Jira',
    'ServiceNow','SAP FICO','SAP FI','SAP CO','SAP MM','SAP SD','SAP Basis','SAP ABAP',
    'AWS','Microsoft Azure','Azure','Google Cloud','GCP','Docker','Kubernetes',
    'Git','GitHub','Linux','Oracle','MySQL','PostgreSQL','MongoDB','Workday',
    'HubSpot','QuickBooks','Tally','Figma','Adobe Photoshop','Adobe Illustrator'
  ]),
  [REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE]: Object.freeze([
    'anti-money laundering','AML','know your customer','KYC','financial crime',
    'transaction monitoring','sanctions screening','fraud prevention','fraud investigation',
    'IFRS','GAAP','accounts payable','accounts receivable','procure-to-pay','order-to-cash',
    'supply chain','inventory management','patient care','infection control',
    'healthcare compliance','cybersecurity','information security','network security',
    'search engine optimization','SEO','talent acquisition','recruitment',
    'employee relations','payroll','warehouse operations','quality assurance'
  ]),
  [REQUIREMENT_CATEGORY.SOFT_SKILL]: Object.freeze([
    'communication','written communication','verbal communication','leadership',
    'teamwork','collaboration','stakeholder management','problem solving',
    'critical thinking','attention to detail','time management','adaptability',
    'customer service','customer communication','negotiation','presentation skills',
    'organizational skills','interpersonal skills'
  ]),
  [REQUIREMENT_CATEGORY.METHODOLOGY_PROCESS]: Object.freeze([
    'Agile','Scrum','Kanban','ITIL','Lean','Six Sigma','DevOps','CI/CD',
    'root cause analysis','incident management','change management',
    'project management','risk management','quality management',
    'continuous improvement','test-driven development','TDD'
  ]),
  [REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION]: Object.freeze([
    'Data Analyst','Business Analyst','Financial Analyst','Financial Crime Analyst',
    'Software Engineer','Software Developer','Frontend Developer','Backend Developer',
    'Full Stack Developer','Data Engineer','Data Scientist','DevOps Engineer',
    'Site Reliability Engineer','SOC Analyst','Cybersecurity Analyst',
    'Accountant','Auditor','Recruiter','Talent Acquisition Specialist',
    'HR Executive','Project Manager','Product Manager','Registered Nurse',
    'Staff Nurse','Medical Coder','Mechanical Engineer','Electrical Engineer',
    'Civil Engineer','Warehouse Supervisor','Sales Executive','Marketing Manager',
    'SEO Specialist','Teacher','Chef','Electrician','Paralegal'
  ])
});

const CERTIFICATION_TERMS = Object.freeze([
  'PMP','CPA','CFA','CMA','ACCA','CISSP','CISA','CISM','CompTIA Security+',
  'CCNA','CCNP','AWS Certified','Azure certification','Google Cloud certification',
  'Scrum Master certification','Six Sigma certification','nursing license','nursing licence',
  'registered nurse license','registered nurse licence','driver license','driver licence'
]);

const EDUCATION_PATTERNS = Object.freeze([
  /\b(?:bachelor(?:'s)?|baccalaureate)\s+(?:degree\s+)?(?:in\s+[^,.;]+)?/i,
  /\bmaster(?:'s)?\s+(?:degree\s+)?(?:in\s+[^,.;]+)?/i,
  /\bMBA\b/,
  /\bPh\.?D\.?\b/i,
  /\bdiploma\s+(?:in\s+[^,.;]+)?/i,
  /\bassociate(?:'s)?\s+degree(?:\s+in\s+[^,.;]+)?/i,
  /\bdegree\s+in\s+[^,.;]+/i
]);

const EXPERIENCE_PATTERNS = Object.freeze([
  /\b\d+\s*\+?\s*(?:-|to)?\s*\d*\s*years?\s+(?:of\s+)?(?:relevant\s+)?experience\b/i,
  /\b(?:at least|minimum of|min(?:imum)?\.?)\s+\d+\s*\+?\s*years?\s+(?:of\s+)?(?:relevant\s+)?experience\b/i,
  /\bexperience\s+(?:in|with)\s+[^.;]+/i,
  /\b(?:supervisory|management|leadership|customer service|sales|clinical|engineering|accounting|audit|recruitment)\s+experience\b/i
]);

const OTHER_CONSTRAINT_PATTERNS = Object.freeze([
  /\bwilling(?:ness)?\s+to\s+travel(?:\s+up\s+to\s+\d+%?)?/i,
  /\btravel\s+(?:up\s+to\s+)?\d+%/i,
  /\b(?:night|evening|weekend|rotating)\s+shifts?\b/i,
  /\bshift\s+work\b/i,
  /\bwork\s+authorization\b/i,
  /\bauthorized\s+to\s+work\s+in\s+[^.;]+/i,
  /\bmust\s+be\s+(?:based|located)\s+in\s+[^.;]+/i,
  /\bon[- ]site\s+(?:work|presence|required)/i
]);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function signalImportance(text) {
  const required = REQUIRED_SIGNALS.some((pattern) => pattern.test(text));
  const preferred = PREFERRED_SIGNALS.some((pattern) => pattern.test(text));
  if (required && !preferred) return REQUIREMENT_IMPORTANCE.REQUIRED;
  if (preferred && !required) return REQUIREMENT_IMPORTANCE.PREFERRED;
  return null;
}

function importanceOf(segment, matchedText = '') {
  const text = segment.text || '';
  const heading = segment.sectionHeading || '';

  if (matchedText) {
    const clauses = text.split(/\s*;\s*/);
    const needle = matchedText.toLowerCase();
    const clause = clauses.find((item) => item.toLowerCase().includes(needle));
    const local = clause ? signalImportance(clause) : null;
    if (local) return local;
  }

  const explicit = signalImportance(text);
  if (explicit) return explicit;

  if (/\b(preferred|desirable|nice to have)\b/i.test(heading)) return REQUIREMENT_IMPORTANCE.PREFERRED;
  if (/\b(required|mandatory|minimum|essential)\b/i.test(heading)) return REQUIREMENT_IMPORTANCE.REQUIRED;
  return REQUIREMENT_IMPORTANCE.GENERAL;
}

function hasExplicitRequirementSignal(text) {
  return [...REQUIRED_SIGNALS, ...PREFERRED_SIGNALS].some((pattern) => pattern.test(text));
}

function isRequirementContext(segment) {
  if (hasExplicitRequirementSignal(segment.text || '')) return true;
  return /\b(requirements?|qualifications?|skills?|experience|education|certifications?|what\s+you(?:'|’)ll\s+need|what\s+we(?:'|’)re\s+looking\s+for)\b/i
    .test(segment.sectionHeading || '');
}

function isBoilerplate(segment) {
  if (segment.sectionKind === 'noise' && !hasExplicitRequirementSignal(segment.text)) return true;
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(segment.text)) &&
    !hasExplicitRequirementSignal(segment.text);
}

function escaped(value) {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

function findPhrase(text, phrase) {
  const pattern = new RegExp('(^|[^A-Za-z0-9+#])(' + escaped(phrase) + ')(?=$|[^A-Za-z0-9+#])', 'i');
  const match = text.match(pattern);
  return match ? match[2] : '';
}

function pushCandidate(candidates, category, matchedText, segment, confidence = CONFIDENCE_LEVEL.HIGH) {
  const term = clean(matchedText);
  if (!term) return;
  candidates.push({
    category,
    matchedText: term,
    sourceText: clean(segment.text),
    sourceSegmentId: segment.id,
    lineIndex: segment.lineIndex,
    sectionHeading: clean(segment.sectionHeading),
    importance: importanceOf(segment, term),
    confidence,
    provenance: PROVENANCE_KIND.PARSED
  });
}

function jobTitleHeadingCandidates(segment) {
  const candidates = [];
  const heading = clean(segment.text);
  if (!heading) return candidates;

  for (const phrase of CATALOG[REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION]) {
    const found = findPhrase(heading, phrase);
    if (found) {
      pushCandidate(candidates, REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION, found, segment);
    }
  }
  return candidates;
}

function exactCatalogCandidates(segment) {
  const candidates = [];
  for (const [category, phrases] of Object.entries(CATALOG)) {
    const ordered = [...phrases].sort((a, b) => b.length - a.length);
    const occupied = [];
    for (const phrase of ordered) {
      const found = findPhrase(segment.text, phrase);
      if (!found) continue;
      const lower = found.toLowerCase();
      if (occupied.some((item) => item.includes(lower) || lower.includes(item))) continue;
      occupied.push(lower);
      pushCandidate(candidates, category, found, segment);
    }
  }
  return candidates;
}

function regexCandidates(segment) {
  const candidates = [];

  for (const phrase of CERTIFICATION_TERMS) {
    const found = findPhrase(segment.text, phrase);
    if (found) pushCandidate(candidates, REQUIREMENT_CATEGORY.CERTIFICATION_LICENSE, found, segment);
  }

  for (const pattern of EDUCATION_PATTERNS) {
    const found = segment.text.match(pattern)?.[0];
    if (found) pushCandidate(candidates, REQUIREMENT_CATEGORY.EDUCATION, found, segment);
  }

  for (const pattern of EXPERIENCE_PATTERNS) {
    const found = segment.text.match(pattern)?.[0];
    if (found) pushCandidate(candidates, REQUIREMENT_CATEGORY.EXPERIENCE, found, segment);
  }

  for (const pattern of OTHER_CONSTRAINT_PATTERNS) {
    const found = segment.text.match(pattern)?.[0];
    if (found) pushCandidate(candidates, REQUIREMENT_CATEGORY.OTHER_CONSTRAINT, found, segment);
  }

  return candidates;
}

function removeContainedCandidates(candidates) {
  return candidates.filter((candidate, index, all) => {
    const own = candidate.matchedText.toLowerCase();
    return !all.some((other, otherIndex) =>
      otherIndex !== index &&
      other.category === candidate.category &&
      other.sourceSegmentId === candidate.sourceSegmentId &&
      other.matchedText.length > candidate.matchedText.length &&
      other.matchedText.toLowerCase().includes(own)
    );
  });
}

function dedupeCandidates(candidates) {
  const grouped = new Map();

  for (const candidate of removeContainedCandidates(candidates)) {
    const key = candidate.category + '|' + candidate.matchedText.toLowerCase();
    const existing = grouped.get(key);
    const mention = Object.freeze({
      sourceText: candidate.sourceText,
      sourceSegmentId: candidate.sourceSegmentId,
      lineIndex: candidate.lineIndex,
      sectionHeading: candidate.sectionHeading,
      importance: candidate.importance
    });

    if (!existing) {
      grouped.set(key, {
        ...candidate,
        mentions: [mention]
      });
      continue;
    }

    existing.mentions.push(mention);
    if (candidate.importance === REQUIREMENT_IMPORTANCE.REQUIRED) {
      existing.importance = REQUIREMENT_IMPORTANCE.REQUIRED;
    } else if (
      candidate.importance === REQUIREMENT_IMPORTANCE.PREFERRED &&
      existing.importance === REQUIREMENT_IMPORTANCE.GENERAL
    ) {
      existing.importance = REQUIREMENT_IMPORTANCE.PREFERRED;
    }
  }

  return [...grouped.values()].map((item, index) => Object.freeze({
    id: 'req-' + index,
    category: item.category,
    label: item.matchedText,
    matchedText: item.matchedText,
    importance: item.importance,
    sourceText: item.sourceText,
    sourceSegmentId: item.sourceSegmentId,
    lineIndex: item.lineIndex,
    sectionHeading: item.sectionHeading,
    confidence: item.confidence,
    provenance: item.provenance,
    mentionCount: item.mentions.length,
    mentions: Object.freeze(item.mentions)
  }));
}

function unknownRequirementCandidate(segment) {
  if (!isRequirementContext(segment)) return null;
  return {
    category: REQUIREMENT_CATEGORY.UNKNOWN,
    matchedText: clean(segment.text),
    sourceText: clean(segment.text),
    sourceSegmentId: segment.id,
    lineIndex: segment.lineIndex,
    sectionHeading: clean(segment.sectionHeading),
    importance: importanceOf(segment, clean(segment.text)),
    confidence: CONFIDENCE_LEVEL.LOW,
    provenance: PROVENANCE_KIND.PARSED
  };
}

export function extractJobRequirements(parsedJobDescription) {
  const segments = Array.isArray(parsedJobDescription?.segments)
    ? parsedJobDescription.segments
    : [];

  const candidates = [];
  const ignoredSegments = [];
  const uncertainSegments = [];

  for (const segment of segments) {
    if (!segment) continue;

    if (segment.kind === 'heading') {
      candidates.push(...jobTitleHeadingCandidates(segment));
      continue;
    }

    if (isBoilerplate(segment)) {
      ignoredSegments.push(Object.freeze({
        sourceSegmentId: segment.id,
        sourceText: clean(segment.text),
        reason: 'boilerplate_or_noise'
      }));
      continue;
    }

    const extracted = [
      ...exactCatalogCandidates(segment),
      ...regexCandidates(segment)
    ];

    if (extracted.length) {
      candidates.push(...extracted);
      continue;
    }

    const unknown = unknownRequirementCandidate(segment);
    if (unknown) {
      candidates.push(unknown);
      uncertainSegments.push(Object.freeze({
        sourceSegmentId: segment.id,
        sourceText: clean(segment.text),
        reason: 'explicit_requirement_not_safely_classified'
      }));
    }
  }

  const requirements = dedupeCandidates(candidates);

  return Object.freeze({
    requirements: Object.freeze(requirements),
    ignoredSegments: Object.freeze(ignoredSegments),
    uncertainSegments: Object.freeze(uncertainSegments),
    diagnostics: Object.freeze({
      segmentCount: segments.filter((segment) => segment.kind !== 'heading').length,
      requirementCount: requirements.length,
      ignoredSegmentCount: ignoredSegments.length,
      uncertainSegmentCount: uncertainSegments.length
    })
  });
}
