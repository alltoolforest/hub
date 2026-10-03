import { getTemplateById } from './templates/index.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value) {
  return String(value || '').trim();
}

function nonEmpty(items) {
  return Array.isArray(items) ? items.filter((item) => clean(item)) : [];
}

function contactLine(contact) {
  return [
    contact.email,
    contact.phone,
    [contact.city, contact.region, contact.country].filter(Boolean).join(', '),
    contact.linkedin,
    contact.portfolio
  ].map(clean).filter(Boolean);
}

function bullets(items) {
  const values = nonEmpty(items);
  return values.length ? '<ul>' + values.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>' : '';
}

function section(title, body, className = '') {
  if (!body) return '';
  return '<section class="resume-section ' + esc(className) + '"><h2>' + esc(title) + '</h2>' + body + '</section>';
}

function experienceSection(items) {
  const records = (items || []).filter((item) =>
    [item.company, item.position, item.location, item.startDate, item.endDate].some(clean) ||
    nonEmpty(item.responsibilities).length || nonEmpty(item.achievements).length
  );
  if (!records.length) return '';
  return section('Work Experience', records.map((item) => {
    const dates = [item.startDate, item.current ? 'Present' : item.endDate].filter(Boolean).join(' – ');
    const meta = [item.company, item.location, dates].map(clean).filter(Boolean).join(' · ');
    return '<article class="resume-entry">' +
      (clean(item.position) ? '<h3>' + esc(item.position) + '</h3>' : '') +
      (meta ? '<p class="resume-meta">' + esc(meta) + '</p>' : '') +
      bullets(item.responsibilities) +
      (nonEmpty(item.achievements).length ? '<div class="resume-subgroup"><h4>Achievements</h4>' + bullets(item.achievements) + '</div>' : '') +
      '</article>';
  }).join(''));
}

function educationSection(items) {
  const records = (items || []).filter((item) =>
    [item.qualification, item.specialization, item.institution, item.university, item.location, item.startYear, item.completionYear, item.grade].some(clean)
  );
  if (!records.length) return '';
  return section('Education', records.map((item) => {
    const title = [item.qualification, item.specialization].map(clean).filter(Boolean).join(' — ');
    const org = [item.institution, item.university].map(clean).filter(Boolean).join(' · ');
    const dates = [item.startYear, item.completionYear].map(clean).filter(Boolean).join(' – ');
    const meta = [org, item.location, dates, item.grade].map(clean).filter(Boolean).join(' · ');
    return '<article class="resume-entry">' +
      (title ? '<h3>' + esc(title) + '</h3>' : '') +
      (meta ? '<p class="resume-meta">' + esc(meta) + '</p>' : '') +
      '</article>';
  }).join(''));
}

function projectsSection(items) {
  const records = (items || []).filter((item) =>
    [item.title, item.role, item.description, item.outcome].some(clean) || nonEmpty(item.technologies).length
  );
  if (!records.length) return '';
  return section('Projects', records.map((item) => {
    const tech = nonEmpty(item.technologies);
    return '<article class="resume-entry">' +
      (clean(item.title) ? '<h3>' + esc(item.title) + '</h3>' : '') +
      (clean(item.role) ? '<p class="resume-meta">' + esc(item.role) + '</p>' : '') +
      (clean(item.description) ? '<p>' + esc(item.description) + '</p>' : '') +
      (tech.length ? '<p><strong>Skills / Technologies:</strong> ' + tech.map(esc).join(', ') + '</p>' : '') +
      (clean(item.outcome) ? '<p><strong>Outcome:</strong> ' + esc(item.outcome) + '</p>' : '') +
      '</article>';
  }).join(''));
}

function internshipsSection(items) {
  const records = (items || []).filter((item) =>
    [item.organization, item.title, item.startDate, item.endDate, item.outcome].some(clean) ||
    nonEmpty(item.responsibilities).length
  );
  if (!records.length) return '';
  return section('Internship / Training', records.map((item) => {
    const dates = [item.startDate, item.endDate].map(clean).filter(Boolean).join(' – ');
    const meta = [item.organization, dates].map(clean).filter(Boolean).join(' · ');
    return '<article class="resume-entry">' +
      (clean(item.title) ? '<h3>' + esc(item.title) + '</h3>' : '') +
      (meta ? '<p class="resume-meta">' + esc(meta) + '</p>' : '') +
      bullets(item.responsibilities) +
      (clean(item.outcome) ? '<p><strong>Outcome:</strong> ' + esc(item.outcome) + '</p>' : '') +
      '</article>';
  }).join(''));
}

function certificationsSection(items) {
  const records = (items || []).filter((item) =>
    [item.name, item.issuer, item.year, item.credential].some(clean)
  );
  if (!records.length) return '';
  return section('Certifications', records.map((item) => {
    const meta = [item.issuer, item.year, item.credential].map(clean).filter(Boolean).join(' · ');
    return '<article class="resume-entry">' +
      (clean(item.name) ? '<h3>' + esc(item.name) + '</h3>' : '') +
      (meta ? '<p class="resume-meta">' + esc(meta) + '</p>' : '') +
      '</article>';
  }).join(''));
}

function personalDetailsSection(details) {
  if (!details?.enabled) return '';
  const rows = [
    ['Date of birth', details.dateOfBirth],
    ['Languages', nonEmpty(details.languages).join(', ')],
    ['Nationality', details.nationality],
    ['Gender', details.gender],
    ['Marital status', details.maritalStatus]
  ].filter(([, value]) => clean(value));
  if (!rows.length) return '';
  return section('Personal Details', '<dl class="resume-details">' +
    rows.map(([label, value]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>').join('') +
    '</dl>');
}

function declarationSection(declaration) {
  if (!declaration?.enabled) return '';
  const body = [
    clean(declaration.text) ? '<p>' + esc(declaration.text) + '</p>' : '',
    [declaration.place, declaration.date, declaration.candidateName].map(clean).filter(Boolean).length
      ? '<p class="resume-meta">' + [declaration.place, declaration.date, declaration.candidateName].map(clean).filter(Boolean).map(esc).join(' · ') + '</p>'
      : ''
  ].join('');
  return section('Declaration', body);
}

function sectionMap(resume) {
  return {
    summary: clean(resume.summary?.text)
      ? section(resume.summary.heading || 'Profile', '<p>' + esc(resume.summary.text) + '</p>')
      : '',
    skills: nonEmpty(resume.skills).length
      ? section('Skills', '<p class="resume-skills">' + nonEmpty(resume.skills).map(esc).join(' · ') + '</p>')
      : '',
    experience: experienceSection(resume.experience),
    education: educationSection(resume.education),
    projects: projectsSection(resume.projects),
    internships: internshipsSection(resume.internships),
    certifications: certificationsSection(resume.certifications),
    achievements: nonEmpty(resume.achievements).length ? section('Achievements', bullets(resume.achievements)) : '',
    interests: resume.settings?.enabledSections?.interests && nonEmpty(resume.interests).length
      ? section('Interests', '<p>' + nonEmpty(resume.interests).map(esc).join(' · ') + '</p>')
      : '',
    personalDetails: personalDetailsSection(resume.personalDetails),
    declaration: declarationSection(resume.declaration)
  };
}

export function buildResumePreviewHtml(resume) {
  const template = getTemplateById(resume.settings?.template);
  const sections = sectionMap(resume);
  const enabled = resume.settings?.enabledSections || {};
  const order = Array.isArray(resume.settings?.sectionOrder) ? resume.settings.sectionOrder : [];
  const body = order
    .filter((key) => enabled[key] !== false)
    .map((key) => sections[key] || '')
    .join('');

  const name = clean(resume.contact?.fullName) || 'Candidate Name';
  const targetRole = clean(resume.candidate?.targetRole);
  const contacts = contactLine(resume.contact || {});

  return '<article class="resume-document ' + esc(template.className) + '" data-template="' + esc(template.id) + '" aria-label="Resume preview">' +
    '<header class="resume-header">' +
      '<h1>' + esc(name) + '</h1>' +
      (targetRole ? '<p class="resume-target-role">' + esc(targetRole) + '</p>' : '') +
      (contacts.length ? '<p class="resume-contact">' + contacts.map(esc).join(' · ') + '</p>' : '') +
    '</header>' +
    body +
  '</article>';
}

export function renderResumePreview(host, resume) {
  if (!host) return;
  host.innerHTML = buildResumePreviewHtml(resume);
}
