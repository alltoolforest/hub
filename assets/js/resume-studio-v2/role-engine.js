const ROLE_FAMILIES = Object.freeze([
  {
    id: 'financial-crime-compliance',
    match: /\b(aml|kyc|financial crime|fraud|compliance|sanctions|transaction monitoring)\b/i,
    skills: ['KYC review', 'AML controls', 'Transaction monitoring', 'Case documentation', 'Risk assessment'],
    responsibilities: [
      'Review customer or transaction information against defined compliance requirements.',
      'Document investigation findings clearly and consistently.',
      'Escalate cases that meet defined risk or exception criteria.'
    ]
  },
  {
    id: 'customer-service',
    match: /\b(customer|support|service|call center|contact centre|voice|chat support|customer success)\b/i,
    skills: ['Customer communication', 'Issue resolution', 'Case documentation', 'Service quality', 'Escalation handling'],
    responsibilities: [
      'Handle customer enquiries through the channels relevant to the role.',
      'Document customer interactions and resolutions accurately.',
      'Escalate unresolved or high-impact issues through the appropriate process.'
    ]
  },
  {
    id: 'quality-operations',
    match: /\b(quality|qa|quality analyst|operations|process|process associate|process developer|auditor)\b/i,
    skills: ['Quality auditing', 'Root-cause analysis', 'Process compliance', 'Reporting', 'Coaching feedback'],
    responsibilities: [
      'Review work against defined quality and process standards.',
      'Identify recurring gaps and document findings for follow-up.',
      'Provide clear feedback or reporting based on observed evidence.'
    ]
  },
  {
    id: 'software-data',
    match: /\b(software|developer|engineer|programmer|java|python|frontend|backend|full stack|data analyst|data scientist|sql|business intelligence|bi developer)\b/i,
    skills: ['Problem solving', 'Technical documentation', 'Testing and debugging', 'Version control', 'Data analysis'],
    responsibilities: [
      'Build or maintain solutions using the technologies relevant to the role.',
      'Test work for correctness and resolve identified defects.',
      'Document technical decisions, changes or analysis clearly.'
    ]
  },
  {
    id: 'sales-marketing',
    match: /\b(sales|business development|marketing|seo|digital marketing|account executive|relationship manager)\b/i,
    skills: ['Client communication', 'Pipeline management', 'Market research', 'Campaign execution', 'Reporting'],
    responsibilities: [
      'Engage prospective or existing customers using the channels relevant to the role.',
      'Maintain accurate records of opportunities, activities or campaign results.',
      'Coordinate follow-up actions based on customer or market needs.'
    ]
  },
  {
    id: 'human-resources',
    match: /\b(hr|human resources|recruiter|recruitment|talent acquisition|people operations)\b/i,
    skills: ['Candidate communication', 'Interview coordination', 'Recruitment operations', 'Documentation', 'Stakeholder coordination'],
    responsibilities: [
      'Coordinate candidate or employee processes according to defined requirements.',
      'Maintain accurate recruitment or people-operation records.',
      'Communicate status, next steps and required information to relevant stakeholders.'
    ]
  },
  {
    id: 'accounting-finance',
    match: /\b(accountant|accounting|finance|financial analyst|accounts payable|accounts receivable|bookkeeper|tax analyst)\b/i,
    skills: ['Financial reporting', 'Reconciliation', 'Spreadsheet analysis', 'Documentation', 'Data accuracy'],
    responsibilities: [
      'Prepare or review financial information according to the role requirements.',
      'Reconcile records and investigate identified discrepancies.',
      'Maintain clear supporting documentation for financial activities.'
    ]
  }
]);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeSuggestion(kind, text, family) {
  return Object.freeze({
    kind,
    text,
    family,
    provenance: 'suggested',
    verified: false
  });
}

export function identifyRoleFamily(targetRole) {
  const role = clean(targetRole);
  if (!role) return { id: 'general', confidence: 'none' };
  const found = ROLE_FAMILIES.find((family) => family.match.test(role));
  return found ? { id: found.id, confidence: 'keyword' } : { id: 'general', confidence: 'fallback' };
}

export function getRoleSuggestions(targetRole) {
  const role = clean(targetRole);
  if (!role) return { role: '', family: 'general', skills: [], responsibilities: [] };

  const found = ROLE_FAMILIES.find((family) => family.match.test(role));
  if (!found) {
    return {
      role,
      family: 'general',
      skills: [
        makeSuggestion('skill', 'Communication', 'general'),
        makeSuggestion('skill', 'Problem solving', 'general'),
        makeSuggestion('skill', 'Documentation', 'general')
      ],
      responsibilities: []
    };
  }

  return {
    role,
    family: found.id,
    skills: found.skills.map((text) => makeSuggestion('skill', text, found.id)),
    responsibilities: found.responsibilities.map((text) => makeSuggestion('responsibility', text, found.id))
  };
}
