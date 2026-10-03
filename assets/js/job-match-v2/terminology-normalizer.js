import {
  CONFIDENCE_LEVEL,
  PROVENANCE_KIND,
  REQUIREMENT_CATEGORY,
  REQUIREMENT_IMPORTANCE
} from './contracts.js';
import {
  NON_EQUIVALENT_GUARDRAILS,
  TERMINOLOGY_CONCEPTS
} from './terminology-catalog.js';

const IMPORTANCE_RANK = Object.freeze({
  [REQUIREMENT_IMPORTANCE.GENERAL]: 1,
  [REQUIREMENT_IMPORTANCE.PREFERRED]: 2,
  [REQUIREMENT_IMPORTANCE.REQUIRED]: 3
});

const WORD_FAMILIES = Object.freeze([
  Object.freeze({
    canonical: 'analyze',
    variants: Object.freeze(['analyze','analyzes','analyzed','analyzing','analysis','analyses','analytical','analytics'])
  }),
  Object.freeze({
    canonical: 'manage',
    variants: Object.freeze(['manage','manages','managed','managing','manager','management'])
  }),
  Object.freeze({
    canonical: 'coordinate',
    variants: Object.freeze(['coordinate','coordinates','coordinated','coordinating','coordination','coordinator'])
  })
]);

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

function key(value) {
  return clean(value).toLocaleLowerCase('en-US');
}

const EXACT_ALIAS_INDEX = new Map();
for (const concept of TERMINOLOGY_CONCEPTS) {
  for (const alias of concept.aliases) {
    const aliasKey = key(alias);
    if (!EXACT_ALIAS_INDEX.has(aliasKey)) EXACT_ALIAS_INDEX.set(aliasKey, []);
    EXACT_ALIAS_INDEX.get(aliasKey).push({ concept, alias });
  }
}

function escaped(value) {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

const PATTERN_CACHE = new Map();

function phrasePattern(phrase) {
  const cacheKey = key(phrase);
  if (!PATTERN_CACHE.has(cacheKey)) {
    PATTERN_CACHE.set(
      cacheKey,
      new RegExp('(^|[^A-Za-z0-9+#])(' + escaped(clean(phrase)) + ')(?=$|[^A-Za-z0-9+#])', 'i')
    );
  }
  return PATTERN_CACHE.get(cacheKey);
}

function findPhrase(text, phrase) {
  const match = clean(text).match(phrasePattern(phrase));
  return match ? match[2] : '';
}

function requiresContext(alias, concept) {
  if (!concept.contextAny.length) return false;
  if (key(alias) === key(concept.canonical)) return false;
  if ((concept.contextRequiredAliases || []).some((item) => key(item) === key(alias))) return true;
  const compact = clean(alias).replace(/[^A-Za-z0-9]/g, '');
  return compact.length <= 3 || /^[A-Z]{2,5}$/.test(clean(alias));
}

function contextAllows(concept, alias, contextText) {
  const context = key(contextText);

  if (concept.contextNone.some((term) => context.includes(key(term)))) return false;
  if (!requiresContext(alias, concept)) return true;
  return concept.contextAny.some((term) => context.includes(key(term)));
}

function matchingAliases(text, contextText) {
  const matches = [];

  for (const concept of TERMINOLOGY_CONCEPTS) {
    const aliases = [...concept.aliases].sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      const matched = findPhrase(text, alias);
      if (!matched || !contextAllows(concept, alias, contextText)) continue;
      matches.push({
        concept,
        alias,
        matchedText: matched,
        method: key(alias) === key(concept.canonical) ? 'canonical' : 'alias'
      });
      break;
    }
  }

  return matches.filter((match, index, all) => {
    const own = key(match.matchedText);
    return !all.some((other, otherIndex) =>
      otherIndex !== index &&
      other.concept.id !== match.concept.id &&
      other.matchedText.length > match.matchedText.length &&
      key(other.matchedText).includes(own)
    );
  });
}

function strongerImportance(a, b) {
  return IMPORTANCE_RANK[b] > IMPORTANCE_RANK[a] ? b : a;
}

function normalizeKnownRequirement(requirement, contextText) {
  const originalTerm = clean(requirement.matchedText || requirement.label);
  let candidates = matchingAliases(
    [requirement.matchedText, requirement.label].filter(Boolean).join(' '),
    contextText
  );

  if (!candidates.length && requirement.sourceText && originalTerm) {
    const originalKey = key(originalTerm);
    candidates = matchingAliases(requirement.sourceText, contextText).filter((candidate) => {
      const candidateKey = key(candidate.matchedText);
      return candidateKey.includes(originalKey) || originalKey.includes(candidateKey);
    });
  }

  if (!candidates.length) {
    return Object.freeze({
      ...requirement,
      normalizedLabel: requirement.label,
      conceptId: '',
      normalizationMethod: 'none',
      normalizationConfidence: CONFIDENCE_LEVEL.NONE,
      originalMatchedText: requirement.matchedText || requirement.label
    });
  }

  const match = candidates[0];
  return Object.freeze({
    ...requirement,
    category: match.concept.category,
    label: match.concept.canonical,
    normalizedLabel: match.concept.canonical,
    conceptId: match.concept.id,
    normalizationMethod: match.method,
    normalizationConfidence: match.concept.confidence === 'high'
      ? CONFIDENCE_LEVEL.HIGH
      : CONFIDENCE_LEVEL.MEDIUM,
    originalMatchedText: requirement.matchedText || requirement.label,
    matchedText: match.matchedText
  });
}

function requirementFromAlias(requirement, match, index) {
  return Object.freeze({
    ...requirement,
    id: requirement.id + '-norm-' + index,
    category: match.concept.category,
    label: match.concept.canonical,
    normalizedLabel: match.concept.canonical,
    conceptId: match.concept.id,
    matchedText: match.matchedText,
    originalMatchedText: requirement.matchedText || requirement.label,
    normalizationMethod: match.method,
    normalizationConfidence: match.concept.confidence === 'high'
      ? CONFIDENCE_LEVEL.HIGH
      : CONFIDENCE_LEVEL.MEDIUM,
    confidence: match.concept.confidence === 'high'
      ? CONFIDENCE_LEVEL.HIGH
      : CONFIDENCE_LEVEL.MEDIUM,
    provenance: PROVENANCE_KIND.DERIVED
  });
}

function normalizeUnknownRequirement(requirement, contextText) {
  const matches = matchingAliases(requirement.sourceText || requirement.label, contextText);
  if (!matches.length) {
    return [Object.freeze({
      ...requirement,
      normalizedLabel: requirement.label,
      conceptId: '',
      normalizationMethod: 'none',
      normalizationConfidence: CONFIDENCE_LEVEL.NONE,
      originalMatchedText: requirement.matchedText || requirement.label
    })];
  }
  return matches.map((match, index) => requirementFromAlias(requirement, match, index));
}

function mergeNormalized(requirements) {
  const merged = new Map();

  for (const requirement of requirements) {
    const identity = requirement.conceptId
      ? 'concept|' + requirement.conceptId
      : 'raw|' + requirement.category + '|' + key(requirement.label);

    const current = merged.get(identity);
    if (!current) {
      merged.set(identity, {
        ...requirement,
        mentions: [...(requirement.mentions || [])],
        normalizedMentions: [{
          sourceText: requirement.sourceText,
          matchedText: requirement.matchedText,
          originalMatchedText: requirement.originalMatchedText,
          normalizationMethod: requirement.normalizationMethod
        }]
      });
      continue;
    }

    current.importance = strongerImportance(current.importance, requirement.importance);
    current.mentions.push(...(requirement.mentions || []));
    current.normalizedMentions.push({
      sourceText: requirement.sourceText,
      matchedText: requirement.matchedText,
      originalMatchedText: requirement.originalMatchedText,
      normalizationMethod: requirement.normalizationMethod
    });
    current.mentionCount = current.mentions.length;
  }

  return [...merged.values()].map((item, index) => Object.freeze({
    ...item,
    id: 'req-' + index,
    mentionCount: item.mentions.length,
    mentions: Object.freeze(item.mentions.map((entry) => Object.freeze({ ...entry }))),
    normalizedMentions: Object.freeze(item.normalizedMentions.map((entry) => Object.freeze({ ...entry })))
  }));
}

export function findConceptMentions(text, conceptId, contextText = '') {
  const concept = TERMINOLOGY_CONCEPTS.find((item) => item.id === conceptId);
  if (!concept) return Object.freeze([]);

  const source = clean(text);
  const context = contextText || source;
  const mentions = [];

  for (const alias of [...concept.aliases].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(phrasePattern(alias).source, 'gi');
    let match;
    while ((match = pattern.exec(source))) {
      if (!contextAllows(concept, alias, context)) continue;
      const matchedText = match[2] || '';
      const start = match.index + String(match[1] || '').length;
      mentions.push(Object.freeze({
        conceptId: concept.id,
        canonical: concept.canonical,
        category: concept.category,
        alias,
        matchedText,
        start,
        end: start + matchedText.length,
        method: key(alias) === key(concept.canonical) ? 'canonical' : 'alias'
      }));
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
    }
  }

  const deduped = mentions.filter((item, index, all) =>
    all.findIndex((other) => other.start === item.start && other.end === item.end) === index
  );
  return Object.freeze(deduped);
}

export function normalizeWordFamily(value) {
  const input = key(value);
  if (!input) return '';
  for (const family of WORD_FAMILIES) {
    if (family.variants.some((variant) => key(variant) === input)) return family.canonical;
  }
  return clean(value);
}

export function normalizeTerm(value, contextText = '') {
  const input = clean(value);
  const context = contextText || input;
  const exact = (EXACT_ALIAS_INDEX.get(key(input)) || [])
    .filter(({ concept, alias }) => contextAllows(concept, alias, context))
    .map(({ concept, alias }) => ({
      concept,
      alias,
      matchedText: input,
      method: key(alias) === key(concept.canonical) ? 'canonical' : 'alias'
    }));

  const matches = exact.length ? exact : matchingAliases(input, context);
  if (!matches.length) {
    return Object.freeze({
      input,
      canonical: input,
      conceptId: '',
      category: REQUIREMENT_CATEGORY.UNKNOWN,
      method: 'none',
      confidence: CONFIDENCE_LEVEL.NONE
    });
  }

  const match = matches[0];
  return Object.freeze({
    input: clean(value),
    canonical: match.concept.canonical,
    conceptId: match.concept.id,
    category: match.concept.category,
    method: match.method,
    confidence: match.concept.confidence === 'high'
      ? CONFIDENCE_LEVEL.HIGH
      : CONFIDENCE_LEVEL.MEDIUM
  });
}

export function areTermsExplicitlyNonEquivalent(left, right) {
  const a = key(left);
  const b = key(right);
  return NON_EQUIVALENT_GUARDRAILS.some(([x, y]) => {
    const xk = key(x);
    const yk = key(y);
    return (a === xk && b === yk) || (a === yk && b === xk);
  });
}

export function normalizeJobRequirements(requirements, contextText = '') {
  const normalized = [];

  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    if (requirement.category === REQUIREMENT_CATEGORY.UNKNOWN) {
      normalized.push(...normalizeUnknownRequirement(requirement, contextText));
    } else {
      normalized.push(normalizeKnownRequirement(requirement, contextText));
    }
  }

  const output = mergeNormalized(normalized);
  const normalizedCount = output.filter((item) => item.conceptId).length;
  const unresolvedCount = output.filter((item) => !item.conceptId).length;

  return Object.freeze({
    requirements: Object.freeze(output),
    diagnostics: Object.freeze({
      inputRequirementCount: Array.isArray(requirements) ? requirements.length : 0,
      outputRequirementCount: output.length,
      normalizedCount,
      unresolvedCount
    })
  });
}
