import {
  ANALYSIS_AREA,
  ATS_READINESS_CATEGORY,
  ATS_READINESS_LEVEL,
  CONFIDENCE_LEVEL,
  FINDING_STATUS,
  PROVENANCE_KIND,
  RESUME_SOURCE_KIND,
  RUN_STATUS,
  createFinding
} from './contracts.js';
import { analyzeResumeStructure } from './resume-structure-analyzer.js';

function finding(args) {
  return Object.freeze({
    ...createFinding({
      id: args.id,
      area: ANALYSIS_AREA.ATS_READINESS,
      status: args.status,
      title: args.title,
      sourceText: args.sourceText,
      evidence: args.evidence || [],
      confidence: args.confidence || CONFIDENCE_LEVEL.HIGH,
      provenance: PROVENANCE_KIND.DERIVED,
      explanation: args.explanation
    }),
    category: args.category
  });
}

function sectionMap(structure) {
  return new Map(structure.detectedSections.map((item) => [item.section, item]));
}

function parseabilityFindings(state, structure) {
  const output = [];
  const sourceKind = state.resume?.source?.kind || RESUME_SOURCE_KIND.NONE;
  const parsing = state.resume?.parsing || {};
  const words = structure.wordCount;

  if (sourceKind === RESUME_SOURCE_KIND.TEXT || sourceKind === RESUME_SOURCE_KIND.NONE) {
    output.push(finding({
      id: 'ats-parseability-file',
      category: ATS_READINESS_CATEGORY.PARSEABILITY,
      status: FINDING_STATUS.NOT_APPLICABLE,
      title: 'Uploaded-file parseability',
      sourceText: sourceKind === RESUME_SOURCE_KIND.TEXT ? 'Pasted resume text' : 'No uploaded resume file',
      explanation: 'File-format parseability cannot be assessed from pasted text alone. Text-based structure checks can still run.',
      confidence: CONFIDENCE_LEVEL.HIGH
    }));
    return output;
  }

  if (parsing.probableImageOnly) {
    output.push(finding({
      id: 'ats-parseability-file',
      category: ATS_READINESS_CATEGORY.PARSEABILITY,
      status: FINDING_STATUS.NOT_FOUND,
      title: 'Selectable resume text',
      sourceText: (parsing.warnings || []).join(' ') || 'Very little selectable text was extracted.',
      explanation: 'The uploaded file appears image-heavy or scanned. Text-based ATS parsing may fail unless the document contains a reliable text layer.',
      confidence: CONFIDENCE_LEVEL.HIGH
    }));
  } else if (parsing.suspiciouslyEmpty || words < 40) {
    output.push(finding({
      id: 'ats-parseability-file',
      category: ATS_READINESS_CATEGORY.PARSEABILITY,
      status: FINDING_STATUS.PARTIAL,
      title: 'Selectable resume text',
      sourceText: String(words) + ' words were extracted from the uploaded resume.',
      explanation: 'Only a small amount of resume text was extracted. Review the extracted text before relying on ATS analysis.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  } else {
    output.push(finding({
      id: 'ats-parseability-file',
      category: ATS_READINESS_CATEGORY.PARSEABILITY,
      status: FINDING_STATUS.MATCHED,
      title: 'Selectable resume text',
      sourceText: String(words) + ' words were extracted from the uploaded ' + String(sourceKind).toUpperCase() + ' resume.',
      explanation: 'Readable text was extracted successfully. This is a positive parsing signal, but it does not guarantee identical behavior in every employer ATS.',
      confidence: parsing.confidence || CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  return output;
}

function contactFindings(structure) {
  const c = structure.contactSignals;
  const rows = [
    ['name', 'Candidate name', c.name, 'A likely candidate-name line was detected near the start of the resume.'],
    ['email', 'Email address', c.email, 'An email address was detected in the resume text.'],
    ['phone', 'Phone number', c.phone, 'A phone number with a plausible international digit length was detected.']
  ];

  return rows.map(([key, title, value, success]) => finding({
    id: 'ats-contact-' + key,
    category: ATS_READINESS_CATEGORY.CONTACT,
    status: value ? FINDING_STATUS.MATCHED : FINDING_STATUS.NOT_FOUND,
    title,
    sourceText: value || 'No ' + title.toLowerCase() + ' was detected in the resume text.',
    explanation: value
      ? success
      : title + ' was not clearly detected. Review the resume because common ATS workflows usually rely on basic contact information.',
    confidence: key === 'name' && value ? CONFIDENCE_LEVEL.MEDIUM : CONFIDENCE_LEVEL.HIGH,
    evidence: value ? [{
      sourceType: 'resume',
      section: 'contact',
      excerpt: value,
      location: 'resume text',
      provenance: PROVENANCE_KIND.PARSED
    }] : []
  }));
}

function sectionFindings(structure) {
  const sections = sectionMap(structure);
  const keySections = [
    ['skills', 'Skills'],
    ['experience', 'Work Experience'],
    ['education', 'Education']
  ];

  const output = keySections.map(([id, label]) => {
    const detected = sections.get(id);
    return finding({
      id: 'ats-section-' + id,
      category: ATS_READINESS_CATEGORY.SECTIONS,
      status: detected ? FINDING_STATUS.MATCHED : FINDING_STATUS.NOT_FOUND,
      title: label + ' section',
      sourceText: detected?.heading || 'No standard ' + label + ' heading was detected.',
      explanation: detected
        ? 'A recognizable ' + label + ' heading was detected.'
        : 'A standard ' + label + ' heading was not detected. Equivalent content may still exist, so review the section labels before changing the resume.',
      confidence: detected ? CONFIDENCE_LEVEL.HIGH : CONFIDENCE_LEVEL.MEDIUM,
      evidence: detected ? [{
        sourceType: 'resume',
        section: id,
        excerpt: detected.heading,
        location: detected.source,
        provenance: PROVENANCE_KIND.PARSED
      }] : []
    });
  });

  for (const id of ['summary', 'certifications', 'projects']) {
    const detected = sections.get(id);
    if (!detected) continue;
    output.push(finding({
      id: 'ats-section-' + id,
      category: ATS_READINESS_CATEGORY.SECTIONS,
      status: FINDING_STATUS.MATCHED,
      title: id[0].toUpperCase() + id.slice(1) + ' section',
      sourceText: detected.heading,
      explanation: 'A recognizable ' + detected.heading + ' section heading was detected.',
      confidence: CONFIDENCE_LEVEL.HIGH,
      evidence: [{
        sourceType: 'resume',
        section: id,
        excerpt: detected.heading,
        location: detected.source,
        provenance: PROVENANCE_KIND.PARSED
      }]
    }));
  }

  return output;
}

function structureFindings(structure, state) {
  const output = [];
  const dates = structure.dateSignals;

  if (dates.invalidRanges.length) {
    output.push(finding({
      id: 'ats-dates-chronology',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.PARTIAL,
      title: 'Date chronology',
      sourceText: dates.invalidRanges[0],
      explanation: 'At least one date range appears to end before it starts. Review chronology before submitting.',
      confidence: CONFIDENCE_LEVEL.HIGH
    }));
  } else if (dates.dateTokenCount > 0) {
    output.push(finding({
      id: 'ats-dates-chronology',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.MATCHED,
      title: 'Date chronology',
      sourceText: String(dates.dateTokenCount) + ' date tokens were detected with no obvious reversed range.',
      explanation: 'No obvious end-before-start date range was detected.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  if (dates.currentConflicts.length) {
    output.push(finding({
      id: 'ats-dates-current-conflict',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.UNCERTAIN,
      title: 'Current-role date consistency',
      sourceText: dates.currentConflicts[0],
      explanation: 'A line contains Present/Current together with multiple explicit dates. Review it for a possible current-role date conflict.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  if (dates.inconsistentStyles) {
    output.push(finding({
      id: 'ats-dates-style',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.PARTIAL,
      title: 'Date-format consistency',
      sourceText: 'Detected date styles: ' + dates.styles.join(', ') + '.',
      explanation: 'Several date styles were detected. Consistent date formatting can make resume chronology easier to parse and review.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  const pages = Number(state.resume?.parsing?.pageCount || 0);
  const wordsPerPage = pages > 0 ? structure.wordCount / pages : null;
  const sparse = structure.wordCount < 100 || (wordsPerPage !== null && wordsPerPage < 70);
  const dense = structure.wordCount > 1800 || (wordsPerPage !== null && wordsPerPage > 900);
  const densitySource = String(structure.wordCount) + ' words' + (pages ? ' across ' + pages + ' page(s)' : '') + '.';

  if (sparse) {
    output.push(finding({
      id: 'ats-content-density',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.PARTIAL,
      title: 'Resume content density',
      sourceText: densitySource,
      explanation: 'The extracted resume appears unusually sparse. Confirm that important content was not lost during parsing.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  } else if (dense) {
    output.push(finding({
      id: 'ats-content-density',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.PARTIAL,
      title: 'Resume content density',
      sourceText: densitySource,
      explanation: 'The resume appears unusually dense. Review readability and whether important information is buried in excessive text.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  } else {
    output.push(finding({
      id: 'ats-content-density',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.MATCHED,
      title: 'Resume content density',
      sourceText: densitySource,
      explanation: 'No extreme sparse/dense content signal was detected.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  if (structure.duplicateLines.length) {
    output.push(finding({
      id: 'ats-duplicate-lines',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.PARTIAL,
      title: 'Repeated resume lines',
      sourceText: String(structure.duplicateLines.length) + ' repeated line pattern(s) were detected.',
      explanation: 'Repeated content may be accidental duplication or a parsing artifact. Review the extracted resume text.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  } else {
    output.push(finding({
      id: 'ats-duplicate-lines',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.MATCHED,
      title: 'Repeated resume lines',
      sourceText: 'No repeated long resume lines were detected.',
      explanation: 'No obvious duplicate-line pattern was found.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  if (structure.unclearHeadings.length) {
    output.push(finding({
      id: 'ats-section-label-clarity',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.UNCERTAIN,
      title: 'Section-label clarity',
      sourceText: structure.unclearHeadings.slice(0, 5).join(' | '),
      explanation: 'Some heading-like lines were not recognized as common resume sections. They may be valid job titles or custom headings, so review them before changing anything.',
      confidence: CONFIDENCE_LEVEL.LOW
    }));
  }

  if (structure.unusualSymbolRatio > 0.02) {
    output.push(finding({
      id: 'ats-unusual-symbols',
      category: ATS_READINESS_CATEGORY.STRUCTURE,
      status: FINDING_STATUS.PARTIAL,
      title: 'Unusual symbol usage',
      sourceText: (structure.unusualSymbolRatio * 100).toFixed(1) + '% of characters were outside the common resume-symbol set.',
      explanation: 'Unusual or decorative symbols may reduce parsing reliability in some systems. Review whether they carry important information.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  return output;
}

function formattingFindings(state) {
  const output = [];
  const sourceKind = state.resume?.source?.kind || RESUME_SOURCE_KIND.NONE;
  const parsing = state.resume?.parsing || {};
  const diag = parsing.formatDiagnostics || {};

  if (sourceKind === RESUME_SOURCE_KIND.TEXT || sourceKind === RESUME_SOURCE_KIND.NONE) {
    output.push(finding({
      id: 'ats-format-file-risk',
      category: ATS_READINESS_CATEGORY.FORMATTING_RISK,
      status: FINDING_STATUS.NOT_APPLICABLE,
      title: 'Uploaded-file formatting risk',
      sourceText: sourceKind === RESUME_SOURCE_KIND.TEXT ? 'Pasted resume text' : 'No uploaded resume file',
      explanation: 'Tables, reading order, images and other file-layout risks cannot be fully assessed from pasted text.',
      confidence: CONFIDENCE_LEVEL.HIGH
    }));
    return output;
  }

  if (parsing.readingOrderRisk === 'possible') {
    output.push(finding({
      id: 'ats-format-reading-order',
      category: ATS_READINESS_CATEGORY.FORMATTING_RISK,
      status: FINDING_STATUS.PARTIAL,
      title: 'Reading-order risk',
      sourceText: 'The parser detected possible out-of-order text extraction.',
      explanation: 'Complex or multi-column layouts may not follow the visual reading order when parsed. Review extracted text sequence.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  const tableRatio = Number(diag.tableTextRatio || 0);
  const tableCount = Number(diag.tableCount || 0);
  if (tableCount >= 3 || tableRatio >= 0.45) {
    output.push(finding({
      id: 'ats-format-tables',
      category: ATS_READINESS_CATEGORY.FORMATTING_RISK,
      status: FINDING_STATUS.PARTIAL,
      title: 'Table dependence',
      sourceText: String(tableCount) + ' table block(s); approximately ' + (tableRatio * 100).toFixed(0) + '% of extracted text came from tables.',
      explanation: 'Heavy table dependence can increase parsing risk in some ATS workflows. The analyzer does not claim that every ATS will reject tables.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  if (diag.embeddedImagePresent) {
    output.push(finding({
      id: 'ats-format-image-text',
      category: ATS_READINESS_CATEGORY.FORMATTING_RISK,
      status: FINDING_STATUS.PARTIAL,
      title: 'Embedded-image text risk',
      sourceText: 'The DOCX parser detected at least one embedded image.',
      explanation: 'Text stored only inside images may not be available to text-based ATS parsing.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  if (!output.length) {
    output.push(finding({
      id: 'ats-format-file-risk',
      category: ATS_READINESS_CATEGORY.FORMATTING_RISK,
      status: FINDING_STATUS.MATCHED,
      title: 'Detected file-layout risks',
      sourceText: 'No supported high-risk table, image-text, or reading-order signal was detected.',
      explanation: 'No formatting risk detectable by the current parser was found. This is not a guarantee that every ATS will parse the file identically.',
      confidence: CONFIDENCE_LEVEL.MEDIUM
    }));
  }

  return output;
}

function impactFindings(structure) {
  const count = structure.quantifiedAchievements.length;
  return [finding({
    id: 'ats-quantified-impact',
    category: ATS_READINESS_CATEGORY.QUANTIFIED_IMPACT,
    status: count ? FINDING_STATUS.MATCHED : FINDING_STATUS.PARTIAL,
    title: 'Quantified achievement evidence',
    sourceText: count
      ? structure.quantifiedAchievements.slice(0, 3).join(' | ')
      : 'No clear outcome-oriented metric was detected after excluding contact numbers and date-only lines.',
    explanation: count
      ? String(count) + ' line(s) contain likely quantified achievement evidence.'
      : 'No clear quantified achievement was detected. This is a content-quality observation, not an ATS rejection signal.',
    confidence: CONFIDENCE_LEVEL.MEDIUM,
    evidence: count ? structure.quantifiedAchievements.slice(0, 3).map((line) => ({
      sourceType: 'resume',
      section: 'content',
      excerpt: line,
      location: 'resume text',
      provenance: PROVENANCE_KIND.PARSED
    })) : []
  })];
}

function readinessLevel(state, findings, structure) {
  if (!structure.wordCount) return ATS_READINESS_LEVEL.INSUFFICIENT_DATA;
  if (state.resume?.parsing?.probableImageOnly) return ATS_READINESS_LEVEL.HIGH_RISK;

  const materialCategories = new Set([
    ATS_READINESS_CATEGORY.PARSEABILITY,
    ATS_READINESS_CATEGORY.CONTACT,
    ATS_READINESS_CATEGORY.SECTIONS,
    ATS_READINESS_CATEGORY.STRUCTURE,
    ATS_READINESS_CATEGORY.FORMATTING_RISK
  ]);
  const needsReview = findings.some((item) =>
    materialCategories.has(item.category) &&
    [FINDING_STATUS.PARTIAL, FINDING_STATUS.NOT_FOUND, FINDING_STATUS.UNCERTAIN].includes(item.status)
  );

  return needsReview ? ATS_READINESS_LEVEL.NEEDS_REVIEW : ATS_READINESS_LEVEL.STRONG;
}

export function analyzeAtsReadiness(state) {
  if (!state?.resume) throw new TypeError('A canonical analysis state with resume data is required.');

  const structure = analyzeResumeStructure(
    state.resume.extractedText || '',
    state.resume.parsedSections || []
  );

  const findings = Object.freeze([
    ...parseabilityFindings(state, structure),
    ...contactFindings(structure),
    ...sectionFindings(structure),
    ...structureFindings(structure, state),
    ...formattingFindings(state),
    ...impactFindings(structure)
  ]);

  return Object.freeze({
    level: readinessLevel(state, findings, structure),
    findings,
    diagnostics: Object.freeze({
      detectedSections: Object.freeze(structure.detectedSections.map((item) => item.section)),
      contactSignals: Object.freeze({ ...structure.contactSignals }),
      dateSignals: Object.freeze({
        dateTokenCount: structure.dateSignals.dateTokenCount,
        styles: Object.freeze([...structure.dateSignals.styles]),
        invalidRangeCount: structure.dateSignals.invalidRanges.length,
        currentConflictCount: structure.dateSignals.currentConflicts.length
      }),
      duplicateLineCount: structure.duplicateLines.length,
      unusualSymbolRatio: structure.unusualSymbolRatio,
      quantifiedAchievementCount: structure.quantifiedAchievements.length,
      wordCount: structure.wordCount,
      lineCount: structure.lineCount
    })
  });
}

export function applyAtsReadinessToState(state, result) {
  if (!state?.analysis?.atsReadiness || !result || !Array.isArray(result.findings)) {
    throw new TypeError('A canonical analysis state and ATS readiness result are required.');
  }

  const next = typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));

  next.analysis.atsReadiness = {
    ...next.analysis.atsReadiness,
    status: RUN_STATUS.COMPLETE,
    completedAt: '',
    errorCode: '',
    errorMessage: '',
    level: result.level,
    findings: result.findings.map((item) => ({
      ...item,
      evidence: Array.isArray(item.evidence)
        ? item.evidence.map((evidence) => ({ ...evidence }))
        : []
    })),
    diagnostics: {
      ...result.diagnostics,
      detectedSections: [...(result.diagnostics.detectedSections || [])],
      contactSignals: { ...(result.diagnostics.contactSignals || {}) },
      dateSignals: {
        ...(result.diagnostics.dateSignals || {}),
        styles: [...(result.diagnostics.dateSignals?.styles || [])]
      }
    }
  };

  return next;
}
