const ROLE_PROFILES = Object.freeze([
  {
    id: 'sap-basis',
    titles: ['SAP Basis Administrator', 'SAP Basis Consultant', 'SAP Basis Engineer'],
    match: /\b(sap\s*basis|basis administrator|basis consultant)\b/i,
    skills: ['SAP Basis administration', 'System monitoring', 'User and authorization administration', 'Transport management', 'SAP system troubleshooting'],
    responsibilities: [
      'Monitor SAP system availability, background jobs, logs and operational health.',
      'Support SAP user administration, authorizations and routine Basis activities.',
      'Coordinate transports, system changes and technical issue resolution according to defined procedures.'
    ]
  },
  {
    id: 'sap-fico',
    titles: ['SAP FICO Analyst', 'SAP FICO Consultant', 'SAP Finance Consultant'],
    match: /\b(sap\s*(fico|fi\/?co)|fico consultant|sap finance)\b/i,
    skills: ['SAP FI', 'SAP CO', 'Financial process analysis', 'Configuration support', 'Business process documentation'],
    responsibilities: [
      'Support SAP FI/CO processes, configuration activities and business-user requirements.',
      'Analyze finance-related issues and document functional findings or change requirements.',
      'Coordinate testing, issue resolution and process documentation for SAP finance workflows.'
    ]
  },
  {
    id: 'sap-mm',
    titles: ['SAP MM Consultant', 'SAP MM Analyst', 'SAP Materials Management Consultant'],
    match: /\b(sap\s*mm|materials management consultant)\b/i,
    skills: ['SAP MM', 'Procure-to-pay processes', 'Material master data', 'Purchase processes', 'Functional testing'],
    responsibilities: [
      'Support SAP MM processes across purchasing, materials and related master data.',
      'Analyze procurement requirements and document functional changes or issues.',
      'Coordinate testing and issue resolution for SAP MM business processes.'
    ]
  },
  {
    id: 'sap-sd',
    titles: ['SAP SD Consultant', 'SAP SD Analyst', 'SAP Sales and Distribution Consultant'],
    match: /\b(sap\s*sd|sales and distribution consultant)\b/i,
    skills: ['SAP SD', 'Order-to-cash processes', 'Sales order processing', 'Pricing support', 'Functional testing'],
    responsibilities: [
      'Support SAP SD processes across sales orders, delivery, billing and related workflows.',
      'Analyze order-to-cash requirements and document functional issues or changes.',
      'Coordinate testing and resolution of SAP SD process issues with relevant stakeholders.'
    ]
  },
  {
    id: 'sap-abap',
    titles: ['SAP ABAP Developer', 'SAP ABAP Consultant'],
    match: /\b(sap\s*abap|abap developer|abap consultant)\b/i,
    skills: ['ABAP development', 'SAP debugging', 'Reports and enhancements', 'Technical documentation', 'Unit testing'],
    responsibilities: [
      'Develop or maintain ABAP programs, reports, enhancements or interfaces according to approved requirements.',
      'Debug SAP application issues and document technical findings.',
      'Test code changes and coordinate transport of approved developments across environments.'
    ]
  },
  {
    id: 'financial-crime-compliance',
    titles: ['Financial Crime Analyst', 'AML Analyst', 'KYC Analyst', 'Transaction Monitoring Analyst', 'Fraud Analyst', 'Compliance Analyst'],
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
    titles: ['Customer Support Executive', 'Customer Service Representative', 'Customer Success Executive', 'Chat Support Executive', 'Technical Support Executive'],
    match: /\b(customer support|customer service|customer success|call center|contact centre|chat support|technical support|voice process)\b/i,
    skills: ['Customer communication', 'Issue resolution', 'Case documentation', 'Service quality', 'Escalation handling'],
    responsibilities: [
      'Handle customer enquiries through the channels relevant to the role.',
      'Document customer interactions and resolutions accurately.',
      'Escalate unresolved or high-impact issues through the appropriate process.'
    ]
  },
  {
    id: 'quality-operations',
    titles: ['Quality Analyst', 'Quality Auditor', 'Process Analyst', 'Operations Analyst', 'Process Developer'],
    match: /\b(quality analyst|quality auditor|qa analyst|operations analyst|process analyst|process developer)\b/i,
    skills: ['Quality auditing', 'Root-cause analysis', 'Process compliance', 'Reporting', 'Coaching feedback'],
    responsibilities: [
      'Review work against defined quality and process standards.',
      'Identify recurring gaps and document findings for follow-up.',
      'Provide clear feedback or reporting based on observed evidence.'
    ]
  },
  {
    id: 'software-development',
    titles: ['Java Developer', 'Python Developer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Software Engineer'],
    match: /\b(java developer|python developer|frontend developer|backend developer|full stack|software engineer|software developer)\b/i,
    skills: ['Software development', 'Testing and debugging', 'Version control', 'Technical documentation', 'Problem solving'],
    responsibilities: [
      'Develop and maintain software components according to approved requirements and technical standards.',
      'Test and debug application behavior and resolve identified defects.',
      'Document code changes and collaborate with relevant technical stakeholders.'
    ]
  },
  {
    id: 'data-analytics',
    titles: ['Data Analyst', 'Business Intelligence Analyst', 'BI Developer', 'Data Scientist', 'SQL Developer'],
    match: /\b(data analyst|business intelligence|bi developer|data scientist|sql developer)\b/i,
    skills: ['Data analysis', 'SQL', 'Reporting', 'Data visualization', 'Data validation'],
    responsibilities: [
      'Analyze data and prepare reports or insights aligned with defined business requirements.',
      'Validate data quality and investigate inconsistencies in source or reporting data.',
      'Document analysis methods, findings and reporting logic clearly.'
    ]
  },
  {
    id: 'sales-marketing',
    titles: ['Sales Executive', 'Business Development Executive', 'Digital Marketing Executive', 'SEO Analyst', 'Account Executive'],
    match: /\b(sales executive|business development|digital marketing|seo analyst|account executive)\b/i,
    skills: ['Client communication', 'Pipeline management', 'Market research', 'Campaign execution', 'Reporting'],
    responsibilities: [
      'Engage prospective or existing customers using channels relevant to the role.',
      'Maintain accurate records of opportunities, activities or campaign results.',
      'Coordinate follow-up actions based on customer or market needs.'
    ]
  },
  {
    id: 'human-resources',
    titles: ['HR Executive', 'Recruiter', 'Talent Acquisition Specialist', 'HR Operations Executive'],
    match: /\b(hr executive|human resources|recruiter|recruitment|talent acquisition|people operations|hr operations)\b/i,
    skills: ['Candidate communication', 'Interview coordination', 'Recruitment operations', 'Documentation', 'Stakeholder coordination'],
    responsibilities: [
      'Coordinate candidate or employee processes according to defined requirements.',
      'Maintain accurate recruitment or people-operation records.',
      'Communicate status, next steps and required information to relevant stakeholders.'
    ]
  },
  {
    id: 'accounting-finance',
    titles: ['Accountant', 'Financial Analyst', 'Accounts Payable Analyst', 'Accounts Receivable Analyst', 'Tax Analyst'],
    match: /\b(accountant|financial analyst|accounts payable|accounts receivable|bookkeeper|tax analyst)\b/i,
    skills: ['Financial reporting', 'Reconciliation', 'Spreadsheet analysis', 'Documentation', 'Data accuracy'],
    responsibilities: [
      'Prepare or review financial information according to role requirements.',
      'Reconcile records and investigate identified discrepancies.',
      'Maintain clear supporting documentation for financial activities.'
    ]
  }
]);

const ALL_TITLES = Object.freeze(ROLE_PROFILES.flatMap((profile) => profile.titles));

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeSuggestion(kind, text, family) {
  return Object.freeze({ kind, text, family, provenance: 'suggested', verified: false });
}

export function getTargetRoleSuggestions(query, limit = 8) {
  const value = clean(query).toLocaleLowerCase();
  if (value.length < 2) return [];
  const tokens = value.split(/\s+/).filter(Boolean);
  return ALL_TITLES
    .map((title) => {
      const lower = title.toLocaleLowerCase();
      const starts = lower.startsWith(value) ? 0 : 1;
      const full = lower.includes(value) ? 0 : 1;
      const tokenMisses = tokens.filter((token) => !lower.includes(token)).length;
      return { title, rank: starts * 100 + full * 20 + tokenMisses };
    })
    .filter((item) => item.rank < 120)
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((item) => item.title);
}

export function identifyRoleFamily(roleTitle) {
  const role = clean(roleTitle);
  if (!role) return { id: 'general', confidence: 'none' };
  const found = ROLE_PROFILES.find((profile) => profile.match.test(role));
  return found ? { id: found.id, confidence: 'keyword' } : { id: 'general', confidence: 'fallback' };
}

export function getRoleSuggestions(roleTitle) {
  const role = clean(roleTitle);
  if (!role) return { role: '', family: 'general', skills: [], responsibilities: [] };
  const found = ROLE_PROFILES.find((profile) => profile.match.test(role));
  if (!found) return { role, family: 'general', skills: [], responsibilities: [] };
  return {
    role,
    family: found.id,
    skills: found.skills.map((text) => makeSuggestion('skill', text, found.id)),
    responsibilities: found.responsibilities.map((text) => makeSuggestion('responsibility', text, found.id))
  };
}
