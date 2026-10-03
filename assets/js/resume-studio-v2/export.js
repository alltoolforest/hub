import { buildResumePreviewHtml } from './preview.js';

function clean(value) {
  return String(value || '').trim();
}

function nonEmpty(items) {
  return Array.isArray(items) ? items.filter((item) => clean(item)) : [];
}

function line(value) {
  return clean(value);
}

function section(title, bodyLines) {
  const body = bodyLines.filter(Boolean);
  if (!body.length) return [];
  return ['', title.toUpperCase(), ...body];
}

function bulletLines(items) {
  return nonEmpty(items).map((item) => '- ' + clean(item));
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

  if (clean(resume?.summary?.text)) {
    lines.push(...section(resume.summary.heading || 'Profile', [clean(resume.summary.text)]));
  }

  if (nonEmpty(resume?.skills).length) {
    lines.push(...section('Skills', [nonEmpty(resume.skills).join(', ')]));
  }

  if (resume?.candidate?.type === 'experienced') {
    const expLines = [];
    for (const item of resume.experience || []) {
      if (![item.company, item.position, item.location, item.startDate, item.endDate].some(clean) &&
          !nonEmpty(item.responsibilities).length && !nonEmpty(item.achievements).length) continue;
      if (clean(item.position)) expLines.push(clean(item.position));
      const meta = [
        item.company,
        item.location,
        [item.startDate, item.current ? 'Present' : item.endDate].map(clean).filter(Boolean).join(' - ')
      ].map(clean).filter(Boolean).join(' | ');
      if (meta) expLines.push(meta);
      expLines.push(...bulletLines(item.responsibilities));
      if (nonEmpty(item.achievements).length) {
        expLines.push('Achievements:');
        expLines.push(...bulletLines(item.achievements));
      }
      expLines.push('');
    }
    lines.push(...section('Work Experience', expLines));
  }

  const educationLines = [];
  for (const item of resume?.education || []) {
    if (![item.qualification, item.specialization, item.institution, item.university, item.location, item.startYear, item.completionYear, item.grade].some(clean)) continue;
    const title = [item.qualification, item.specialization].map(clean).filter(Boolean).join(' - ');
    if (title) educationLines.push(title);
    const meta = [
      [item.institution, item.university].map(clean).filter(Boolean).join(' | '),
      item.location,
      [item.startYear, item.completionYear].map(clean).filter(Boolean).join(' - '),
      item.grade
    ].map(clean).filter(Boolean).join(' | ');
    if (meta) educationLines.push(meta);
    educationLines.push('');
  }
  lines.push(...section('Education', educationLines));

  const projectLines = [];
  for (const item of resume?.projects || []) {
    if (![item.title, item.role, item.description, item.outcome].some(clean) && !nonEmpty(item.technologies).length) continue;
    if (clean(item.title)) projectLines.push(clean(item.title));
    if (clean(item.role)) projectLines.push('Role: ' + clean(item.role));
    if (clean(item.description)) projectLines.push(clean(item.description));
    if (nonEmpty(item.technologies).length) projectLines.push('Skills / Technologies: ' + nonEmpty(item.technologies).join(', '));
    if (clean(item.outcome)) projectLines.push('Outcome: ' + clean(item.outcome));
    projectLines.push('');
  }
  lines.push(...section('Projects', projectLines));

  const internshipLines = [];
  for (const item of resume?.internships || []) {
    if (![item.organization, item.title, item.startDate, item.endDate, item.outcome].some(clean) && !nonEmpty(item.responsibilities).length) continue;
    if (clean(item.title)) internshipLines.push(clean(item.title));
    const meta = [
      item.organization,
      [item.startDate, item.endDate].map(clean).filter(Boolean).join(' - ')
    ].map(clean).filter(Boolean).join(' | ');
    if (meta) internshipLines.push(meta);
    internshipLines.push(...bulletLines(item.responsibilities));
    if (clean(item.outcome)) internshipLines.push('Outcome: ' + clean(item.outcome));
    internshipLines.push('');
  }
  lines.push(...section('Internship / Training', internshipLines));

  const certLines = [];
  for (const item of resume?.certifications || []) {
    if (![item.name, item.issuer, item.year, item.credential].some(clean)) continue;
    const title = clean(item.name);
    const meta = [item.issuer, item.year, item.credential].map(clean).filter(Boolean).join(' | ');
    if (title) certLines.push(title);
    if (meta) certLines.push(meta);
    certLines.push('');
  }
  lines.push(...section('Certifications', certLines));

  if (nonEmpty(resume?.achievements).length) {
    lines.push(...section('Achievements', bulletLines(resume.achievements)));
  }

  if (resume?.settings?.enabledSections?.interests && nonEmpty(resume?.interests).length) {
    lines.push(...section('Interests', [nonEmpty(resume.interests).join(', ')]));
  }

  if (resume?.personalDetails?.enabled) {
    const details = [
      ['Date of birth', resume.personalDetails.dateOfBirth],
      ['Languages', nonEmpty(resume.personalDetails.languages).join(', ')],
      ['Nationality', resume.personalDetails.nationality],
      ['Gender', resume.personalDetails.gender],
      ['Marital status', resume.personalDetails.maritalStatus]
    ].filter(([, value]) => clean(value)).map(([label, value]) => label + ': ' + clean(value));
    lines.push(...section('Personal Details', details));
  }

  if (resume?.declaration?.enabled) {
    const decl = [];
    if (clean(resume.declaration.text)) decl.push(clean(resume.declaration.text));
    const meta = [resume.declaration.place, resume.declaration.date, resume.declaration.candidateName].map(clean).filter(Boolean).join(' | ');
    if (meta) decl.push(meta);
    lines.push(...section('Declaration', decl));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function safeFilename(name, extension = 'txt') {
  const base = clean(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'resume';
  return base.toLowerCase().endsWith('.' + extension.toLowerCase())
    ? base
    : base + '.' + extension;
}

export function downloadResumeText(resume, documentRef = globalThis.document, urlRef = globalThis.URL) {
  if (!documentRef || !urlRef || typeof Blob === 'undefined') {
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
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => urlRef.revokeObjectURL(url), 0);
  return { status: 'downloaded', filename: anchor.download };
}

export function printResume(resume, windowRef = globalThis.window) {
  if (!windowRef || !windowRef.document || typeof windowRef.print !== 'function') {
    return { status: 'unsupported' };
  }

  const existing = windowRef.document.querySelector('#resume-print-root');
  if (existing) existing.remove();

  const root = windowRef.document.createElement('div');
  root.id = 'resume-print-root';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = buildResumePreviewHtml(resume);
  windowRef.document.body.appendChild(root);

  try {
    windowRef.print();
    return { status: 'opened' };
  } catch {
    root.remove();
    return { status: 'failed' };
  }
}

export function cleanupPrintResume(documentRef = globalThis.document) {
  const root = documentRef?.querySelector?.('#resume-print-root');
  if (root) root.remove();
}
