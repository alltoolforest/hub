function line(value = '') {
  return String(value ?? '').trim();
}

function percent(value) {
  return typeof value === 'number' ? value.toFixed(1).replace(/\.0$/, '') + '%' : 'Not available';
}

function section(title, rows = []) {
  const body = rows.filter(Boolean).join('\n');
  return [title, '-'.repeat(title.length), body || 'No findings in this section.'].join('\n');
}

function findingLines(cards) {
  return (cards || []).map((item) => {
    const evidence = (item.evidence || []).map((ev) =>
      '    Resume evidence: ' + line(ev.excerpt) +
      (ev.sectionLabel ? ' [' + ev.sectionLabel + ']' : '') +
      (ev.location ? ' (' + ev.location + ')' : '')
    );
    return [
      '* ' + line(item.requirement || item.title) + ' — ' + line(item.statusLabel),
      item.jobDescriptionText ? '  Job description: ' + line(item.jobDescriptionText) : '',
      item.sourceText ? '  Source: ' + line(item.sourceText) : '',
      item.explanation ? '  Explanation: ' + line(item.explanation) : '',
      ...evidence
    ].filter(Boolean).join('\n');
  });
}

function priorityLines(items) {
  return (items || []).map((item) => [
    '* [' + line(item.priorityLabel) + '] ' + line(item.requirement),
    '  ' + line(item.recommendation),
    item.truthfulGuardrail ? '  Guardrail: ' + line(item.truthfulGuardrail) : ''
  ].filter(Boolean).join('\n'));
}

export function buildPlainTextAnalysisReport(viewModel) {
  if (!viewModel?.coverage || !viewModel?.sections) {
    throw new TypeError('A Task 8 dashboard view model is required to build a report.');
  }

  const groupLines = (viewModel.coverage.groups || []).map((group) =>
    '* ' + group.label + ': ' + percent(group.percent) +
    ' (' + group.matchedCount + ' matched, ' + group.partialCount + ' partial, ' +
    group.notFoundCount + ' not found, ' + group.uncertainCount + ' unclear)'
  );

  const comparison = viewModel.comparison && viewModel.comparison.previousCoverage !== null
    ? section('Same-session comparison', [
      'Previous coverage: ' + percent(viewModel.comparison.previousCoverage),
      'Current coverage: ' + percent(viewModel.comparison.currentCoverage),
      'Change: ' + (viewModel.comparison.delta > 0 ? '+' : '') + viewModel.comparison.delta + ' percentage points'
    ])
    : '';

  return [
    'ATS & Job Match Analysis',
    '========================',
    '',
    line(viewModel.explanation),
    '',
    section('Job Requirement Coverage', [
      'Coverage: ' + percent(viewModel.coverage.percent),
      'Level: ' + line(viewModel.coverage.levelLabel),
      line(viewModel.coverage.plainLanguage),
      ...groupLines
    ]),
    '',
    section('ATS Readiness', [
      'Level: ' + line(viewModel.atsReadiness.levelLabel),
      line(viewModel.atsReadiness.plainLanguage)
    ]),
    '',
    section('Required Requirements', findingLines(viewModel.sections.requiredRequirements)),
    '',
    section('Preferred Requirements', findingLines(viewModel.sections.preferredRequirements)),
    '',
    section('Matched Evidence', findingLines(viewModel.sections.matchedEvidence)),
    '',
    section('Missing / Unclear Requirements', findingLines(viewModel.sections.missingUnclearRequirements)),
    '',
    section('Skills Analysis', findingLines(viewModel.sections.skillsAnalysis)),
    '',
    section('Experience Alignment', findingLines(viewModel.sections.experienceAlignment)),
    '',
    section('Education / Certifications', findingLines(viewModel.sections.educationCertifications)),
    '',
    section('Resume Structure', findingLines(viewModel.sections.resumeStructure)),
    '',
    section('Quantified Impact', findingLines(viewModel.sections.quantifiedImpact)),
    '',
    section('Priority Actions', priorityLines(viewModel.sections.priorityActions)),
    comparison ? '\n' + comparison : '',
    '',
    'Important: This analysis does not reproduce an employer ATS and does not predict hiring outcomes. Only add or strengthen resume content when it is genuinely true and supported by your real experience, skills, qualifications, or credentials.'
  ].filter((value, index, array) => !(value === '' && array[index - 1] === '')).join('\n');
}

export async function copyAnalysisReport(viewModel, clipboard = globalThis.navigator?.clipboard) {
  const report = buildPlainTextAnalysisReport(viewModel);
  if (!clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.');
  await clipboard.writeText(report);
  return report;
}

export function downloadAnalysisReport(viewModel, {
  documentRef = globalThis.document,
  URLRef = globalThis.URL,
  filename = 'ats-job-match-analysis.txt'
} = {}) {
  if (!documentRef?.createElement || !URLRef?.createObjectURL) {
    throw new Error('Download is unavailable in this environment.');
  }

  const report = buildPlainTextAnalysisReport(viewModel);
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URLRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  URLRef.revokeObjectURL(url);
  return report;
}

export function printAnalysisReport({
  windowRef = globalThis.window
} = {}) {
  if (!windowRef?.print) throw new Error('Print is unavailable in this environment.');
  windowRef.print();
}
