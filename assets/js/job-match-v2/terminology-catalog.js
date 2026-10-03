import { REQUIREMENT_CATEGORY } from './contracts.js';

function concept(id, canonical, category, aliases, domains, options = {}) {
  return Object.freeze({
    id,
    canonical,
    category,
    aliases: Object.freeze([...new Set([canonical, ...aliases])]),
    domains: Object.freeze(domains),
    contextAny: Object.freeze(options.contextAny || []),
    contextNone: Object.freeze(options.contextNone || []),
    contextRequiredAliases: Object.freeze(options.contextRequiredAliases || []),
    confidence: options.confidence || 'high'
  });
}

export const TERMINOLOGY_CONCEPTS = Object.freeze([
  // IT / software
  concept('javascript', 'JavaScript', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['Javascript', 'JS'], ['it','software','web','data'],
    { contextAny: ['developer','development','frontend','front-end','backend','back-end','full stack','web','node','react','angular','vue','typescript','code','coding','software'] }),
  concept('dotnet', '.NET', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['.Net','dotnet','dot net'], ['it','software']),
  concept('csharp', 'C#', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['C Sharp','C-Sharp'], ['it','software']),
  concept('cplusplus', 'C++', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['C Plus Plus','C-plus-plus'], ['it','software','engineering']),
  concept('quality-assurance', 'Quality Assurance', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['QA'], ['it','manufacturing','healthcare','bpo'],
    { contextAny: ['quality','testing','test','assurance','audit','manufacturing','software','process','compliance'] }),

  // Office / business tools
  concept('microsoft-excel', 'Microsoft Excel', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['MS Excel','Excel'], ['finance','accounting','administration','data','sales','hr']),
  concept('microsoft-office', 'Microsoft Office', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['MS Office','Office Suite'], ['administration','finance','hr','sales']),
  concept('power-bi', 'Power BI', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['PowerBI','Microsoft Power BI'], ['data','finance','sales','operations']),
  concept('sap-fico', 'SAP FICO', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['SAP FI/CO','SAP FI CO','FI/CO'], ['finance','accounting','sap','erp'],
    { contextAny: ['sap','fico','finance','accounting','erp'] }),
  concept('sap-basis', 'SAP Basis', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['SAP BASIS','Basis'], ['it','sap','erp'],
    {
      contextAny: ['sap','basis administrator','basis consultant','erp'],
      contextRequiredAliases: ['Basis']
    }),
  concept('sap-mm', 'SAP MM', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['SAP Materials Management','Materials Management'], ['supply-chain','logistics','sap','erp'],
    { contextAny: ['sap','materials management','procurement','erp'] }),
  concept('sap-sd', 'SAP SD', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['SAP Sales and Distribution','Sales and Distribution'], ['sales','logistics','sap','erp'],
    { contextAny: ['sap','sales and distribution','erp'] }),
  concept('sap-abap', 'SAP ABAP', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['ABAP'], ['it','software','sap','erp'],
    { contextAny: ['sap','abap','erp'] }),

  // Banking / compliance
  concept('aml', 'Anti-Money Laundering', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['Anti Money Laundering','AML'], ['banking','finance','compliance','financial-crime']),
  concept('kyc', 'Know Your Customer', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['Know-Your-Customer','KYC'], ['banking','finance','compliance','financial-crime']),
  concept('cdd', 'Customer Due Diligence', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['CDD'], ['banking','compliance','financial-crime'],
    { contextAny: ['customer due diligence','kyc','aml','compliance','financial crime','onboarding'] }),
  concept('edd', 'Enhanced Due Diligence', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['EDD'], ['banking','compliance','financial-crime'],
    { contextAny: ['enhanced due diligence','kyc','aml','compliance','financial crime'] }),

  // Accounting / finance
  concept('accounts-payable', 'Accounts Payable', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['AP'], ['accounting','finance'],
    { contextAny: ['accounts payable','invoice','vendor','payables','accounting','accountant','finance'] }),
  concept('accounts-receivable', 'Accounts Receivable', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['AR'], ['accounting','finance'],
    { contextAny: ['accounts receivable','billing','collections','receivables','accounting','accountant','finance'] }),
  concept('general-ledger', 'General Ledger', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['GL'], ['accounting','finance'],
    { contextAny: ['general ledger','accounting','accountant','journal entries','financial close','reconciliation'] }),
  concept('profit-loss', 'Profit and Loss', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['P&L','P/L','Profit & Loss'], ['accounting','finance']),

  // Healthcare
  concept('registered-nurse', 'Registered Nurse', REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION,
    ['RN'], ['healthcare'],
    { contextAny: ['nurse','nursing','patient','clinical','hospital','healthcare','registered nurse'] }),
  concept('icd10', 'ICD-10', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['ICD 10','ICD10'], ['healthcare','medical-coding']),
  concept('cpt', 'CPT', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['Current Procedural Terminology'], ['healthcare','medical-coding']),

  // Engineering / manufacturing / trades
  concept('cad', 'CAD', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['Computer-Aided Design','Computer Aided Design'], ['engineering','manufacturing','construction','design']),
  concept('cnc', 'CNC', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['Computer Numerical Control'], ['manufacturing','engineering','skilled-trades']),
  concept('plc', 'PLC', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['Programmable Logic Controller','Programmable Logic Controllers'], ['manufacturing','engineering','skilled-trades']),
  concept('hvac', 'HVAC', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['Heating Ventilation and Air Conditioning','Heating, Ventilation and Air Conditioning'], ['construction','engineering','skilled-trades']),
  concept('bim', 'Building Information Modeling', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['Building Information Modelling','BIM'], ['construction','engineering']),

  // HR / recruitment
  concept('human-resources', 'Human Resources', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['HR'], ['hr','administration'],
    { contextAny: ['human resources','recruitment','recruiter','hiring','employee','talent','payroll','people operations'] }),
  concept('talent-acquisition', 'Talent Acquisition', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['TA'], ['hr','recruitment'],
    { contextAny: ['talent acquisition','recruiter','recruitment','hiring','candidate','sourcing'] }),
  concept('human-resource-information-system', 'Human Resources Information System', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['HRIS'], ['hr']),

  // Sales / marketing / retail / hospitality
  concept('crm', 'Customer Relationship Management', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['CRM'], ['sales','marketing','customer-service']),
  concept('seo', 'Search Engine Optimization', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['Search Engine Optimisation','SEO'], ['marketing','digital-marketing']),
  concept('sem', 'Search Engine Marketing', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['SEM'], ['marketing','digital-marketing'],
    { contextAny: ['search engine marketing','paid search','ppc','marketing','seo'] }),
  concept('pos', 'Point of Sale', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['POS'], ['retail','hospitality','sales'],
    { contextAny: ['point of sale','retail','store','restaurant','hospitality','cashier','sales'] }),

  // Legal / compliance
  concept('gdpr', 'General Data Protection Regulation', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['GDPR'], ['legal','compliance','privacy']),
  concept('nda', 'Non-Disclosure Agreement', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['Non Disclosure Agreement','NDA'], ['legal','compliance','administration']),

  // Logistics / operations
  concept('wms', 'Warehouse Management System', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['WMS'], ['logistics','warehouse','retail']),
  concept('tms', 'Transportation Management System', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['TMS'], ['logistics','transportation']),
  concept('scm', 'Supply Chain Management', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['SCM'], ['logistics','supply-chain','manufacturing']),

  // Education / public service
  concept('lms', 'Learning Management System', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['LMS'], ['education','training']),
  concept('gis', 'Geographic Information System', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['Geographical Information System','GIS'], ['government','public-service','construction','engineering','logistics']),

  // Data / AI
  concept('business-intelligence', 'Business Intelligence', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['BI'], ['data','analytics','finance'],
    { contextAny: ['business intelligence','analytics','reporting','dashboard','power bi','tableau','data'] }),
  concept('etl', 'Extract Transform Load', REQUIREMENT_CATEGORY.METHODOLOGY_PROCESS,
    ['Extract-Transform-Load','ETL'], ['data','engineering']),
  concept('machine-learning', 'Machine Learning', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['ML'], ['data','ai','software'],
    { contextAny: ['machine learning','data science','model','models','ai','artificial intelligence','python'] }),
  concept('artificial-intelligence', 'Artificial Intelligence', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['AI'], ['data','ai','software']),

  // Cybersecurity
  concept('soc', 'Security Operations Center', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['Security Operations Centre','SOC'], ['cybersecurity','information-security'],
    { contextAny: ['security operations','cybersecurity','security analyst','siem','incident','threat'] }),
  concept('siem', 'Security Information and Event Management', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['SIEM'], ['cybersecurity','information-security']),
  concept('iam', 'Identity and Access Management', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['IAM'], ['cybersecurity','cloud','information-security']),
  concept('mfa', 'Multi-Factor Authentication', REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    ['Multifactor Authentication','MFA'], ['cybersecurity','cloud','information-security']),

  // Cloud / DevOps
  concept('aws', 'Amazon Web Services', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['AWS'], ['cloud','it','software','devops']),
  concept('azure', 'Microsoft Azure', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['Azure'], ['cloud','it','software','devops']),
  concept('gcp', 'Google Cloud Platform', REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    ['Google Cloud','GCP'], ['cloud','it','software','devops']),
  concept('cicd', 'CI/CD', REQUIREMENT_CATEGORY.METHODOLOGY_PROCESS,
    ['CI CD','CI-CD','Continuous Integration/Continuous Delivery','Continuous Integration and Continuous Delivery',
     'Continuous Integration/Continuous Deployment','Continuous Integration and Continuous Deployment'],
    ['cloud','devops','software']),

  // Customer service / BPO
  concept('customer-service', 'Customer Service', REQUIREMENT_CATEGORY.SOFT_SKILL,
    ['Customer Support'], ['bpo','customer-service','retail','hospitality']),

  // Design
  concept('uiux', 'UI/UX', REQUIREMENT_CATEGORY.HARD_SKILL,
    ['UI UX','User Interface/User Experience','User Interface and User Experience'], ['design','software','web'])
]);

export const NON_EQUIVALENT_GUARDRAILS = Object.freeze([
  Object.freeze(['Java', 'JavaScript']),
  Object.freeze(['SAP Basis', 'SAP FICO']),
  Object.freeze(['SAP MM', 'SAP SD']),
  Object.freeze(['React', 'JavaScript']),
  Object.freeze(['AML', 'banking']),
  Object.freeze(['KYC', 'AML']),
  Object.freeze(['Power BI', 'Tableau']),
  Object.freeze(['AWS', 'Microsoft Azure']),
  Object.freeze(['Google Cloud Platform', 'AWS'])
]);

export function getTerminologyConceptById(id) {
  return TERMINOLOGY_CONCEPTS.find((item) => item.id === id) || null;
}
