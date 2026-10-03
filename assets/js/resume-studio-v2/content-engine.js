export const CONTENT_PROVENANCE = Object.freeze({
  USER: 'user',
  REFINED: 'refined',
  SUGGESTED: 'suggested'
});

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[•\-–—]\s*/, '')
    .trim();
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
  const cleaned = clean(text);
  return Object.freeze({
    text: cleaned,
    provenance,
    source: clean(source)
  });
}

export function refineSummary({ candidateType, targetRole, draft, skills = [] }) {
  const role = safeRole(targetRole);
  const facts = clean(draft);
  const safeSkills = dedupe(skills).slice(0, 5);

  if (!role) throw new Error('Enter a target position before refining the introduction.');
  if (!facts && !safeSkills.length) {
    throw new Error('Add truthful profile facts or skills before refining the introduction.');
  }

  let text;
  if (candidateType === 'experienced') {
    text = facts
      ? sentence(facts)
      : 'Experienced candidate targeting ' + role + ' with skills in ' + naturalList(safeSkills) + '.';
    if (facts && safeSkills.length && !safeSkills.some((skill) => facts.toLocaleLowerCase().includes(skill.toLocaleLowerCase()))) {
      text += ' Core skills include ' + naturalList(safeSkills) + '.';
    }
  } else {
    text = 'Seeking an opportunity as ' + role + '.';
    if (safeSkills.length) text += ' Ready to apply ' + naturalList(safeSkills) + '.';
    if (facts) text += ' ' + sentence(facts);
  }

  return contentUnit(text, CONTENT_PROVENANCE.REFINED, 'candidate-provided introduction and skills');
}

export function refineBulletList(items) {
  const sourceItems = dedupe(Array.isArray(items) ? items : []);
  if (!sourceItems.length) throw new Error('Add at least one truthful point before refining it.');
  return sourceItems.map((item) =>
    contentUnit(sentence(actionVerb(item)), CONTENT_PROVENANCE.REFINED, item)
  );
}

export function createSuggestedUnit(text, source = 'role guidance') {
  return contentUnit(text, CONTENT_PROVENANCE.SUGGESTED, source);
}

export function verifySuggestion(unit) {
  if (!unit || unit.provenance !== CONTENT_PROVENANCE.SUGGESTED) {
    throw new TypeError('Only suggested content can be verified.');
  }
  return contentUnit(unit.text, CONTENT_PROVENANCE.USER, 'verified by candidate');
}
