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
    achievements: []
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
    outcome: ''
  };
}

function internshipItem() {
  return {
    organization: '',
    title: '',
    startDate: '',
    endDate: '',
    responsibilities: [],
    outcome: ''
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
      <div class="rs-entry-head"><h3>Experience ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="experience" data-index="${index}">Remove</button></div>
      <div class="rs-grid">
        <label>Company / Organization<input data-array="experience" data-index="${index}" data-key="company" maxlength="120" value="${esc(item.company)}"></label>
        <label>Position / Job Title<input data-array="experience" data-index="${index}" data-key="position" maxlength="120" value="${esc(item.position)}"></label>
        <label>Location <span>(optional)</span><input data-array="experience" data-index="${index}" data-key="location" maxlength="120" value="${esc(item.location)}"></label>
        <label>Start month<input type="month" data-array="experience" data-index="${index}" data-key="startDate" value="${esc(item.startDate)}"></label>
        <label>End month<input type="month" data-array="experience" data-index="${index}" data-key="endDate" value="${esc(item.endDate)}" ${item.current ? 'disabled' : ''}></label>
        <label class="rs-check"><input type="checkbox" data-array="experience" data-index="${index}" data-key="current" ${item.current ? 'checked' : ''}>Currently working here</label>
        <label class="rs-full">Roles &amp; Responsibilities<textarea rows="5" data-array="experience" data-index="${index}" data-key="responsibilities" data-kind="list" maxlength="2500" placeholder="One responsibility per line">${esc(multiline(item.responsibilities))}</textarea></label>
        <label class="rs-full">Achievements <span>(optional)</span><textarea rows="4" data-array="experience" data-index="${index}" data-key="achievements" data-kind="list" maxlength="1800" placeholder="One truthful achievement per line">${esc(multiline(item.achievements))}</textarea></label>
      </div>
    </article>`).join('');
}

function renderEducation(items) {
  if (!items.length) return '<p class="rs-empty">No education record added yet.</p>';
  return items.map((item, index) => `
    <article class="rs-entry" data-entry="education" data-index="${index}">
      <div class="rs-entry-head"><h3>Education ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="education" data-index="${index}">Remove</button></div>
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
      <div class="rs-entry-head"><h3>Project ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="projects" data-index="${index}">Remove</button></div>
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
      <div class="rs-entry-head"><h3>Internship / Training ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="internships" data-index="${index}">Remove</button></div>
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
      <div class="rs-entry-head"><h3>Certification ${index + 1}</h3><button type="button" class="rs-link-danger" data-remove="certifications" data-index="${index}">Remove</button></div>
      <div class="rs-grid">
        <label>Certification<input data-array="certifications" data-index="${index}" data-key="name" maxlength="160" value="${esc(item.name)}"></label>
        <label>Issuing organization<input data-array="certifications" data-index="${index}" data-key="issuer" maxlength="160" value="${esc(item.issuer)}"></label>
        <label>Completion year <span>(optional)</span><input inputmode="numeric" data-array="certifications" data-index="${index}" data-key="year" maxlength="4" value="${esc(item.year)}"></label>
        <label>Credential URL / ID <span>(optional)</span><input data-array="certifications" data-index="${index}" data-key="credential" maxlength="240" value="${esc(item.credential)}"></label>
      </div>
    </article>`).join('');
}

function render(root, state) {
  const experienced = state.candidate.type === CANDIDATE_TYPES.EXPERIENCED;
  root.innerHTML = `
    <form id="rs-v2-form" class="rs-shell" novalidate>
      <div class="rs-progress" aria-label="Resume information steps">
        <span class="active">1. Profile</span><span>2. Content</span><span>3. Template</span><span>4. Review</span>
      </div>

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
            <input id="target-role" name="targetRole" maxlength="120" required autocomplete="organization-title" value="${esc(state.candidate.targetRole)}" placeholder="e.g. Financial Crime Analyst">
          </label>
        </div>
        <p class="rs-help">The target position guides later wording and suggestions. Resume Studio must not invent your employers, dates, qualifications, achievements or metrics.</p>
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
        <label class="rs-block">Your facts / draft
          <textarea data-path="summary.text" rows="6" maxlength="1800" placeholder="${experienced ? 'Summarize your experience, domain, strengths and evidence you can support.' : 'Describe your education, relevant skills, training/projects and career interest.'}">${esc(state.summary.text)}</textarea>
        </label>
        <p class="rs-help">Task 2 only captures your information. Role-aware rewriting will be connected in a later approved task.</p>
      </section>

      <section class="rs-panel" aria-labelledby="rs-skills-heading">
        <div class="rs-section-head"><div><p class="rs-kicker">Core section</p><h2 id="rs-skills-heading">Skills</h2></div></div>
        <label class="rs-block">Professional / technical skills
          <textarea data-list-path="skills" rows="5" maxlength="1600" placeholder="Enter one skill per line">${esc(multiline(state.skills))}</textarea>
        </label>
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
        <div class="rs-section-head"><div><p class="rs-kicker">Optional</p><h2 id="rs-declaration-heading">Declaration</h2></div></div>
        <label class="rs-switch"><input type="checkbox" data-toggle-section="declaration" ${state.declaration.enabled ? 'checked' : ''}> Include declaration</label>
        <div class="rs-grid ${state.declaration.enabled ? '' : 'rs-disabled-block'}" aria-disabled="${state.declaration.enabled ? 'false' : 'true'}">
          <label class="rs-full">Declaration text<textarea rows="3" data-path="declaration.text" maxlength="700" ${state.declaration.enabled ? '' : 'disabled'}>${esc(state.declaration.text)}</textarea></label>
          <label>Place<input data-path="declaration.place" maxlength="100" ${state.declaration.enabled ? '' : 'disabled'} value="${esc(state.declaration.place)}"></label>
          <label>Date<input type="date" data-path="declaration.date" ${state.declaration.enabled ? '' : 'disabled'} value="${esc(state.declaration.date)}"></label>
          <label>Candidate name<input data-path="declaration.candidateName" maxlength="120" ${state.declaration.enabled ? '' : 'disabled'} value="${esc(state.declaration.candidateName)}"></label>
        </div>
      </section>

      <div class="rs-task-note" role="status" aria-live="polite" id="rs-state-status">Information is held only in memory for this isolated Task 2 build. Local draft saving is not enabled yet.</div>
    </form>
  `;
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

export function mountResumeStudioUI(root, store) {
  if (!root || !store) throw new TypeError('Resume Studio UI requires a root element and store.');

  const rerender = () => render(root, store.getState());
  rerender();

  root.addEventListener('change', (event) => {
    const target = event.target;

    if (target.id === 'candidate-type') {
      store.setCandidateType(target.value);
      rerender();
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

  root.addEventListener('input', (event) => {
    const target = event.target;

    if (target.id === 'target-role') {
      store.setTargetRole(target.value);
      return;
    }

    if (target.matches('[data-path]')) {
      store.update((state) => {
        setPath(state, target.dataset.path, target.value);
        return state;
      });
      return;
    }

    if (target.matches('[data-list-path]')) {
      store.update((state) => {
        setPath(state, target.dataset.listPath, textList(target.value));
        return state;
      });
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
        return state;
      });
    }
  });

  root.addEventListener('click', (event) => {
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
    destroy() {
      root.replaceChildren();
    }
  };
}
