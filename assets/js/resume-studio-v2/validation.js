export const VALIDATION_LEVELS = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  PASS: 'pass'
});

function clean(value) {
  return String(value || '').trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => clean(item)) : [];
}

function issue(level, code, message, section = '') {
  return Object.freeze({ level, code, message, section });
}

function looksLikeEmail(value) {
  const email = clean(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function phoneDigits(value) {
  return clean(value).replace(/\D/g, '');
}

function validHttpUrl(value) {
  const raw = clean(value);
  if (!raw) return true;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function compareMonth(start, end) {
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) return null;
  return start.localeCompare(end);
}

function compareYear(start, end) {
  if (!/^\d{4}$/.test(start) || !/^\d{4}$/.test(end)) return null;
  return Number(start) - Number(end);
}

function meaningfulEducation(item) {
  return [item?.qualification, item?.institution, item?.completionYear].some(clean);
}

function meaningfulExperience(item) {
  return [item?.company, item?.position, item?.startDate, item?.endDate].some(clean) ||
    list(item?.responsibilities).length > 0;
}

function meaningfulProject(item) {
  return [item?.title, item?.description, item?.outcome].some(clean) ||
    list(item?.technologies).length > 0;
}

export function validateResume(resume) {
  const findings = [];
  const type = resume?.candidate?.type === 'experienced' ? 'experienced' : 'fresher';
  const contact = resume?.contact || {};
  const targetRole = clean(resume?.candidate?.targetRole);
  const careerObjective = clean(resume?.careerObjective?.text);
  const summary = clean(resume?.summary?.text);
  const skills = list(resume?.skills);
  const education = (resume?.education || []).filter(meaningfulEducation);
  const experience = (resume?.experience || []).filter(meaningfulExperience);
  const projects = (resume?.projects || []).filter(meaningfulProject);

  if (!clean(contact.fullName)) findings.push(issue(VALIDATION_LEVELS.ERROR, 'missing-name', 'Add the candidate full name.', 'contact'));
  if (!targetRole) findings.push(issue(VALIDATION_LEVELS.ERROR, 'missing-target-role', 'Add the target position.', 'profile'));
  if (!clean(contact.email)) {
    findings.push(issue(VALIDATION_LEVELS.ERROR, 'missing-email', 'Add an email address.', 'contact'));
  } else if (!looksLikeEmail(contact.email)) {
    findings.push(issue(VALIDATION_LEVELS.ERROR, 'invalid-email', 'Check the email address format.', 'contact'));
  }

  if (clean(contact.phone)) {
    const digits = phoneDigits(contact.phone);
    if (digits.length < 7 || digits.length > 15) {
      findings.push(issue(VALIDATION_LEVELS.WARNING, 'phone-format', 'Check the mobile number; international numbers usually contain 7–15 digits.', 'contact'));
    }
  }

  if (!validHttpUrl(contact.linkedin)) findings.push(issue(VALIDATION_LEVELS.WARNING, 'linkedin-url', 'LinkedIn should use a complete http:// or https:// URL.', 'contact'));
  if (!validHttpUrl(contact.portfolio)) findings.push(issue(VALIDATION_LEVELS.WARNING, 'portfolio-url', 'Portfolio / website should use a complete http:// or https:// URL.', 'contact'));

  if (!careerObjective) {
    findings.push(issue(VALIDATION_LEVELS.WARNING, 'missing-career-objective', 'Add a career objective.', 'careerObjective'));
  } else {
    if (careerObjective.length < 40) findings.push(issue(VALIDATION_LEVELS.INFO, 'short-career-objective', 'The career objective is very short; make sure it clearly states your direction and intended contribution.', 'careerObjective'));
    if (careerObjective.length > 700) findings.push(issue(VALIDATION_LEVELS.WARNING, 'long-career-objective', 'The career objective is long. Consider shortening it for easier scanning.', 'careerObjective'));
  }

  if (type === 'experienced') {
    if (!summary) {
      findings.push(issue(VALIDATION_LEVELS.WARNING, 'missing-summary', 'Add a professional summary.', 'summary'));
    } else {
      if (summary.length < 40) findings.push(issue(VALIDATION_LEVELS.INFO, 'short-summary', 'The professional summary is very short; make sure it explains your relevant value clearly.', 'summary'));
      if (summary.length > 700) findings.push(issue(VALIDATION_LEVELS.WARNING, 'long-summary', 'The professional summary is long. Consider shortening it for easier scanning.', 'summary'));
    }
  }

  if (!skills.length) {
    findings.push(issue(VALIDATION_LEVELS.WARNING, 'missing-skills', 'Add relevant professional or technical skills.', 'skills'));
  } else if (skills.length < 3) {
    findings.push(issue(VALIDATION_LEVELS.INFO, 'few-skills', 'Only a few skills are listed. Add more only if they are genuinely relevant.', 'skills'));
  }

  if (!education.length) {
    findings.push(issue(VALIDATION_LEVELS.ERROR, 'missing-education', 'Add at least one education record.', 'education'));
  }

  education.forEach((item, index) => {
    const label = 'Education ' + (index + 1);
    if (!clean(item.qualification)) findings.push(issue(VALIDATION_LEVELS.WARNING, 'education-qualification-' + index, label + ': add the qualification or degree.', 'education'));
    if (!clean(item.institution)) findings.push(issue(VALIDATION_LEVELS.WARNING, 'education-institution-' + index, label + ': add the institution.', 'education'));
    if (clean(item.startYear) && !/^\d{4}$/.test(clean(item.startYear))) findings.push(issue(VALIDATION_LEVELS.WARNING, 'education-start-year-' + index, label + ': start year should use four digits.', 'education'));
    if (clean(item.completionYear) && !/^\d{4}$/.test(clean(item.completionYear))) findings.push(issue(VALIDATION_LEVELS.WARNING, 'education-end-year-' + index, label + ': completion year should use four digits.', 'education'));
    const order = compareYear(clean(item.startYear), clean(item.completionYear));
    if (order !== null && order > 0) findings.push(issue(VALIDATION_LEVELS.ERROR, 'education-date-order-' + index, label + ': completion year is earlier than the start year.', 'education'));
  });

  if (type === 'experienced') {
    if (!experience.length) {
      findings.push(issue(VALIDATION_LEVELS.ERROR, 'missing-experience', 'Experienced profile: add at least one work experience record.', 'experience'));
    }
    experience.forEach((item, index) => {
      const label = 'Experience ' + (index + 1);
      if (!clean(item.company)) findings.push(issue(VALIDATION_LEVELS.WARNING, 'experience-company-' + index, label + ': add the company or organization.', 'experience'));
      if (!clean(item.position)) findings.push(issue(VALIDATION_LEVELS.WARNING, 'experience-position-' + index, label + ': add the job title.', 'experience'));
      if (!list(item.responsibilities).length) findings.push(issue(VALIDATION_LEVELS.WARNING, 'experience-responsibilities-' + index, label + ': add at least one responsibility.', 'experience'));
      if (item.current && clean(item.endDate)) findings.push(issue(VALIDATION_LEVELS.ERROR, 'current-role-end-date-' + index, label + ': a current role should not have an end date.', 'experience'));
      if (!item.current && clean(item.startDate) && clean(item.endDate)) {
        const order = compareMonth(clean(item.startDate), clean(item.endDate));
        if (order !== null && order > 0) findings.push(issue(VALIDATION_LEVELS.ERROR, 'experience-date-order-' + index, label + ': end date is earlier than the start date.', 'experience'));
      }
    });
  } else {
    if (!projects.length && !(resume?.internships || []).some((item) => clean(item?.organization) || clean(item?.title) || list(item?.responsibilities).length)) {
      findings.push(issue(VALIDATION_LEVELS.INFO, 'fresher-evidence', 'Consider adding a truthful project, internship or training record to strengthen the fresher resume.', 'projects'));
    }
  }

  (resume?.internships || []).forEach((item, index) => {
    if (clean(item?.startDate) && clean(item?.endDate)) {
      const order = compareMonth(clean(item.startDate), clean(item.endDate));
      if (order !== null && order > 0) findings.push(issue(VALIDATION_LEVELS.ERROR, 'internship-date-order-' + index, 'Internship / Training ' + (index + 1) + ': end date is earlier than the start date.', 'internships'));
    }
  });

  if (resume?.settings?.enabledSections?.personalDetails && !resume?.personalDetails?.enabled) {
    findings.push(issue(VALIDATION_LEVELS.WARNING, 'personal-details-state', 'Personal Details is enabled in settings but not enabled in the resume data.', 'personalDetails'));
  }

  if (resume?.settings?.enabledSections?.declaration && !resume?.declaration?.enabled) {
    findings.push(issue(VALIDATION_LEVELS.WARNING, 'declaration-state', 'Declaration is enabled in settings but not enabled in the resume data.', 'declaration'));
  }

  findings.push(issue(VALIDATION_LEVELS.PASS, 'ats-linear-layout', 'Template uses a linear single-column resume reading order.', 'ats'));
  findings.push(issue(VALIDATION_LEVELS.PASS, 'ats-standard-headings', 'Resume uses recognizable section headings.', 'ats'));
  findings.push(issue(VALIDATION_LEVELS.PASS, 'ats-text-content', 'Resume content remains text-based rather than embedded in images.', 'ats'));

  return findings;
}

export function summarizeValidation(findings) {
  const counts = { error: 0, warning: 0, info: 0, pass: 0 };
  for (const finding of findings || []) {
    if (Object.prototype.hasOwnProperty.call(counts, finding.level)) counts[finding.level] += 1;
  }
  return Object.freeze(counts);
}
