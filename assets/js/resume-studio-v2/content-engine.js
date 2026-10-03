export const CONTENT_PROVENANCE = Object.freeze({
  USER: 'user',
  REFINED: 'refined',
  SUGGESTED: 'suggested'
});

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/^[•\-–—]\s*/, '').trim();
}

function sentence(value) {
  const text = clean(value).replace(/[.!?]+$/g, '');
  return text ? text + '.' : '';
}

function safeRole(value) {
  return clean(value).replace(/[<>]/g, '');
}

function naturalList(items) {
  const values = items.map(clean).filter(Boolean);
  if (values.length < 2) return values[0] || '';
  if (values.length === 2) return values.join(' and ');
  return values.slice(0, -1).join(', ') + ', and ' + values.at(-1);
}

function dedupe(items) {
  const seen = new Set();
  return items.map(clean).filter((item) => {
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actionVerb(text) {
  const cleaned = clean(text);
  if (!cleaned) return '';
  const lower = cleaned.toLocaleLowerCase();
  const replacements = [
    [/^(responsible for|worked on|handled)\s+/i, 'Handled '],
    [/^(did|performed)\s+/i, 'Performed '],
    [/^(helped with|assisted with)\s+/i, 'Supported '],
    [/^(checked|reviewed)\s+/i, 'Reviewed '],
    [/^(made|created)\s+/i, 'Created '],
    [/^(gave|provided)\s+/i, 'Provided ']
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(cleaned)) return replacement + cleaned.replace(pattern, '');
  }
  return lower === cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : cleaned;
}

export function contentUnit(text, provenance = CONTENT_PROVENANCE.USER, source = '') {
  return Object.freeze({ text: clean(text), provenance, source: clean(source) });
}

export function generateCareerObjective({ targetRole }) {
  const role = safeRole(targetRole);
  if (!role) return contentUnit('', CONTENT_PROVENANCE.SUGGESTED, 'target role');

  const text = `Seeking an opportunity as a ${role} where I can build practical capability, contribute responsibly to role-relevant work, learn from real-world challenges and support the goals of the organization while developing a strong professional foundation.`;
  return contentUnit(text, CONTENT_PROVENANCE.SUGGESTED, 'target role');
}


function summaryWordCount(value) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

export function generateProfessionalSummary({ targetRole, skills = [], experience = [] }) {
  const role = safeRole(targetRole);
  if (!role) return contentUnit('', CONTENT_PROVENANCE.SUGGESTED, 'target role');

  const verifiedSkills = dedupe(Array.isArray(skills) ? skills : []).slice(0, 2);
  const recentPosition = clean(
    (Array.isArray(experience) ? experience : [])
      .map((item) => item?.position)
      .find(Boolean)
  );

  const facts = [];
  if (recentPosition) facts.push('experience as ' + recentPosition);
  if (verifiedSkills.length) facts.push('verified skills in ' + naturalList(verifiedSkills));

  const factSentence = facts.length
    ? 'Brings ' + naturalList(facts) + ', supported by practical work experience and a focus on accurate, dependable execution.'
    : 'Brings practical work experience, structured problem solving, clear communication and a consistent focus on accurate, dependable execution.';

  let text = `Experienced professional targeting a ${role} position. ${factSentence} Ready to apply proven experience to role-relevant responsibilities, collaborate effectively with stakeholders, support business objectives and continue strengthening expertise in the target domain.`;

  if (summaryWordCount(text) > 55) {
    text = `Experienced professional targeting a ${role} position. ${facts.length ? 'Brings ' + naturalList(facts) + ' and a focus on accurate, dependable execution.' : 'Brings practical experience, structured problem solving, clear communication and dependable execution.'} Ready to apply proven experience to role-relevant responsibilities, support business objectives and continue strengthening expertise in the target domain.`;
  }

  if (summaryWordCount(text) < 45) {
    text = text.replace(/\.$/, '') + ' while contributing consistently to team and organizational goals.';
  }

  return contentUnit(text, CONTENT_PROVENANCE.SUGGESTED, facts.length ? 'target role and verified candidate facts' : 'target role');
}

export function refineSummary({ candidateType, targetRole, draft, skills = [] }) {
  const role = safeRole(targetRole);
  const facts = clean(draft);
  const safeSkills = dedupe(skills).slice(0, 5);
  if (!role) throw new Error('Enter a target position before refining the introduction.');
  if (!facts && !safeSkills.length) throw new Error('Add or generate an introduction before refining it.');

  let text = facts ? sentence(facts) : '';
  if (!text && candidateType === 'experienced') {
    text = 'Experienced candidate targeting ' + role + '.';
  } else if (!text) {
    text = 'Seeking an opportunity as ' + role + '.';
  }
  if (safeSkills.length && !safeSkills.some((skill) => text.toLocaleLowerCase().includes(skill.toLocaleLowerCase()))) {
    text += ' Verified skills include ' + naturalList(safeSkills) + '.';
  }
  return contentUnit(text, CONTENT_PROVENANCE.REFINED, 'candidate-reviewed introduction and verified skills');
}

export function refineBulletList(items) {
  const sourceItems = dedupe(Array.isArray(items) ? items : []);
  if (!sourceItems.length) throw new Error('Add at least one truthful point before refining it.');
  return sourceItems.map((item) => contentUnit(sentence(actionVerb(item)), CONTENT_PROVENANCE.REFINED, item));
}

export function createSuggestedUnit(text, source = 'role guidance') {
  return contentUnit(text, CONTENT_PROVENANCE.SUGGESTED, source);
}

export function verifySuggestion(unit) {
  if (!unit || unit.provenance !== CONTENT_PROVENANCE.SUGGESTED) throw new TypeError('Only suggested content can be verified.');
  return contentUnit(unit.text, CONTENT_PROVENANCE.USER, 'verified by candidate');
}
