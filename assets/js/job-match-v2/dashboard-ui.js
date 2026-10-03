import { buildDashboardViewModel } from './dashboard-view-model.js';
import {
  copyAnalysisReport,
  downloadAnalysisReport,
  printAnalysisReport
} from './report-controls.js';

const SECTION_DEFS = Object.freeze([
  ['requiredRequirements', 'Required Requirements', 'Requirements the job description identifies as required.'],
  ['preferredRequirements', 'Preferred Requirements', 'Requirements the job description identifies as preferred.'],
  ['matchedEvidence', 'Matched Evidence', 'Requirements with resume evidence detected by the matching engine.'],
  ['missingUnclearRequirements', 'Missing / Unclear Requirements', 'Requirements that are missing, only partially evidenced, or cannot be concluded safely.'],
  ['skillsAnalysis', 'Skills Analysis', 'Hard skills, tools, domain knowledge, methods, and soft skills from the job description.'],
  ['experienceAlignment', 'Experience Alignment', 'Job-title and experience requirements compared with resume work-history evidence.'],
  ['educationCertifications', 'Education / Certifications', 'Education, certifications, and licence requirements compared with resume evidence.']
]);

function el(doc, tag, className = '', text = '') {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function setButtonType(button) {
  button.type = 'button';
  return button;
}

function statusSymbol(status) {
  if (status === 'matched') return '✓';
  if (status === 'partial') return '◐';
  if (status === 'not_found') return '!';
  if (status === 'uncertain') return '?';
  if (status === 'not_applicable') return '—';
  return '•';
}

function prioritySymbol(priority) {
  if (priority === 'high') return '!';
  if (priority === 'medium') return '•';
  if (priority === 'optional') return '+';
  return '•';
}

function appendHighlightedText(doc, parent, text, needle) {
  const source = String(text ?? '');
  const target = String(needle ?? '').trim();
  if (!target) {
    parent.append(doc.createTextNode(source));
    return;
  }

  const index = source.toLocaleLowerCase('en-US').indexOf(target.toLocaleLowerCase('en-US'));
  if (index < 0) {
    parent.append(doc.createTextNode(source));
    return;
  }

  if (index > 0) parent.append(doc.createTextNode(source.slice(0, index)));
  const mark = el(doc, 'mark', 'jm-evidence-mark', source.slice(index, index + target.length));
  parent.append(mark);
  if (index + target.length < source.length) {
    parent.append(doc.createTextNode(source.slice(index + target.length)));
  }
}

function badge(doc, status, label) {
  const node = el(doc, 'span', 'jm-status jm-status--' + status);
  node.dataset.status = status;
  node.setAttribute('aria-label', label);
  const symbol = el(doc, 'span', 'jm-status__symbol', statusSymbol(status));
  symbol.setAttribute('aria-hidden', 'true');
  node.append(symbol, doc.createTextNode(' ' + label));
  return node;
}

function priorityBadge(doc, priority, label) {
  const node = el(doc, 'span', 'jm-priority jm-priority--' + priority);
  node.dataset.priority = priority;
  node.setAttribute('aria-label', label);
  const symbol = el(doc, 'span', 'jm-priority__symbol', prioritySymbol(priority));
  symbol.setAttribute('aria-hidden', 'true');
  node.append(symbol, doc.createTextNode(' ' + label));
  return node;
}

function emptyState(doc, message) {
  return el(doc, 'p', 'jm-empty', message);
}

function evidenceList(doc, card) {
  if (!card.evidence?.length) {
    return emptyState(doc, 'No resume evidence excerpt is available for this finding.');
  }

  const list = el(doc, 'ul', 'jm-evidence-list');
  for (const evidence of card.evidence) {
    const item = el(doc, 'li', 'jm-evidence-list__item');
    const meta = el(doc, 'div', 'jm-evidence-meta');
    meta.append(
      el(doc, 'strong', '', evidence.sectionLabel || 'Resume'),
      doc.createTextNode(evidence.location ? ' · ' + evidence.location : '')
    );
    const excerpt = el(doc, 'blockquote', 'jm-evidence-excerpt');
    appendHighlightedText(doc, excerpt, evidence.excerpt, evidence.matchedText);
    item.append(meta, excerpt);
    list.append(item);
  }
  return list;
}

function requirementCard(doc, card) {
  const details = el(doc, 'details', 'jm-card jm-requirement-card');
  const summary = el(doc, 'summary', 'jm-card__summary');
  const heading = el(doc, 'span', 'jm-card__title', card.requirement || 'Requirement');
  const tags = el(doc, 'span', 'jm-card__tags');
  tags.append(badge(doc, card.status, card.statusLabel));
  if (card.importanceLabel) tags.append(el(doc, 'span', 'jm-chip', card.importanceLabel));
  summary.append(heading, tags);

  const body = el(doc, 'div', 'jm-card__body');
  const jdLabel = el(doc, 'h4', 'jm-card__subheading', 'Job description wording');
  const jd = el(doc, 'blockquote', 'jm-jd-source');
  appendHighlightedText(
    doc,
    jd,
    card.jobDescriptionText || card.requirement,
    card.jobHighlightText || card.requirement
  );

  const evidenceLabel = el(doc, 'h4', 'jm-card__subheading', 'Resume evidence');
  const explanation = el(doc, 'p', 'jm-card__explanation', card.explanation || 'No additional explanation.');

  body.append(jdLabel, jd, evidenceLabel, evidenceList(doc, card), explanation);
  details.append(summary, body);
  return details;
}

function atsFindingCard(doc, card) {
  const details = el(doc, 'details', 'jm-card jm-readiness-card');
  const summary = el(doc, 'summary', 'jm-card__summary');
  summary.append(
    el(doc, 'span', 'jm-card__title', card.title),
    badge(doc, card.status, card.statusLabel)
  );
  const body = el(doc, 'div', 'jm-card__body');
  if (card.sourceText) {
    body.append(el(doc, 'p', 'jm-card__source', card.sourceText));
  }
  body.append(el(doc, 'p', 'jm-card__explanation', card.explanation || ''));
  details.append(summary, body);
  return details;
}

function priorityCard(doc, card) {
  const article = el(doc, 'article', 'jm-priority-card jm-priority-card--' + card.priority);
  const head = el(doc, 'div', 'jm-priority-card__head');
  head.append(
    el(doc, 'h3', 'jm-priority-card__title', card.requirement),
    priorityBadge(doc, card.priority, card.priorityLabel)
  );
  const recommendation = el(doc, 'p', 'jm-priority-card__recommendation', card.recommendation);
  const guardrail = el(doc, 'p', 'jm-priority-card__guardrail', card.truthfulGuardrail);
  article.append(head, recommendation, guardrail);
  return article;
}

function dashboardSection(doc, id, title, intro = '') {
  const section = el(doc, 'section', 'jm-section');
  const headingId = 'jm-' + id + '-heading';
  section.setAttribute('aria-labelledby', headingId);
  const heading = el(doc, 'h2', 'jm-section__heading', title);
  heading.id = headingId;
  section.append(heading);
  if (intro) section.append(el(doc, 'p', 'jm-section__intro', intro));
  return section;
}

function renderCoverage(doc, viewModel) {
  const section = dashboardSection(
    doc,
    'coverage',
    'Job Requirement Coverage',
    'Transparent coverage of assessable job requirements. Unclear and not-applicable items are excluded rather than treated as failures.'
  );

  const hero = el(doc, 'div', 'jm-coverage-hero');
  const value = viewModel.coverage.percent === null ? 'Not available' : viewModel.coverage.percent + '%';
  const score = el(doc, 'div', 'jm-coverage-score');
  score.append(
    el(doc, 'strong', 'jm-coverage-score__value', value),
    el(doc, 'span', 'jm-coverage-score__label', viewModel.coverage.levelLabel)
  );

  const meterWrap = el(doc, 'div', 'jm-meter-wrap');
  const meterLabel = el(doc, 'span', 'jm-meter-label', 'Coverage');
  const meter = el(doc, 'meter', 'jm-meter');
  meter.min = 0;
  meter.max = 100;
  meter.value = viewModel.coverage.percent ?? 0;
  meter.setAttribute('aria-label', 'Job Requirement Coverage');
  meterWrap.append(meterLabel, meter);

  hero.append(score, meterWrap, el(doc, 'p', 'jm-plain-language', viewModel.coverage.plainLanguage));
  section.append(hero);

  const grid = el(doc, 'div', 'jm-coverage-grid');
  for (const group of viewModel.coverage.groups) {
    const card = el(doc, 'article', 'jm-coverage-group');
    card.append(
      el(doc, 'h3', 'jm-coverage-group__title', group.label),
      el(doc, 'p', 'jm-coverage-group__value', group.percent === null ? 'Not available' : group.percent + '%'),
      el(doc, 'p', 'jm-coverage-group__meta',
        String(group.matchedCount) + ' matched · ' +
        String(group.partialCount) + ' partial · ' +
        String(group.notFoundCount) + ' not found · ' +
        String(group.uncertainCount) + ' unclear'
      )
    );
    grid.append(card);
  }
  section.append(grid);

  if (viewModel.comparison?.previousCoverage !== null) {
    const comparison = el(doc, 'aside', 'jm-comparison');
    comparison.setAttribute('aria-label', 'Same-session coverage comparison');
    const delta = viewModel.comparison.delta;
    comparison.append(
      el(doc, 'h3', '', 'Previous vs current'),
      el(doc, 'p', '',
        'Previous: ' + viewModel.comparison.previousCoverage + '% · Current: ' +
        viewModel.comparison.currentCoverage + '% · Change: ' +
        (delta > 0 ? '+' : '') + delta + ' percentage points'
      )
    );
    section.append(comparison);
  }

  return section;
}

function renderAtsReadiness(doc, viewModel) {
  const section = dashboardSection(doc, 'ats-readiness', 'ATS Readiness', viewModel.atsReadiness.plainLanguage);
  const level = el(doc, 'p', 'jm-level-line');
  level.append(el(doc, 'strong', '', 'Readiness: '), doc.createTextNode(viewModel.atsReadiness.levelLabel));
  section.append(level);

  const list = el(doc, 'div', 'jm-card-stack');
  for (const finding of viewModel.atsReadiness.findings) list.append(atsFindingCard(doc, finding));
  section.append(list.childElementCount ? list : emptyState(doc, 'No ATS-readiness findings are available.'));
  return section;
}

function renderRequirementSection(doc, key, title, intro, cards) {
  const section = dashboardSection(doc, key, title, intro);
  const stack = el(doc, 'div', 'jm-card-stack');
  for (const card of cards) stack.append(requirementCard(doc, card));
  section.append(stack.childElementCount ? stack : emptyState(doc, 'No findings in this section.'));
  return section;
}

function renderResumeStructure(doc, viewModel) {
  const section = dashboardSection(
    doc,
    'resume-structure',
    'Resume Structure',
    'Parsing, contact, section, date, content-density, and supported formatting-risk checks.'
  );
  const stack = el(doc, 'div', 'jm-card-stack');
  for (const card of viewModel.sections.resumeStructure) stack.append(atsFindingCard(doc, card));
  section.append(stack.childElementCount ? stack : emptyState(doc, 'No resume-structure findings are available.'));
  return section;
}

function renderQuantifiedImpact(doc, viewModel) {
  const section = dashboardSection(
    doc,
    'quantified-impact',
    'Quantified Impact',
    'Looks for measurable achievement evidence while avoiding phone-number and date-only false positives.'
  );
  const stack = el(doc, 'div', 'jm-card-stack');
  for (const card of viewModel.sections.quantifiedImpact) stack.append(atsFindingCard(doc, card));
  section.append(stack.childElementCount ? stack : emptyState(doc, 'No quantified-impact finding is available.'));
  return section;
}

function renderPriorities(doc, viewModel) {
  const section = dashboardSection(
    doc,
    'priority-actions',
    'Priority Actions',
    'High-priority required gaps appear first. Add or strengthen resume content only when it is genuinely true.'
  );
  const stack = el(doc, 'div', 'jm-priority-stack');
  for (const card of viewModel.sections.priorityActions) stack.append(priorityCard(doc, card));
  section.append(stack.childElementCount ? stack : emptyState(doc, 'No improvement action is currently recommended.'));
  return section;
}

function reportControls(doc, viewModel, announce) {
  const section = el(doc, 'section', 'jm-toolbar jm-no-print');
  section.setAttribute('aria-label', 'Analysis report controls');

  const copy = setButtonType(el(doc, 'button', 'jm-button', 'Copy analysis'));
  const download = setButtonType(el(doc, 'button', 'jm-button', 'Download TXT report'));
  const print = setButtonType(el(doc, 'button', 'jm-button', 'Print / Save PDF'));

  copy.addEventListener('click', async () => {
    try {
      await copyAnalysisReport(viewModel);
      announce('Analysis copied to clipboard.');
    } catch (error) {
      announce(error.message || 'Copy failed.');
    }
  });

  download.addEventListener('click', () => {
    try {
      downloadAnalysisReport(viewModel);
      announce('TXT report download started.');
    } catch (error) {
      announce(error.message || 'Download failed.');
    }
  });

  print.addEventListener('click', () => {
    try {
      printAnalysisReport();
      announce('Print dialog opened.');
    } catch (error) {
      announce(error.message || 'Print is unavailable.');
    }
  });

  section.append(copy, download, print);
  return section;
}

function improvementPanel(doc, callbacks, announce) {
  const section = dashboardSection(
    doc,
    'improvement-workflow',
    'Improve and Re-analyze',
    'Edit your source resume externally, then upload the revised PDF/DOCX or paste revised resume text. Re-analysis can compare this session’s previous coverage with the new result.'
  );
  section.classList.add('jm-no-print');

  const fieldGrid = el(doc, 'div', 'jm-improvement-fields');

  const textLabel = el(doc, 'label', 'jm-label', 'Paste revised resume text');
  textLabel.htmlFor = 'jm-revised-resume-text';
  const textarea = el(doc, 'textarea', 'jm-textarea');
  textarea.id = 'jm-revised-resume-text';
  textarea.rows = 7;
  textarea.autocomplete = 'off';
  textarea.spellcheck = true;

  const fileLabel = el(doc, 'label', 'jm-label', 'Or choose a revised resume file');
  fileLabel.htmlFor = 'jm-revised-resume-file';
  const file = el(doc, 'input', 'jm-file-input');
  file.id = 'jm-revised-resume-file';
  file.type = 'file';
  file.accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  fieldGrid.append(textLabel, textarea, fileLabel, file);

  const actions = el(doc, 'div', 'jm-button-row');
  const reanalyze = setButtonType(el(doc, 'button', 'jm-button jm-button--primary', 'Re-analyze revised resume'));
  reanalyze.addEventListener('click', async () => {
    if (typeof callbacks.onReanalyze !== 'function') {
      announce('Re-analysis is not connected yet.');
      return;
    }

    const revisedText = textarea.value.trim();
    const revisedFile = file.files?.[0] || null;
    if (!revisedText && !revisedFile) {
      announce('Paste revised resume text or choose a revised PDF/DOCX file first.');
      textarea.focus();
      return;
    }

    reanalyze.disabled = true;
    announce('Re-analysis started.');
    try {
      await callbacks.onReanalyze({ text: revisedText, file: revisedFile });
      announce('Re-analysis complete.');
    } catch (error) {
      announce(error.message || 'Re-analysis failed.');
    } finally {
      reanalyze.disabled = false;
    }
  });

  actions.append(reanalyze);
  section.append(fieldGrid, actions);
  return section;
}

function lifecycleControls(doc, callbacks, clearDashboard, announce) {
  const section = el(doc, 'section', 'jm-toolbar jm-toolbar--danger-zone jm-no-print');
  section.setAttribute('aria-label', 'Analysis lifecycle controls');

  const fresh = setButtonType(el(doc, 'button', 'jm-button', 'Start new analysis'));
  const clear = setButtonType(el(doc, 'button', 'jm-button jm-button--danger', 'Clear sensitive data'));

  fresh.addEventListener('click', async () => {
    if (typeof callbacks.onNewAnalysis === 'function') await callbacks.onNewAnalysis();
    clearDashboard('Ready for a new analysis. Previous results were cleared from this dashboard.');
    announce('Started a new analysis and cleared the current dashboard.');
  });

  clear.addEventListener('click', async () => {
    if (typeof callbacks.onClearSensitiveData === 'function') await callbacks.onClearSensitiveData();
    clearDashboard('Sensitive resume and job-description results were cleared from this dashboard.');
    announce('Sensitive analysis data cleared.');
  });

  section.append(fresh, clear);
  return section;
}

export function renderJobMatchDashboard({
  root,
  state,
  comparison = null,
  callbacks = {},
  documentRef = root?.ownerDocument || globalThis.document
}) {
  if (!root?.replaceChildren || !documentRef?.createElement) {
    throw new TypeError('Task 8 dashboard requires a DOM root element.');
  }

  const viewModel = buildDashboardViewModel(state, comparison);
  const fragment = documentRef.createDocumentFragment();

  const live = el(documentRef, 'div', 'jm-live-region');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  function announce(message) {
    live.textContent = '';
    globalThis.setTimeout?.(() => { live.textContent = message; }, 0);
  }

  function clearDashboard(message) {
    const cleared = el(documentRef, 'section', 'jm-cleared-state');
    cleared.setAttribute('aria-live', 'polite');
    cleared.append(
      el(documentRef, 'h2', '', 'Analysis cleared'),
      el(documentRef, 'p', '', message)
    );
    root.replaceChildren(cleared, live);
  }

  const header = el(documentRef, 'header', 'jm-dashboard-header');
  header.append(
    el(documentRef, 'h1', 'jm-dashboard-title', viewModel.title),
    el(documentRef, 'p', 'jm-dashboard-explanation', viewModel.explanation),
    el(documentRef, 'p', 'jm-audience-guidance',
      'For freshers and experienced candidates: read each finding as resume evidence guidance, not as a hiring verdict. A fresher may rely more on education, projects, internships, and verified skills when formal work history is limited.'
    )
  );

  const nav = el(documentRef, 'nav', 'jm-section-nav jm-no-print');
  nav.setAttribute('aria-label', 'Analysis sections');
  const navList = el(documentRef, 'ul', 'jm-section-nav__list');
  const navItems = [
    ['coverage', 'Coverage'],
    ['ats-readiness', 'ATS Readiness'],
    ['requiredRequirements', 'Required'],
    ['preferredRequirements', 'Preferred'],
    ['matchedEvidence', 'Matched Evidence'],
    ['missingUnclearRequirements', 'Missing / Unclear'],
    ['skillsAnalysis', 'Skills'],
    ['experienceAlignment', 'Experience'],
    ['educationCertifications', 'Education / Certifications'],
    ['resume-structure', 'Structure'],
    ['quantified-impact', 'Quantified Impact'],
    ['priority-actions', 'Priority Actions']
  ];
  for (const [id, label] of navItems) {
    const li = el(documentRef, 'li');
    const link = el(documentRef, 'a', 'jm-section-nav__link', label);
    link.href = '#jm-' + id + '-heading';
    li.append(link);
    navList.append(li);
  }
  nav.append(navList);

  const main = el(documentRef, 'main', 'jm-dashboard-main');
  main.append(
    renderCoverage(documentRef, viewModel),
    renderAtsReadiness(documentRef, viewModel)
  );

  for (const [key, title, intro] of SECTION_DEFS) {
    main.append(renderRequirementSection(documentRef, key, title, intro, viewModel.sections[key]));
  }

  main.append(
    renderResumeStructure(documentRef, viewModel),
    renderQuantifiedImpact(documentRef, viewModel),
    renderPriorities(documentRef, viewModel),
    improvementPanel(documentRef, callbacks, announce),
    reportControls(documentRef, viewModel, announce),
    lifecycleControls(documentRef, callbacks, clearDashboard, announce)
  );

  fragment.append(header, nav, main, live);
  root.replaceChildren(fragment);

  return Object.freeze({
    viewModel,
    announce,
    destroy() {
      root.replaceChildren();
    }
  });
}
