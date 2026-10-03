import { buildResumePreviewHtml } from './preview.js';

function clean(value) {
  return String(value || '').trim();
}

function nonEmpty(items) {
  return Array.isArray(items) ? items.filter((item) => clean(item)) : [];
}

function section(title, bodyLines) {
  const body = bodyLines.filter(Boolean);
  if (!body.length) return [];
  return ['', title.toUpperCase(), ...body];
}

function bulletLines(items) {
  return nonEmpty(items).map((item) => '- ' + clean(item));
}

function buildExperienceLines(resume) {
  const lines = [];
  for (const item of resume?.experience || []) {
    if (![item.company, item.position, item.location, item.startDate, item.endDate].some(clean) &&
        !nonEmpty(item.responsibilities).length && !nonEmpty(item.achievements).length) continue;
    if (clean(item.position)) lines.push(clean(item.position));
    const meta = [
      item.company,
      item.location,
      [item.startDate, item.current ? 'Present' : item.endDate].map(clean).filter(Boolean).join(' - ')
    ].map(clean).filter(Boolean).join(' | ');
    if (meta) lines.push(meta);
    lines.push(...bulletLines(item.responsibilities));
    if (nonEmpty(item.achievements).length) {
      lines.push('Achievements:');
      lines.push(...bulletLines(item.achievements));
    }
    lines.push('');
  }
  return section('Work Experience', lines);
}

function buildEducationLines(resume) {
  const lines = [];
  for (const item of resume?.education || []) {
    if (![item.qualification, item.specialization, item.institution, item.university, item.location, item.startYear, item.completionYear, item.grade].some(clean)) continue;
    const title = [item.qualification, item.specialization].map(clean).filter(Boolean).join(' - ');
    if (title) lines.push(title);
    const meta = [
      [item.institution, item.university].map(clean).filter(Boolean).join(' | '),
      item.location,
      [item.startYear, item.completionYear].map(clean).filter(Boolean).join(' - '),
      item.grade
    ].map(clean).filter(Boolean).join(' | ');
    if (meta) lines.push(meta);
    lines.push('');
  }
  return section('Education', lines);
}

function buildProjectLines(resume) {
  const lines = [];
  for (const item of resume?.projects || []) {
    if (![item.title, item.role, item.description, item.outcome].some(clean) && !nonEmpty(item.technologies).length) continue;
    if (clean(item.title)) lines.push(clean(item.title));
    if (clean(item.role)) lines.push('Role: ' + clean(item.role));
    if (clean(item.description)) lines.push(clean(item.description));
    if (nonEmpty(item.technologies).length) lines.push('Skills / Technologies: ' + nonEmpty(item.technologies).join(', '));
    if (clean(item.outcome)) lines.push('Outcome: ' + clean(item.outcome));
    lines.push('');
  }
  return section('Projects', lines);
}

function buildInternshipLines(resume) {
  const lines = [];
  for (const item of resume?.internships || []) {
    if (![item.organization, item.title, item.startDate, item.endDate, item.outcome].some(clean) && !nonEmpty(item.responsibilities).length) continue;
    if (clean(item.title)) lines.push(clean(item.title));
    const meta = [
      item.organization,
      [item.startDate, item.endDate].map(clean).filter(Boolean).join(' - ')
    ].map(clean).filter(Boolean).join(' | ');
    if (meta) lines.push(meta);
    lines.push(...bulletLines(item.responsibilities));
    if (clean(item.outcome)) lines.push('Outcome: ' + clean(item.outcome));
    lines.push('');
  }
  return section('Internship / Training', lines);
}

function buildCertificationLines(resume) {
  const lines = [];
  for (const item of resume?.certifications || []) {
    if (![item.name, item.issuer, item.year, item.credential].some(clean)) continue;
    if (clean(item.name)) lines.push(clean(item.name));
    const meta = [item.issuer, item.year, item.credential].map(clean).filter(Boolean).join(' | ');
    if (meta) lines.push(meta);
    lines.push('');
  }
  return section('Certifications', lines);
}

function buildPersonalDetailsLines(resume) {
  if (!resume?.personalDetails?.enabled) return [];
  const lines = [
    ['Date of birth', resume.personalDetails.dateOfBirth],
    ['Languages', nonEmpty(resume.personalDetails.languages).join(', ')],
    ['Nationality', resume.personalDetails.nationality],
    ['Gender', resume.personalDetails.gender],
    ['Marital status', resume.personalDetails.maritalStatus]
  ].filter(([, value]) => clean(value)).map(([label, value]) => label + ': ' + clean(value));
  return section('Personal Details', lines);
}

function buildDeclarationLines(resume) {
  if (!resume?.declaration?.enabled) return [];
  const lines = [];
  if (clean(resume.declaration.text)) lines.push(clean(resume.declaration.text));
  const meta = [resume.declaration.place, resume.declaration.date, resume.declaration.candidateName].map(clean).filter(Boolean).join(' | ');
  if (meta) lines.push(meta);
  return section('Declaration', lines);
}

function sectionLineMap(resume) {
  return {
    careerObjective: clean(resume?.careerObjective?.text)
      ? section('Career Objective', [clean(resume.careerObjective.text)])
      : [],
    summary: clean(resume?.summary?.text)
      ? section(resume.summary.heading || 'Profile', [clean(resume.summary.text)])
      : [],
    skills: nonEmpty(resume?.skills).length
      ? section('Skills', [nonEmpty(resume.skills).join(', ')])
      : [],
    experience: buildExperienceLines(resume),
    education: buildEducationLines(resume),
    projects: buildProjectLines(resume),
    internships: buildInternshipLines(resume),
    certifications: buildCertificationLines(resume),
    achievements: nonEmpty(resume?.achievements).length
      ? section('Achievements', bulletLines(resume.achievements))
      : [],
    interests: nonEmpty(resume?.interests).length
      ? section('Interests', [nonEmpty(resume.interests).join(', ')])
      : [],
    personalDetails: buildPersonalDetailsLines(resume),
    declaration: buildDeclarationLines(resume)
  };
}

export function buildResumeText(resume) {
  const lines = [];
  const name = clean(resume?.contact?.fullName) || 'Candidate Name';
  const role = clean(resume?.candidate?.targetRole);
  const contact = resume?.contact || {};

  lines.push(name);
  if (role) lines.push(role);

  const contactLine = [
    contact.email,
    contact.phone,
    [contact.city, contact.region, contact.country].map(clean).filter(Boolean).join(', '),
    contact.linkedin,
    contact.portfolio
  ].map(clean).filter(Boolean).join(' | ');
  if (contactLine) lines.push(contactLine);

  const map = sectionLineMap(resume);
  const enabled = resume?.settings?.enabledSections || {};
  const order = Array.isArray(resume?.settings?.sectionOrder) ? resume.settings.sectionOrder : [];
  for (const key of order) {
    if (enabled[key] === false) continue;
    lines.push(...(map[key] || []));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function safeFilename(name, extension = 'txt') {
  const ext = clean(extension).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'txt';
  let base = clean(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/^[. ]+|[. ]+$/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'resume';

  const stem = base.replace(/\.[^.]+$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) base = 'resume-' + base;

  return base.toLowerCase().endsWith('.' + ext) ? base : base + '.' + ext;
}

export function downloadResumeText(resume, documentRef = globalThis.document, urlRef = globalThis.URL) {
  if (!documentRef || !urlRef || typeof Blob === 'undefined' || typeof urlRef.createObjectURL !== 'function') {
    return { status: 'unsupported' };
  }

  const text = buildResumeText(resume);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = safeFilename((resume?.contact?.fullName || 'resume') + '-resume', 'txt');
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } catch {
    anchor.remove();
    urlRef.revokeObjectURL(url);
    return { status: 'failed' };
  }

  const filename = anchor.download;
  anchor.remove();
  globalThis.setTimeout(() => urlRef.revokeObjectURL(url), 1000);
  return { status: 'downloaded', filename };
}

export function cleanupPrintResume(documentRef = globalThis.document) {
  const root = documentRef?.querySelector?.('#resume-print-root');
  if (root) root.remove();
}

export function printResume(resume, windowRef = globalThis.window) {
  if (!windowRef || !windowRef.document || typeof windowRef.print !== 'function') {
    return { status: 'unsupported' };
  }

  cleanupPrintResume(windowRef.document);

  const root = windowRef.document.createElement('div');
  root.id = 'resume-print-root';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = buildResumePreviewHtml(resume);
  windowRef.document.body.appendChild(root);

  const cleanup = () => cleanupPrintResume(windowRef.document);
  if (typeof windowRef.addEventListener === 'function') {
    windowRef.addEventListener('afterprint', cleanup, { once: true });
  }
  windowRef.setTimeout?.(cleanup, 60000);

  try {
    windowRef.print();
    return { status: 'opened' };
  } catch {
    cleanup();
    return { status: 'failed' };
  }
}
