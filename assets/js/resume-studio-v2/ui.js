import { downloadResumeText, printResume } from './export.js';
import { summarizeValidation, validateResume } from './validation.js';
import { clearResumeDraft } from './storage.js';
import { renderResumePreview } from './preview.js';
import { TEMPLATE_CATALOG, isTemplateId } from './templates/index.js';
import { getRoleSuggestions, getTargetRoleSuggestions } from './role-engine.js';
import { CONTENT_PROVENANCE, createSuggestedUnit, generateAutomaticIntroduction, refineBulletList, refineSummary, verifySuggestion } from './content-engine.js';
import { CANDIDATE_TYPES } from './schema.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textList(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function multiline(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function setPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = value;
}

function experienceItem() {
  return {
    company: '',
    position: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    responsibilities: [],
    achievements: [],
    responsibilityProvenance: [],
    achievementProvenance: []
  };
}

function educationItem() {
  return {
    qualification: '',
    specialization: '',
    institution: '',
    university: '',
    location: '',
    startYear: '',
    completionYear: '',
    grade: ''
  };
}

function projectItem() {
  return {
    title: '',
    role: '',
    description: '',
    technologies: [],
    outcome: '',
    descriptionProvenance: CONTENT_PROVENANCE.USER,
    outcomeProvenance: CONTENT_PROVENANCE.USER
  };
}

function internshipItem() {
  return {
    organization: '',
    title: '',
    startDate: '',
    endDate: '',
    responsibilities: [],
    outcome: '',
    responsibilityProvenance: [],
    outcomeProvenance: CONTENT_PROVENANCE.USER
  };
}

function certificationItem() {
  return {
    name: '',
    issuer: '',
    year: '',
    credential: ''
  };
}

function renderExperience(items) {
  if (!items.length) {
    return '<p class="rs-empty">No work experience added yet.</p>';
  }
  return items.map((item, index) => `
    <article class="rs-entry" data-entry="experience" data-index="${index}">
      <div class="rs-entry-head"><h3>Experience ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="experience" data-index="${index}" aria-label="Remove experience ${index + 1}">Remove</button></div>
      <div class="rs-grid">
        <label>Company / Organization<input data-array="experience" data-index="${index}" data-key="company" maxlength="120" value="${esc(item.company)}"></label>
        <label>Position / Job Title<input data-array="experience" data-index="${index}" data-key="position" maxlength="120" value="${esc(item.position)}"></label>
        <label>Location <span>(optional)</span><input data-array="experience" data-index="${index}" data-key="location" maxlength="120" value="${esc(item.location)}"></label>
        <label>Start month<input type="month" data-array="experience" data-index="${index}" data-key="startDate" value="${esc(item.startDate)}"></label>
        <label>End month<input type="month" data-array="experience" data-index="${index}" data-key="endDate" value="${esc(item.endDate)}" ${item.current ? 'disabled' : ''}></label>
        <label class="rs-check"><input type="checkbox" data-array="experience" data-index="${index}" data-key="current" ${item.current ? 'checked' : ''}>Currently working here</label>
        <label class="rs-full">Roles &amp; Responsibilities<textarea rows="5" data-array="experience" data-index="${index}" data-key="responsibilities" data-kind="list" maxlength="2500" placeholder="One responsibility per line">${esc(multiline(item.responsibilities))}</textarea></label>
        <div class="rs-full rs-content-actions">
          <button type="button" class="rs-secondary" data-refine-responsibilities data-index="${index}">Refine these responsibilities</button>
          <button type="button" class="rs-secondary" data-show-responsibility-suggestions data-index="${index}">Show role ideas</button>
        </div>
        <div class="rs-full" data-responsibility-suggestions-host="${index}" aria-live="polite"></div>
        <label class="rs-full">Achievements <span>(optional)</span><textarea rows="4" data-array="experience" data-index="${index}" data-key="achievements" data-kind="list" maxlength="1800" placeholder="One truthful achievement per line">${esc(multiline(item.achievements))}</textarea></label>
      </div>
    </article>`).join('');
}

function renderEducation(items) {
  if (!items.length) return '<p class="rs-empty">No education record added yet.</p>';
  return items.map((item, index) => `
    <article class="rs-entry" data-entry="education" data-index="${index}">
      <div class="rs-entry-head"><h3>Education ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="education" data-index="${index}" aria-label="Remove education ${index + 1}">Remove</button></div>
      <div class="rs-grid">
        <label>Qualification / Degree<input data-array="education" data-index="${index}" data-key="qualification" maxlength="120" value="${esc(item.qualification)}"></label>
        <label>Specialization <span>(optional)</span><input data-array="education" data-index="${index}" data-key="specialization" maxlength="120" value="${esc(item.specialization)}"></label>
        <label>Institution<input data-array="education" data-index="${index}" data-key="institution" maxlength="160" value="${esc(item.institution)}"></label>
        <label>University / Board <span>(optional)</span><input data-array="education" data-index="${index}" data-key="university" maxlength="160" value="${esc(item.university)}"></label>
        <label>Location <span>(optional)</span><input data-array="education" data-index="${index}" data-key="location" maxlength="120" value="${esc(item.location)}"></label>
        <label>Start year <span>(optional)</span><input inputmode="numeric" data-array="education" data-index="${index}" data-key="startYear" maxlength="4" value="${esc(item.startYear)}"></label>
        <label>Completion year<input inputmode="numeric" data-array="education" data-index="${index}" data-key="completionYear" maxlength="4" value="${esc(item.completionYear)}"></label>
        <label>Grade / CGPA / Percentage <span>(optional)</span><input data-array="education" data-index="${index}" data-key="grade" maxlength="40" value="${esc(item.grade)}"></label>
      </div>
    </article>`).join('');
}

function renderProjects(items) {
  if (!items.length) return '<p class="rs-empty">No project added yet.</p>';
  return items.map((item, index) => `
    <article class="rs-entry">
      <div class="rs-entry-head"><h3>Project ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="projects" data-index="${index}" aria-label="Remove project ${index + 1}">Remove</button></div>
      <div class="rs-grid">
        <label>Project title<input data-array="projects" data-index="${index}" data-key="title" maxlength="140" value="${esc(item.title)}"></label>
        <label>Your role <span>(optional)</span><input data-array="projects" data-index="${index}" data-key="role" maxlength="120" value="${esc(item.role)}"></label>
        <label class="rs-full">Description<textarea rows="4" data-array="projects" data-index="${index}" data-key="description" maxlength="1400">${esc(item.description)}</textarea></label>
        <label class="rs-full">Technologies / Skills<textarea rows="3" data-array="projects" data-index="${index}" data-key="technologies" data-kind="list" maxlength="800" placeholder="One per line">${esc(multiline(item.technologies))}</textarea></label>
        <label class="rs-full">Outcome <span>(optional)</span><textarea rows="3" data-array="projects" data-index="${index}" data-key="outcome" maxlength="800">${esc(item.outcome)}</textarea></label>
      </div>
    </article>`).join('');
}

function renderInternships(items) {
  if (!items.length) return '<p class="rs-empty">No internship or training added yet.</p>';
  return items.map((item, index) => `
    <article class="rs-entry">
      <div class="rs-entry-head"><h3>Internship / Training ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="internships" data-index="${index}" aria-label="Remove internship or training ${index + 1}">Remove</button></div>
      <div class="rs-grid">
        <label>Organization<input data-array="internships" data-index="${index}" data-key="organization" maxlength="140" value="${esc(item.organization)}"></label>
        <label>Program / Title<input data-array="internships" data-index="${index}" data-key="title" maxlength="140" value="${esc(item.title)}"></label>
        <label>Start month <span>(optional)</span><input type="month" data-array="internships" data-index="${index}" data-key="startDate" value="${esc(item.startDate)}"></label>
        <label>End month <span>(optional)</span><input type="month" data-array="internships" data-index="${index}" data-key="endDate" value="${esc(item.endDate)}"></label>
        <label class="rs-full">Responsibilities / Learning<textarea rows="4" data-array="internships" data-index="${index}" data-key="responsibilities" data-kind="list" maxlength="1600" placeholder="One point per line">${esc(multiline(item.responsibilities))}</textarea></label>
        <label class="rs-full">Outcome <span>(optional)</span><textarea rows="3" data-array="internships" data-index="${index}" data-key="outcome" maxlength="800">${esc(item.outcome)}</textarea></label>
      </div>
    </article>`).join('');
}

function renderCertifications(items) {
  if (!items.length) return '<p class="rs-empty">No certification added yet.</p>';
  return items.map((item, index) => `
    <article class="rs-entry">
      <div class="rs-entry-head"><h3>Certification ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="certifications" data-index="${index}" aria-label="Remove certification ${index + 1}">Remove</button></div>
      <div class="rs-grid">
        <label>Certification<input data-array="certifications" data-index="${index}" data-key="name" maxlength="160" value="${esc(item.name)}"></label>
        <label>Issuing organization<input data-array="certifications" data-index="${index}" data-key="issuer" maxlength="160" value="${esc(item.issuer)}"></label>
        <label>Completion year <span>(optional)</span><input inputmode="numeric" data-array="certifications" data-index="${index}" data-key="year" maxlength="4" value="${esc(item.year)}"></label>
        <label>Credential URL / ID <span>(optional)</span><input data-array="certifications" data-index="${index}" data-key="credential" maxlength="240" value="${esc(item.credential)}"></label>
      </div>
    </article>`).join('');
}

function templateOptions(state) {
  return TEMPLATE_CATALOG.map((template) => `
    <label class="rs-template-option">
      <input type="radio" name="resume-template" value="${esc(template.id)}" ${state.settings.template === template.id ? 'checked' : ''}>
      <span><strong>${esc(template.name)}</strong><small>${esc(template.description)}</small></span>
    </label>`).join('');
}

function render(root, state) {
  const experienced = state.candidate.type === CANDIDATE_TYPES.EXPERIENCED;
  root.innerHTML = `
    <form id="rs-v2-form" class="rs-shell" novalidate>
      <div class="rs-progress" aria-label="Resume information steps">
        <span class="active">1. Profile</span><span>2. Content</span><span>3. Template</span><span>4. Review</span>
      </div>

      <section class="rs-storage-bar" aria-labelledby="rs-storage-heading">
        <div>
          <strong id="rs-storage-heading">Local draft</strong>
          <p id="rs-storage-status" role="status" aria-live="polite">Your resume draft is saved only in this browser on this device. It is not uploaded to AllToolForest.</p>
          <p class="rs-storage-warning">Avoid local draft saving on a shared or public device because resume information can remain in that browser until cleared.</p>
        </div>
        <div class="rs-storage-actions">
          <button type="button" class="rs-secondary" data-restore-draft hidden>Restore saved draft</button>
          <button type="button" class="rs-secondary" data-clear-draft>Clear saved draft &amp; start new</button>
        </div>
      </section>

      <section class="rs-panel" aria-labelledby="rs-start-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Start here</p><h2 id="rs-start-heading">Candidate profile</h2></div></div>
        <div class="rs-grid">
          <label>Candidate type
            <select id="candidate-type" name="candidateType">
              <option value="fresher" ${!experienced ? 'selected' : ''}>Fresher</option>
              <option value="experienced" ${experienced ? 'selected' : ''}>Experienced</option>
            </select>
          </label>
          <label>Target position
            <input id="target-role" name="targetRole" maxlength="120" required autocomplete="organization-title" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="target-role-suggestions-list" aria-describedby="target-role-help target-role-suggestions-status" value="${esc(state.candidate.targetRole)}" placeholder="e.g. SAP, Financial Crime Analyst">
            <div id="target-role-suggestions" class="rs-inline-suggestions">
              <span id="target-role-suggestions-status" class="rs-sr-only" aria-live="polite"></span>
            </div>
          </label>
        </div>
        <p class="rs-help" id="target-role-help">Start typing a role keyword such as SAP, Data, Quality or AML. Resume Studio will suggest matching target positions and generate role-based draft content without inventing your employers, dates, qualifications, achievements or metrics.</p>
      </section>

      <section class="rs-panel" aria-labelledby="rs-contact-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Essential details</p><h2 id="rs-contact-heading">Candidate name &amp; contact details</h2></div></div>
        <div class="rs-grid">
          <label>Full name<input data-path="contact.fullName" autocomplete="name" maxlength="120" required value="${esc(state.contact.fullName)}"></label>
          <label>Email<input type="email" data-path="contact.email" autocomplete="email" maxlength="160" required value="${esc(state.contact.email)}"></label>
          <label>Mobile number<input type="tel" data-path="contact.phone" autocomplete="tel" maxlength="40" value="${esc(state.contact.phone)}"></label>
          <label>City<input data-path="contact.city" autocomplete="address-level2" maxlength="100" value="${esc(state.contact.city)}"></label>
          <label>State / Region<input data-path="contact.region" autocomplete="address-level1" maxlength="100" value="${esc(state.contact.region)}"></label>
          <label>Country<input data-path="contact.country" autocomplete="country-name" maxlength="100" value="${esc(state.contact.country)}"></label>
          <label>LinkedIn <span>(optional)</span><input type="url" data-path="contact.linkedin" maxlength="240" value="${esc(state.contact.linkedin)}" placeholder="https://linkedin.com/in/..."></label>
          <label>Portfolio / Website <span>(optional)</span><input type="url" data-path="contact.portfolio" maxlength="240" value="${esc(state.contact.portfolio)}" placeholder="https://..."></label>
        </div>
      </section>

      <section class="rs-panel" aria-labelledby="rs-summary-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">${experienced ? 'Experienced profile' : 'Fresher profile'}</p><h2 id="rs-summary-heading">${esc(state.summary.heading)}</h2></div></div>
        <label class="rs-block">${experienced ? 'Professional summary' : 'Career objective'}
          <textarea data-path="summary.text" rows="6" maxlength="1800" placeholder="${experienced ? 'Summarize your experience, domain, strengths and evidence you can support.' : 'Describe your education, relevant skills, training/projects and career interest.'}">${esc(state.summary.text)}</textarea>
        </label>
        <div class="rs-content-actions">
          <button type="button" class="rs-secondary" data-refine-summary>Refine from my facts</button>
          <span class="rs-provenance" data-provenance="${esc(state.summary.provenance || 'user')}">${esc((state.summary.provenance || 'user').toUpperCase())}</span>
        </div>
        <p class="rs-help">${experienced ? 'A role-based professional summary is generated automatically. Keep it, add your own verified points, or refine it.' : 'A role-based career objective is generated automatically. Keep it, refine it, or replace it with your own objective.'}</p>
      </section>

      <section class="rs-panel" aria-labelledby="rs-skills-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Core section</p><h2 id="rs-skills-heading">Skills</h2></div></div>
        <label class="rs-block">Professional / technical skills
          <textarea data-list-path="skills" rows="5" maxlength="1600" placeholder="Enter one skill per line">${esc(multiline(state.skills))}</textarea>
        </label>
        <div class="rs-suggestion-area">
          <div class="rs-content-actions"><button type="button" class="rs-secondary" data-show-role-suggestions>Refresh skill suggestions</button></div>
          <div id="rs-role-suggestions" aria-live="polite"></div>
        </div>
      </section>

      ${experienced ? `
      <section class="rs-panel" aria-labelledby="rs-experience-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Experienced profile</p><h2 id="rs-experience-heading">Work Experience</h2></div><button type="button" class="rs-secondary" data-add="experience">+ Add experience</button></div>
        <div id="experience-list">${renderExperience(state.experience)}</div>
      </section>` : `
      <section class="rs-panel" aria-labelledby="rs-projects-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Fresher profile</p><h2 id="rs-projects-heading">Projects</h2></div><button type="button" class="rs-secondary" data-add="projects">+ Add project</button></div>
        <div id="projects-list">${renderProjects(state.projects)}</div>
      </section>
      <section class="rs-panel" aria-labelledby="rs-internships-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Fresher profile</p><h2 id="rs-internships-heading">Internship / Training</h2></div><button type="button" class="rs-secondary" data-add="internships">+ Add internship / training</button></div>
        <div id="internships-list">${renderInternships(state.internships)}</div>
      </section>`}

      <section class="rs-panel" aria-labelledby="rs-education-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Core section</p><h2 id="rs-education-heading">Education</h2></div><button type="button" class="rs-secondary" data-add="education">+ Add education</button></div>
        <div id="education-list">${renderEducation(state.education)}</div>
      </section>

      <section class="rs-panel" aria-labelledby="rs-cert-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Optional</p><h2 id="rs-cert-heading">Certifications</h2></div><button type="button" class="rs-secondary" data-add="certifications">+ Add certification</button></div>
        <div id="certifications-list">${renderCertifications(state.certifications)}</div>
      </section>

      <section class="rs-panel" aria-labelledby="rs-extra-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Optional</p><h2 id="rs-extra-heading">Achievements &amp; Interests</h2></div></div>
        <div class="rs-grid">
          <label class="rs-full">Achievements<textarea data-list-path="achievements" rows="4" maxlength="1500" placeholder="One truthful achievement per line">${esc(multiline(state.achievements))}</textarea></label>
          <label class="rs-full">Interests<textarea data-list-path="interests" rows="3" maxlength="800" placeholder="Optional; one interest per line">${esc(multiline(state.interests))}</textarea></label>
        </div>
      </section>

      <section class="rs-panel" aria-labelledby="rs-personal-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Optional &amp; region-dependent</p><h2 id="rs-personal-heading">Personal Details</h2></div></div>
        <label class="rs-switch"><input type="checkbox" data-toggle-section="personalDetails" ${state.personalDetails.enabled ? 'checked' : ''}> Include personal details</label>
        <p class="rs-help">These details are not required in many countries. Include them only when appropriate for the application.</p>
        <div class="rs-grid ${state.personalDetails.enabled ? '' : 'rs-disabled-block'}" aria-disabled="${state.personalDetails.enabled ? 'false' : 'true'}">
          <label>Date of birth<input type="date" data-path="personalDetails.dateOfBirth" ${state.personalDetails.enabled ? '' : 'disabled'} value="${esc(state.personalDetails.dateOfBirth)}"></label>
          <label>Languages<textarea rows="3" data-list-path="personalDetails.languages" ${state.personalDetails.enabled ? '' : 'disabled'}>${esc(multiline(state.personalDetails.languages))}</textarea></label>
          <label>Nationality<input data-path="personalDetails.nationality" maxlength="80" ${state.personalDetails.enabled ? '' : 'disabled'} value="${esc(state.personalDetails.nationality)}"></label>
          <label>Gender<input data-path="personalDetails.gender" maxlength="80" ${state.personalDetails.enabled ? '' : 'disabled'} value="${esc(state.personalDetails.gender)}"></label>
          <label>Marital status<input data-path="personalDetails.maritalStatus" maxlength="80" ${state.personalDetails.enabled ? '' : 'disabled'} value="${esc(state.personalDetails.maritalStatus)}"></label>
        </div>
      </section>

      <section class="rs-panel" aria-labelledby="rs-declaration-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Auto-created</p><h2 id="rs-declaration-heading">Declaration</h2></div></div>
        <label class="rs-switch"><input type="checkbox" data-toggle-section="declaration" ${state.declaration.enabled ? 'checked' : ''}> Include declaration</label>
        <div class="rs-grid ${state.declaration.enabled ? '' : 'rs-disabled-block'}" aria-disabled="${state.declaration.enabled ? 'false' : 'true'}">
          <label class="rs-full">Declaration text <span>(editable)</span><textarea rows="3" data-path="declaration.text" maxlength="700" ${state.declaration.enabled ? '' : 'disabled'}>${esc(state.declaration.text)}</textarea></label>
          <label>Place<input data-path="declaration.place" maxlength="100" ${state.declaration.enabled ? '' : 'disabled'} value="${esc(state.declaration.place)}"></label>
          <label>Date<input type="date" data-path="declaration.date" ${state.declaration.enabled ? '' : 'disabled'} value="${esc(state.declaration.date)}"></label>
          <label>Candidate name<input data-path="declaration.candidateName" maxlength="120" ${state.declaration.enabled ? '' : 'disabled'} value="${esc(state.declaration.candidateName)}"></label>
        </div>
      </section>

      <section class="rs-panel" aria-labelledby="rs-template-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Template</p><h2 id="rs-template-heading">Choose a resume template</h2></div></div>
        <div class="rs-template-grid" role="radiogroup" aria-label="Resume template">${templateOptions(state)}</div>
        <p class="rs-help">All four templates use the same resume data and a linear single-column reading order. Switching templates changes presentation only.</p>
      </section>

      <section class="rs-panel" aria-labelledby="rs-quality-heading">
        <div class="rs-section-head">
          <div><p class="rs-kicker">Quality check</p><h2 id="rs-quality-heading">Resume review</h2></div>
          <button type="button" class="rs-secondary" data-run-validation>Review resume</button>
        </div>
        <p class="rs-help">This checker uses deterministic rules. It does not provide a fake ATS percentage or guarantee employer-system acceptance.</p>
        <div id="rs-validation-results" aria-live="polite"></div>
      </section>

      <section class="rs-panel rs-preview-panel" aria-labelledby="rs-preview-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Live preview</p><h2 id="rs-preview-heading">Resume preview</h2></div></div>
        <div class="rs-export-actions" aria-label="Resume export options">
          <button type="button" class="rs-secondary" data-print-resume>Print / Save as PDF</button>
          <button type="button" class="rs-secondary" data-download-txt>Download TXT</button>
        </div>
        <p class="rs-help">For PDF, use your browser's print dialog and choose Save as PDF when available. The export prints HTML text rather than taking a screenshot, which is designed to keep the PDF selectable and searchable where the browser supports it.</p>
        <div class="rs-preview-frame" id="rs-preview-host"></div>
      </section>

      <div class="rs-task-note" role="status" aria-live="polite" id="rs-state-status">Resume data stays in this browser. Suggested content is never added automatically.</div>
    </form>
  `;
  renderResumePreview(root.querySelector('#rs-preview-host'), state);
}



function validationLabel(level) {
  if (level === 'error') return 'Needs attention';
  if (level === 'warning') return 'Review';
  if (level === 'info') return 'Suggestion';
  return 'Passed';
}

function renderValidationResults(root, state) {
  const host = root.querySelector('#rs-validation-results');
  if (!host) return;
  const findings = validateResume(state);
  const summary = summarizeValidation(findings);
  const actionable = findings.filter((item) => item.level !== 'pass');
  const passed = findings.filter((item) => item.level === 'pass');

  host.innerHTML = `
    <div class="rs-validation-summary" role="status">
      <strong>${summary.error} required issue${summary.error === 1 ? '' : 's'}, ${summary.warning} warning${summary.warning === 1 ? '' : 's'}, ${summary.info} suggestion${summary.info === 1 ? '' : 's'}</strong>
    </div>
    ${actionable.length ? `<ul class="rs-validation-list">${actionable.map((item) => `
      <li data-level="${esc(item.level)}"><span class="rs-validation-level">${esc(validationLabel(item.level))}</span><span>${esc(item.message)}</span></li>`).join('')}</ul>` : '<p class="rs-validation-clear">No required issues or warnings were found by the current checks.</p>'}
    <details class="rs-validation-passes"><summary>Structural checks passed (${passed.length})</summary>
      <ul class="rs-validation-list">${passed.map((item) => `<li data-level="pass"><span class="rs-validation-level">Passed</span><span>${esc(item.message)}</span></li>`).join('')}</ul>
    </details>
  `;
}

function closeTargetRoleSuggestions(root) {
  const host = root.querySelector('#target-role-suggestions');
  const input = root.querySelector('#target-role');
  if (host) {
    host.innerHTML = '<span id="target-role-suggestions-status" class="rs-sr-only" aria-live="polite"></span>';
  }
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
}

function setActiveTargetRoleOption(root, index) {
  const input = root.querySelector('#target-role');
  const options = Array.from(root.querySelectorAll('[data-target-role-option]'));
  if (!input || !options.length) return -1;
  const safeIndex = ((index % options.length) + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === safeIndex;
    option.setAttribute('aria-selected', active ? 'true' : 'false');
    option.dataset.active = active ? 'true' : 'false';
  });
  input.setAttribute('aria-activedescendant', options[safeIndex].id);
  options[safeIndex].scrollIntoView?.({ block: 'nearest' });
  return safeIndex;
}

function renderTargetRoleSuggestions(root, query) {
  const host = root.querySelector('#target-role-suggestions');
  const input = root.querySelector('#target-role');
  if (!host || !input) return [];

  const normalized = String(query || '').trim();
  if (normalized.length < 2) {
    closeTargetRoleSuggestions(root);
    return [];
  }

  const roles = getTargetRoleSuggestions(normalized, 8);
  if (!roles.length) {
    host.innerHTML =
      '<span id="target-role-suggestions-status" class="rs-sr-only" aria-live="polite">No matching target positions. You can keep your own job title.</span>' +
      '<div class="rs-inline-empty">No matching role found. You can keep your own target position.</div>';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    return [];
  }

  host.innerHTML =
    '<span id="target-role-suggestions-status" class="rs-sr-only" aria-live="polite">' + roles.length + ' target position suggestions available. Use Arrow Down and Arrow Up to review them, then Enter to select.</span>' +
    '<div id="target-role-suggestions-list" class="rs-inline-suggestion-list" role="listbox" aria-label="Target position suggestions">' +
    roles.map((role, index) =>
      '<div id="target-role-option-' + index + '" class="rs-inline-suggestion" role="option" aria-selected="false" data-target-role-option="' + esc(role) + '">' + esc(role) + '</div>'
    ).join('') +
    '</div>';
  input.setAttribute('aria-expanded', 'true');
  input.removeAttribute('aria-activedescendant');
  return roles;
}

function renderRoleSuggestions(root, state) {
  const host = root.querySelector('#rs-role-suggestions');
  if (!host) return;
  if (!state.candidate.targetRole.trim()) {
    host.innerHTML = '<p class="rs-help">Enter a target position to see matching skill suggestions.</p>';
    return;
  }
  const suggestions = getRoleSuggestions(state.candidate.targetRole);
  const skillItems = suggestions.skills
    .filter((item) => !state.skills.some((skill) => skill.toLocaleLowerCase() === item.text.toLocaleLowerCase()))
    .map((item) => '<li><span><strong>Suggested skill:</strong> ' + esc(item.text) + '</span><button type="button" class="rs-secondary" data-verify-suggestion="skill" data-suggestion="' + esc(item.text) + '">Add</button></li>')
    .join('');
  host.innerHTML = '<div class="rs-suggestion-box" role="region" aria-label="Skill suggestions">' +
    '<p><strong>Suggested skills for ' + esc(state.candidate.targetRole) + '</strong> · Add only skills you genuinely have, then edit the list as needed.</p>' +
    (skillItems ? '<ul class="rs-suggestion-list">' + skillItems + '</ul>' : '<p class="rs-help">No additional verified-role skill suggestions are available.</p>') +
    '</div>';
}


function renderResponsibilitySuggestions(root, state, index) {
  const host = root.querySelector('[data-responsibility-suggestions-host="' + index + '"]');
  if (!host) return;
  const jobTitle = state.experience[index]?.position?.trim() || '';
  if (!jobTitle) {
    host.innerHTML = '<p class="rs-help">Enter the Position / Job Title for this experience first.</p>';
    return;
  }
  const suggestions = getRoleSuggestions(jobTitle).responsibilities || [];
  if (!suggestions.length) {
    host.innerHTML = '<p class="rs-help">No responsibility ideas are available for this role. Add only duties you actually performed.</p>';
    return;
  }
  const current = state.experience[index]?.responsibilities || [];
  const items = suggestions
    .filter((item) => !current.some((value) => value.toLocaleLowerCase() === item.text.toLocaleLowerCase()))
    .map((item) => `<li><span><strong>Suggested:</strong> ${esc(item.text)}</span><button type="button" class="rs-secondary" data-verify-responsibility data-index="${index}" data-suggestion="${esc(item.text)}">Add only if true</button></li>`)
    .join('');
  host.innerHTML = items
    ? `<div class="rs-suggestion-box" role="region" aria-label="Responsibility suggestions"><p><strong>Role ideas for ${esc(jobTitle)}</strong> · Add only duties you personally performed.</p><ul class="rs-suggestion-list">${items}</ul></div>`
    : '<p class="rs-help">All available role ideas are already included in this experience entry.</p>';
}

function markListProvenance(length, provenance) {
  return Array.from({ length }, () => provenance);
}

function addItem(store, type) {
  const factories = {
    experience: experienceItem,
    education: educationItem,
    projects: projectItem,
    internships: internshipItem,
    certifications: certificationItem
  };
  const factory = factories[type];
  if (!factory) return;
  store.update((state) => {
    state[type].push(factory());
    return state;
  });
}

export function mountResumeStudioUI(root, store, options = {}) {
  if (!root || !store) throw new TypeError('Resume Studio UI requires a root element and store.');
  let restoredDraft = options.restoredDraft || { status: 'empty' };
  const onDraftResolved = typeof options.onDraftResolved === 'function' ? options.onDraftResolved : () => {};

  const rerender = () => {
    render(root, store.getState());
    const current = store.getState();
    if (current.candidate.targetRole) renderRoleSuggestions(root, current);
    if (restoredDraft?.status === 'restored' && restoredDraft?.resume) {
      setStorageStatus({ status: 'available', savedAt: restoredDraft.savedAt });
    }
  };
  const refreshPreview = () => renderResumePreview(root.querySelector('#rs-preview-host'), store.getState());
  const refreshValidationIfVisible = () => {
    const results = root.querySelector('#rs-validation-results');
    if (results && results.hasChildNodes()) renderValidationResults(root, store.getState());
  };

  const selectTargetRole = (role) => {
    store.update((state) => {
      state.candidate.targetRole = role;
      const generated = generateAutomaticIntroduction({ candidateType: state.candidate.type, targetRole: role });
      state.summary.text = generated.text;
      state.summary.provenance = generated.provenance;
      return state;
    });
    rerender();
    renderRoleSuggestions(root, store.getState());
    const targetInput = root.querySelector('#target-role');
    if (targetInput) targetInput.focus();
  };

  rerender();

  function storageMessage(result = {}) {
    if (result.status === 'saved') return 'Draft saved locally in this browser.';
    if (result.status === 'available') return 'A saved resume draft is available in this browser. Restore it only if it is yours.';
    if (result.status === 'restored') return 'Saved draft restored from this browser.';
    if (result.status === 'cleared' || result.status === 'empty') return 'No saved draft on this browser.';
    if (result.status === 'too-large') return 'Draft is too large to save locally. Your current in-memory resume is still available.';
    if (result.status === 'unavailable') return 'Local draft saving is unavailable in this browser or browsing mode.';
    if (result.status === 'discarded') return 'An unreadable or unsupported saved draft was discarded safely.';
    if (result.status === 'failed') return 'Local draft could not be saved. Your current in-memory resume is still available.';
    return 'Your resume draft is saved only in this browser on this device. It is not uploaded to AllToolForest.';
  }

  function setStorageStatus(result) {
    const status = root.querySelector('#rs-storage-status');
    if (status) status.textContent = storageMessage(result);
    const restoreButton = root.querySelector('[data-restore-draft]');
    if (restoreButton) restoreButton.hidden = !(result?.status === 'available' && restoredDraft?.resume);
  }

  if (restoredDraft.status && restoredDraft.status !== 'empty') {
    setStorageStatus(restoredDraft);
  }

  root.addEventListener('change', (event) => {
    const target = event.target;

    if (target.id === 'candidate-type') {
      store.setCandidateType(target.value);
      store.update((state) => {
        if (!state.summary.text || state.summary.provenance === CONTENT_PROVENANCE.SUGGESTED) {
          const generated = generateAutomaticIntroduction({ candidateType: state.candidate.type, targetRole: state.candidate.targetRole });
          state.summary.text = generated.text;
          state.summary.provenance = generated.provenance;
        }
        return state;
      });
      rerender();
      return;
    }

    if (target.matches('input[name="resume-template"]')) {
      if (!isTemplateId(target.value)) return;
      store.update((state) => {
        state.settings.template = target.value;
        return state;
      });
      refreshPreview();
      const status = root.querySelector('#rs-state-status');
      if (status) status.textContent = 'Template changed. Resume content was not modified.';
      return;
    }

    if (target.matches('[data-toggle-section]')) {
      const section = target.dataset.toggleSection;
      store.update((state) => {
        state[section].enabled = target.checked;
        state.settings.enabledSections[section] = target.checked;
        return state;
      });
      rerender();
      return;
    }

    if (target.matches('[data-array][data-key="current"]')) {
      const index = Number(target.dataset.index);
      store.update((state) => {
        state.experience[index].current = target.checked;
        if (target.checked) state.experience[index].endDate = '';
        return state;
      });
      rerender();
    }
  });

  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target.id !== 'target-role') return;

    let options = Array.from(root.querySelectorAll('[data-target-role-option]'));
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !options.length) {
      renderTargetRoleSuggestions(root, target.value);
      options = Array.from(root.querySelectorAll('[data-target-role-option]'));
    }

    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      const current = options.findIndex((option) => option.dataset.active === 'true');
      setActiveTargetRoleOption(root, current < 0 ? 0 : current + 1);
      return;
    }

    if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      const current = options.findIndex((option) => option.dataset.active === 'true');
      setActiveTargetRoleOption(root, current < 0 ? options.length - 1 : current - 1);
      return;
    }

    if (event.key === 'Enter' && options.length) {
      const active = options.find((option) => option.dataset.active === 'true');
      if (active) {
        event.preventDefault();
        selectTargetRole(active.dataset.targetRoleOption);
      }
      return;
    }

    if (event.key === 'Escape') {
      closeTargetRoleSuggestions(root);
    }
  });

  root.addEventListener('focusout', (event) => {
    if (event.target.id !== 'target-role') return;
    globalThis.setTimeout(() => {
      const host = root.querySelector('#target-role-suggestions');
      if (!host?.contains(globalThis.document?.activeElement)) closeTargetRoleSuggestions(root);
    }, 0);
  });

  root.addEventListener('input', (event) => {
    const target = event.target;

    if (target.id === 'target-role') {
      store.update((state) => {
        state.candidate.targetRole = String(target.value || '').trim();
        if (!state.summary.text || state.summary.provenance === CONTENT_PROVENANCE.SUGGESTED) {
          const generated = generateAutomaticIntroduction({ candidateType: state.candidate.type, targetRole: state.candidate.targetRole });
          state.summary.text = generated.text;
          state.summary.provenance = generated.provenance;
        }
        return state;
      });
      renderTargetRoleSuggestions(root, target.value);
      renderRoleSuggestions(root, store.getState());
      const summaryField = root.querySelector('[data-path="summary.text"]');
      if (summaryField && store.getState().summary.provenance === CONTENT_PROVENANCE.SUGGESTED) {
        summaryField.value = store.getState().summary.text;
      }
      refreshPreview();
      refreshValidationIfVisible();
      return;
    }

    if (target.matches('[data-path]')) {
      store.update((state) => {
        setPath(state, target.dataset.path, target.value);
        if (target.dataset.path === 'summary.text') state.summary.provenance = CONTENT_PROVENANCE.USER;
        if (/^projects\.\d+\.description$/.test(target.dataset.path)) {
          const index = Number(target.dataset.path.split('.')[1]);
          if (state.projects[index]) state.projects[index].descriptionProvenance = CONTENT_PROVENANCE.USER;
        }
        return state;
      });
      refreshPreview();
      refreshValidationIfVisible();
      return;
    }

    if (target.matches('[data-list-path]')) {
      store.update((state) => {
        const values = textList(target.value);
        setPath(state, target.dataset.listPath, values);
        if (target.dataset.listPath === 'skills') state.skillProvenance = markListProvenance(values.length, CONTENT_PROVENANCE.USER);
        if (target.dataset.listPath === 'achievements') state.achievementProvenance = markListProvenance(values.length, CONTENT_PROVENANCE.USER);
        if (target.dataset.listPath === 'interests') state.settings.enabledSections.interests = values.length > 0;
        return state;
      });
      refreshPreview();
      refreshValidationIfVisible();
      return;
    }

    if (target.type === 'checkbox') return;

    if (target.matches('[data-array][data-key]')) {
      const collection = target.dataset.array;
      const index = Number(target.dataset.index);
      const key = target.dataset.key;
      const kind = target.dataset.kind;
      store.update((state) => {
        const item = state[collection]?.[index];
        if (!item) return state;
        item[key] = kind === 'list' ? textList(target.value) : target.value;
        if (collection === 'experience' && key === 'responsibilities') {
          item.responsibilityProvenance = markListProvenance(item[key].length, CONTENT_PROVENANCE.USER);
        }
        if (collection === 'experience' && key === 'achievements') {
          item.achievementProvenance = markListProvenance(item[key].length, CONTENT_PROVENANCE.USER);
        }
        if (collection === 'internships' && key === 'responsibilities') {
          item.responsibilityProvenance = markListProvenance(item[key].length, CONTENT_PROVENANCE.USER);
        }
        return state;
      });
      refreshPreview();
      refreshValidationIfVisible();
    }
  });

  root.addEventListener('click', (event) => {
    const roleOption = event.target.closest('[data-target-role-option]');
    if (roleOption) {
      selectTargetRole(roleOption.dataset.targetRoleOption);
      return;
    }

    const printButton = event.target.closest('[data-print-resume]');
    if (printButton) {
      const state = store.getState();
      const hasContent = Boolean(state.contact?.fullName || state.candidate?.targetRole || state.summary?.text || state.skills?.length || state.education?.length || state.experience?.length || state.projects?.length);
      const status = root.querySelector('#rs-state-status');
      if (!hasContent) {
        if (status) status.textContent = 'Add resume information before printing or saving as PDF.';
        return;
      }
      const result = printResume(state);
      if (status) status.textContent = result.status === 'opened'
        ? 'Print dialog opened. Choose Save as PDF if your browser provides that option.'
        : 'Printing is not available in this browser.';
      return;
    }

    const textButton = event.target.closest('[data-download-txt]');
    if (textButton) {
      const state = store.getState();
      const hasContent = Boolean(state.contact?.fullName || state.candidate?.targetRole || state.summary?.text || state.skills?.length || state.education?.length || state.experience?.length || state.projects?.length);
      const status = root.querySelector('#rs-state-status');
      if (!hasContent) {
        if (status) status.textContent = 'Add resume information before downloading.';
        return;
      }
      const result = downloadResumeText(state);
      if (status) status.textContent = result.status === 'downloaded'
        ? 'TXT resume downloaded.'
        : 'TXT download is not supported in this browser.';
      return;
    }

    const validationButton = event.target.closest('[data-run-validation]');
    if (validationButton) {
      renderValidationResults(root, store.getState());
      const results = root.querySelector('#rs-validation-results');
      if (results) {
        results.setAttribute('tabindex', '-1');
        results.focus();
      }
      const status = root.querySelector('#rs-state-status');
      if (status) status.textContent = 'Resume review completed using deterministic checks.';
      return;
    }

    const restoreDraftButton = event.target.closest('[data-restore-draft]');
    if (restoreDraftButton) {
      if (!restoredDraft?.resume) return;
      store.replace(restoredDraft.resume);
      restoredDraft = { status: 'empty', resume: null };
      rerender();
      setStorageStatus({ status: 'restored' });
      onDraftResolved();
      const fullName = root.querySelector('[data-path="contact.fullName"]');
      if (fullName) fullName.focus();
      return;
    }

    const clearDraftButton = event.target.closest('[data-clear-draft]');
    if (clearDraftButton) {
      const confirmed = globalThis.confirm ? globalThis.confirm('Clear the saved resume draft from this browser and start a new resume?') : true;
      if (!confirmed) return;
      const cleared = clearResumeDraft();
      restoredDraft = { status: 'empty', resume: null };
      store.reset(CANDIDATE_TYPES.FRESHER);
      rerender();
      setStorageStatus(cleared.status === 'cleared' ? cleared : { status: cleared.status });
      onDraftResolved();
      const candidateType = root.querySelector('#candidate-type');
      if (candidateType) candidateType.focus();
      return;
    }

    const summaryButton = event.target.closest('[data-refine-summary]');
    if (summaryButton) {
      const state = store.getState();
      try {
        const unit = refineSummary({
          candidateType: state.candidate.type,
          targetRole: state.candidate.targetRole,
          draft: state.summary.text,
          skills: state.skills
        });
        store.update((next) => {
          next.summary.text = unit.text;
          next.summary.provenance = unit.provenance;
          return next;
        });
        rerender();
        const summaryField = root.querySelector('[data-path="summary.text"]');
        if (summaryField) summaryField.focus();
        root.querySelector('#rs-state-status').textContent = 'Introduction refined only from the facts and skills you supplied.';
      } catch (error) {
        root.querySelector('#rs-state-status').textContent = error.message;
      }
      return;
    }

    const refineResponsibilitiesButton = event.target.closest('[data-refine-responsibilities]');
    if (refineResponsibilitiesButton) {
      const index = Number(refineResponsibilitiesButton.dataset.index);
      const state = store.getState();
      try {
        const units = refineBulletList(state.experience[index]?.responsibilities || []);
        store.update((next) => {
          next.experience[index].responsibilities = units.map((unit) => unit.text);
          next.experience[index].responsibilityProvenance = units.map((unit) => unit.provenance);
          return next;
        });
        rerender();
        const responsibilityField = root.querySelector('[data-array="experience"][data-index="' + index + '"][data-key="responsibilities"]');
        if (responsibilityField) responsibilityField.focus();
        root.querySelector('#rs-state-status').textContent = 'Responsibilities refined from your existing points. No new responsibility was added.';
      } catch (error) {
        root.querySelector('#rs-state-status').textContent = error.message;
      }
      return;
    }

    const responsibilitySuggestionButton = event.target.closest('[data-show-responsibility-suggestions]');
    if (responsibilitySuggestionButton) {
      renderResponsibilitySuggestions(root, store.getState(), Number(responsibilitySuggestionButton.dataset.index));
      return;
    }

    const verifyResponsibilityButton = event.target.closest('[data-verify-responsibility]');
    if (verifyResponsibilityButton) {
      const index = Number(verifyResponsibilityButton.dataset.index);
      const suggested = createSuggestedUnit(verifyResponsibilityButton.dataset.suggestion, 'role responsibility suggestion');
      const verified = verifySuggestion(suggested);
      store.update((state) => {
        const item = state.experience[index];
        if (!item) return state;
        if (!item.responsibilities.some((value) => value.toLocaleLowerCase() === verified.text.toLocaleLowerCase())) {
          item.responsibilities.push(verified.text);
          item.responsibilityProvenance.push(verified.provenance);
        }
        return state;
      });
      rerender();
      const field = root.querySelector('[data-array="experience"][data-index="' + index + '"][data-key="responsibilities"]');
      if (field) field.focus();
      const status = root.querySelector('#rs-state-status');
      if (status) status.textContent = 'Verified responsibility added. Keep it only if it accurately describes work you performed.';
      return;
    }

    const suggestionButton = event.target.closest('[data-show-role-suggestions]');
    if (suggestionButton) {
      renderRoleSuggestions(root, store.getState());
      return;
    }

    const verifyButton = event.target.closest('[data-verify-suggestion]');
    if (verifyButton) {
      const suggested = createSuggestedUnit(verifyButton.dataset.suggestion, 'role suggestion');
      const verified = verifySuggestion(suggested);
      store.update((state) => {
        if (!state.skills.some((skill) => skill.toLocaleLowerCase() === verified.text.toLocaleLowerCase())) {
          state.skills.push(verified.text);
          state.skillProvenance.push(verified.provenance);
        }
        return state;
      });
      rerender();
      const skillsField = root.querySelector('[data-list-path="skills"]');
      if (skillsField) skillsField.focus();
      root.querySelector('#rs-state-status').textContent = 'Verified skill added. You are responsible for confirming it is true.';
      return;
    }

    const addButton = event.target.closest('[data-add]');
    if (addButton) {
      addItem(store, addButton.dataset.add);
      rerender();
      return;
    }

    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) {
      const type = removeButton.dataset.remove;
      const index = Number(removeButton.dataset.index);
      store.update((state) => {
        if (Array.isArray(state[type])) state[type].splice(index, 1);
        return state;
      });
      rerender();
    }
  });

  return {
    getState: store.getState,
    setStorageStatus,
    destroy() {
      root.replaceChildren();
    }
  };
}
