const ROLE_PROFILES = Object.freeze([
  {
    id: 'sap-basis', category: 'IT / ERP',
    titles: ['SAP Basis Administrator','SAP Basis Consultant','SAP Basis Engineer','SAP System Administrator'],
    aliases: ['sap basis','basis admin','basis administrator','basis consultant'],
    skills: ['SAP Basis administration','System monitoring','User and authorization administration','Transport management','SAP system troubleshooting'],
    responsibilities: ['Monitor SAP system availability, background jobs, logs and operational health.','Support SAP user administration, authorizations and routine Basis activities.','Coordinate transports, system changes and technical issue resolution according to defined procedures.']
  },
  {
    id: 'sap-fico', category: 'IT / ERP',
    titles: ['SAP FICO Analyst','SAP FICO Consultant','SAP FI Consultant','SAP CO Consultant','SAP Finance Consultant'],
    aliases: ['sap fico','sap fi','sap co','fi co','fico consultant','sap finance'],
    skills: ['SAP FI','SAP CO','Financial process analysis','Configuration support','Business process documentation'],
    responsibilities: ['Support SAP FI/CO processes, configuration activities and business-user requirements.','Analyze finance-related issues and document functional findings or change requirements.','Coordinate testing, issue resolution and process documentation for SAP finance workflows.']
  },
  {
    id: 'sap-logistics', category: 'IT / ERP',
    titles: ['SAP MM Consultant','SAP MM Analyst','SAP SD Consultant','SAP SD Analyst','SAP PP Consultant','SAP WM Consultant','SAP EWM Consultant'],
    aliases: ['sap mm','sap sd','sap pp','sap wm','sap ewm','materials management','sales distribution','production planning'],
    skills: ['SAP functional analysis','Business process mapping','Configuration support','Functional testing','Master data'],
    responsibilities: ['Support configured SAP business processes within the assigned functional module.','Analyze user requirements and document functional issues or change requests.','Coordinate testing and issue resolution with business and technical stakeholders.']
  },
  {
    id: 'sap-development', category: 'IT / ERP',
    titles: ['SAP ABAP Developer','SAP ABAP Consultant','SAP UI5 Developer','SAP Fiori Developer','SAP Integration Consultant'],
    aliases: ['sap abap','abap developer','sap ui5','sap fiori','sap integration'],
    skills: ['SAP development','Debugging','Technical documentation','Unit testing','Transport management'],
    responsibilities: ['Develop or maintain SAP technical components according to approved requirements.','Debug application issues and document technical findings.','Test code changes and coordinate approved transports across environments.']
  },
  {
    id: 'software-development', category: 'IT / Software',
    titles: ['Software Engineer','Software Developer','Java Developer','Python Developer','.NET Developer','C# Developer','C++ Developer','Frontend Developer','Backend Developer','Full Stack Developer','Mobile App Developer','Android Developer','iOS Developer','Web Developer'],
    aliases: ['software','developer','programmer','java','python','.net','dotnet','frontend','backend','full stack','android','ios','web developer'],
    skills: ['Software development','Testing and debugging','Version control','Technical documentation','Problem solving'],
    responsibilities: ['Develop and maintain software components according to approved requirements and technical standards.','Test and debug application behavior and resolve identified defects.','Document code changes and collaborate with relevant technical stakeholders.']
  },
  {
    id: 'qa-testing', category: 'IT / Software',
    titles: ['QA Engineer','Software Test Engineer','Manual Tester','Automation Test Engineer','SDET','Performance Test Engineer','Test Analyst'],
    aliases: ['qa engineer','software tester','manual tester','automation tester','sdet','test analyst','performance testing'],
    skills: ['Software testing','Test case design','Defect reporting','Regression testing','Quality assurance'],
    responsibilities: ['Design and execute tests against defined software requirements.','Record reproducible defects and validate fixes through retesting.','Maintain test evidence and communicate quality risks to relevant stakeholders.']
  },
  {
    id: 'cloud-devops', category: 'IT / Cloud',
    titles: ['DevOps Engineer','Cloud Engineer','Cloud Administrator','Site Reliability Engineer','SRE','Platform Engineer','AWS Engineer','Azure Engineer','Google Cloud Engineer','Kubernetes Administrator'],
    aliases: ['devops','cloud','sre','site reliability','aws','azure','gcp','google cloud','kubernetes','platform engineer'],
    skills: ['Cloud infrastructure','CI/CD','Infrastructure automation','Monitoring','Container platforms'],
    responsibilities: ['Operate and improve cloud or platform infrastructure according to reliability and security requirements.','Maintain deployment automation, monitoring and operational documentation.','Investigate infrastructure incidents and coordinate corrective actions.']
  },
  {
    id: 'cybersecurity', category: 'IT / Cybersecurity',
    titles: ['Cybersecurity Analyst','Security Analyst','SOC Analyst','Security Engineer','Information Security Analyst','Penetration Tester','Vulnerability Analyst','IAM Analyst','GRC Analyst'],
    aliases: ['cybersecurity','cyber security','soc','security analyst','infosec','penetration tester','pentester','iam','grc','vulnerability'],
    skills: ['Security monitoring','Incident analysis','Risk assessment','Security controls','Documentation'],
    responsibilities: ['Monitor or assess security events, controls and risks relevant to the assigned role.','Investigate findings and document evidence, impact and recommended actions.','Escalate security issues according to defined incident or governance procedures.']
  },
  {
    id: 'data-analytics', category: 'Data / Analytics',
    titles: ['Data Analyst','Business Intelligence Analyst','BI Developer','Reporting Analyst','MIS Analyst','SQL Developer','Analytics Consultant'],
    aliases: ['data analyst','business intelligence','bi analyst','bi developer','reporting analyst','mis analyst','sql developer','analytics'],
    skills: ['Data analysis','SQL','Reporting','Data visualization','Data validation'],
    responsibilities: ['Analyze data and prepare reports or insights aligned with defined business requirements.','Validate data quality and investigate inconsistencies in source or reporting data.','Document analysis methods, findings and reporting logic clearly.']
  },
  {
    id: 'data-science-ai', category: 'Data / AI',
    titles: ['Data Scientist','Machine Learning Engineer','AI Engineer','NLP Engineer','Computer Vision Engineer','MLOps Engineer','AI Research Engineer'],
    aliases: ['data science','data scientist','machine learning','ml engineer','ai engineer','nlp','computer vision','mlops'],
    skills: ['Statistical analysis','Machine learning','Model evaluation','Data preparation','Experiment documentation'],
    responsibilities: ['Develop or evaluate data-driven models according to approved analytical objectives.','Prepare and validate data used for experiments or model development.','Document methodology, results, limitations and implementation considerations.']
  },
  {
    id: 'it-infrastructure', category: 'IT / Infrastructure',
    titles: ['System Administrator','Network Administrator','Network Engineer','IT Administrator','IT Support Engineer','Desktop Support Engineer','Help Desk Technician','NOC Engineer','Database Administrator','DBA'],
    aliases: ['system admin','sysadmin','network admin','network engineer','it support','desktop support','help desk','noc','database administrator','dba'],
    skills: ['IT troubleshooting','Systems administration','Network operations','Incident handling','Technical documentation'],
    responsibilities: ['Maintain assigned IT infrastructure, systems or support services according to operational procedures.','Investigate incidents and document troubleshooting actions and resolutions.','Escalate unresolved infrastructure or service issues through the appropriate support path.']
  },
  {
    id: 'product-project', category: 'Product / Project',
    titles: ['Product Manager','Product Owner','Project Manager','Program Manager','Scrum Master','Business Analyst','Systems Analyst','PMO Analyst'],
    aliases: ['product manager','product owner','project manager','program manager','scrum master','business analyst','systems analyst','pmo'],
    skills: ['Requirements analysis','Stakeholder coordination','Planning','Prioritization','Documentation'],
    responsibilities: ['Coordinate requirements, priorities or delivery activities relevant to the assigned product or project.','Maintain clear plans, decisions and status information for stakeholders.','Track risks, dependencies and agreed follow-up actions.']
  },
  {
    id: 'bpo-customer-service', category: 'BPO / Customer Operations',
    titles: ['Customer Support Executive','Customer Service Representative','Customer Care Executive','Customer Success Executive','Chat Support Executive','Voice Process Executive','Technical Support Executive','Contact Center Representative','Call Center Agent'],
    aliases: ['customer support','customer service','customer care','customer success','call center','contact centre','chat support','technical support','voice process','bpo'],
    skills: ['Customer communication','Issue resolution','Case documentation','Service quality','Escalation handling'],
    responsibilities: ['Handle customer enquiries through channels relevant to the role.','Document customer interactions and resolutions accurately.','Escalate unresolved or high-impact issues through the appropriate process.']
  },
  {
    id: 'bpo-quality-operations', category: 'BPO / Operations',
    titles: ['Quality Analyst','Quality Auditor','Process Associate','Senior Process Associate','Process Analyst','Process Developer','Operations Analyst','Operations Executive','Team Leader BPO','Workforce Management Analyst','WFM Analyst'],
    aliases: ['quality analyst','quality auditor','process associate','process developer','operations analyst','bpo team leader','workforce management','wfm'],
    skills: ['Quality auditing','Process compliance','Reporting','Root-cause analysis','Operational coordination'],
    responsibilities: ['Review work against defined process and quality standards.','Identify recurring gaps and document findings for follow-up.','Prepare operational reporting or feedback based on observed evidence.']
  },
  {
    id: 'financial-crime-compliance', category: 'Banking / Compliance',
    titles: ['Financial Crime Analyst','AML Analyst','KYC Analyst','Transaction Monitoring Analyst','Fraud Analyst','Compliance Analyst','Sanctions Analyst','CDD Analyst','EDD Analyst'],
    aliases: ['aml','kyc','financial crime','fraud','compliance','sanctions','transaction monitoring','cdd','edd'],
    skills: ['KYC review','AML controls','Transaction monitoring','Case documentation','Risk assessment'],
    responsibilities: ['Review customer or transaction information against defined compliance requirements.','Document investigation findings clearly and consistently.','Escalate cases that meet defined risk or exception criteria.']
  },
  {
    id: 'banking-operations', category: 'Banking',
    titles: ['Banking Operations Analyst','Bank Teller','Relationship Manager Banking','Credit Analyst','Loan Officer','Mortgage Underwriter','Trade Finance Analyst','Treasury Analyst','Branch Operations Manager'],
    aliases: ['banking operations','bank teller','relationship manager','credit analyst','loan officer','mortgage','underwriter','trade finance','treasury analyst'],
    skills: ['Banking operations','Customer service','Financial documentation','Risk awareness','Transaction processing'],
    responsibilities: ['Process or review banking activities according to defined procedures and controls.','Maintain accurate customer, transaction or credit documentation.','Escalate exceptions or risk indicators through the appropriate approval process.']
  },
  {
    id: 'accounting-finance', category: 'Finance / Accounting',
    titles: ['Accountant','Senior Accountant','Financial Analyst','FP&A Analyst','Accounts Payable Analyst','Accounts Receivable Analyst','Bookkeeper','Tax Analyst','Cost Accountant','Management Accountant','Finance Executive','Finance Manager'],
    aliases: ['accountant','financial analyst','fp&a','fpa analyst','accounts payable','accounts receivable','ap analyst','ar analyst','bookkeeper','tax analyst','cost accountant','finance executive'],
    skills: ['Financial reporting','Reconciliation','Spreadsheet analysis','Documentation','Data accuracy'],
    responsibilities: ['Prepare or review financial information according to role requirements.','Reconcile records and investigate identified discrepancies.','Maintain clear supporting documentation for financial activities.']
  },
  {
    id: 'audit-risk', category: 'Finance / Risk',
    titles: ['Internal Auditor','External Auditor','Risk Analyst','Operational Risk Analyst','Enterprise Risk Analyst','Controls Analyst','SOX Analyst'],
    aliases: ['internal audit','external audit','risk analyst','operational risk','enterprise risk','controls analyst','sox'],
    skills: ['Risk assessment','Control testing','Audit documentation','Issue tracking','Analytical review'],
    responsibilities: ['Assess assigned processes, risks or controls against defined criteria.','Document evidence, exceptions and findings clearly.','Track remediation actions and communicate material issues to relevant stakeholders.']
  },
  {
    id: 'insurance', category: 'Insurance',
    titles: ['Insurance Underwriter','Claims Analyst','Claims Adjuster','Insurance Operations Analyst','Policy Administrator','Actuarial Analyst','Insurance Sales Agent'],
    aliases: ['insurance','underwriter','claims analyst','claims adjuster','policy administrator','actuarial'],
    skills: ['Policy analysis','Claims review','Risk assessment','Documentation','Customer communication'],
    responsibilities: ['Review policy, claim or underwriting information according to defined insurance requirements.','Document decisions, exceptions and supporting evidence accurately.','Coordinate follow-up with customers, providers or internal stakeholders as required.']
  },
  {
    id: 'human-resources', category: 'Human Resources',
    titles: ['HR Executive','HR Generalist','HR Business Partner','Recruiter','Technical Recruiter','Talent Acquisition Specialist','HR Operations Executive','Payroll Specialist','Compensation and Benefits Analyst','Learning and Development Specialist'],
    aliases: ['hr','human resources','hrbp','recruiter','recruitment','talent acquisition','hr operations','payroll','compensation benefits','learning development'],
    skills: ['Employee or candidate communication','HR operations','Documentation','Stakeholder coordination','Process compliance'],
    responsibilities: ['Coordinate employee or candidate processes according to defined HR requirements.','Maintain accurate people-operation records and documentation.','Communicate status, next steps and required information to relevant stakeholders.']
  },
  {
    id: 'sales', category: 'Sales',
    titles: ['Sales Executive','Sales Representative','Business Development Executive','Business Development Manager','Account Executive','Key Account Manager','Inside Sales Representative','Territory Sales Manager','Sales Manager'],
    aliases: ['sales','business development','bd executive','bdm','account executive','key account','inside sales','territory sales'],
    skills: ['Client communication','Pipeline management','Prospecting','Negotiation','Sales reporting'],
    responsibilities: ['Engage prospects or customers using channels relevant to the role.','Maintain accurate opportunity and follow-up records.','Coordinate sales activities based on customer needs and agreed commercial processes.']
  },
  {
    id: 'marketing', category: 'Marketing',
    titles: ['Marketing Executive','Digital Marketing Executive','Digital Marketing Manager','SEO Analyst','SEO Specialist','SEM Specialist','Performance Marketing Specialist','Content Marketing Specialist','Social Media Manager','Brand Manager','Marketing Analyst'],
    aliases: ['marketing','digital marketing','seo','sem','performance marketing','content marketing','social media','brand manager','marketing analyst'],
    skills: ['Campaign execution','Market research','Content planning','Performance reporting','Audience analysis'],
    responsibilities: ['Plan or execute marketing activities according to campaign objectives and approved channels.','Monitor campaign or audience performance and document results.','Coordinate content, creative or optimization actions with relevant stakeholders.']
  },
  {
    id: 'healthcare-nursing', category: 'Healthcare',
    titles: ['Registered Nurse','Staff Nurse','Nurse Practitioner','Nursing Assistant','Clinical Nurse','ICU Nurse','Emergency Room Nurse','Home Health Nurse'],
    aliases: ['registered nurse','staff nurse','nurse practitioner','nursing assistant','clinical nurse','icu nurse','er nurse','home health nurse'],
    skills: ['Patient care','Clinical documentation','Care coordination','Safety procedures','Communication'],
    responsibilities: ['Provide patient care within the responsibilities and protocols of the assigned nursing role.','Maintain accurate clinical observations and care documentation.','Coordinate patient needs with authorized clinical team members.']
  },
  {
    id: 'healthcare-allied', category: 'Healthcare',
    titles: ['Pharmacist','Pharmacy Technician','Medical Laboratory Technician','Lab Technician','Radiologic Technologist','Physiotherapist','Physical Therapist','Occupational Therapist','Medical Assistant','Dental Assistant'],
    aliases: ['pharmacist','pharmacy technician','lab technician','medical laboratory','radiology technologist','physiotherapist','physical therapist','occupational therapist','medical assistant','dental assistant'],
    skills: ['Clinical procedures','Patient or sample documentation','Safety compliance','Equipment handling','Healthcare communication'],
    responsibilities: ['Perform role-appropriate healthcare or diagnostic activities according to authorized procedures.','Maintain accurate records, results or treatment documentation.','Follow safety, quality and escalation requirements for the assigned healthcare setting.']
  },
  {
    id: 'healthcare-administration', category: 'Healthcare',
    titles: ['Medical Coder','Medical Biller','Healthcare Administrator','Hospital Administrator','Patient Services Representative','Clinical Data Coordinator'],
    aliases: ['medical coder','medical billing','healthcare administrator','hospital administrator','patient services','clinical data'],
    skills: ['Healthcare documentation','Data accuracy','Process compliance','Patient service','Administrative coordination'],
    responsibilities: ['Process healthcare administrative information according to defined policies and role requirements.','Maintain accurate records and resolve documented discrepancies.','Coordinate with authorized clinical, insurance or administrative stakeholders as required.']
  },
  {
    id: 'mechanical-engineering', category: 'Engineering',
    titles: ['Mechanical Engineer','Design Engineer Mechanical','Maintenance Engineer Mechanical','Production Engineer','HVAC Engineer','Automotive Engineer','CAD Engineer'],
    aliases: ['mechanical engineer','mechanical design','maintenance engineer','production engineer','hvac','automotive engineer','cad engineer'],
    skills: ['Engineering analysis','Technical drawings','Maintenance planning','Problem solving','Technical documentation'],
    responsibilities: ['Support design, operation or maintenance activities according to engineering requirements.','Analyze technical issues and document calculations, findings or corrective actions.','Coordinate implementation or maintenance activities with relevant engineering stakeholders.']
  },
  {
    id: 'electrical-electronics', category: 'Engineering',
    titles: ['Electrical Engineer','Electronics Engineer','Electrical Design Engineer','Maintenance Engineer Electrical','Instrumentation Engineer','Control Systems Engineer','PLC Engineer'],
    aliases: ['electrical engineer','electronics engineer','electrical design','instrumentation','control systems','plc engineer'],
    skills: ['Electrical systems','Technical drawings','Testing','Troubleshooting','Safety documentation'],
    responsibilities: ['Support design, testing or maintenance of assigned electrical or control systems.','Investigate technical faults and document findings or corrective actions.','Follow applicable engineering and safety procedures during assigned work.']
  },
  {
    id: 'civil-construction', category: 'Construction / Engineering',
    titles: ['Civil Engineer','Site Engineer','Structural Engineer','Construction Engineer','Quantity Surveyor','Estimator','Planning Engineer','Construction Project Manager','Surveyor'],
    aliases: ['civil engineer','site engineer','structural engineer','construction engineer','quantity surveyor','estimator','planning engineer','surveyor'],
    skills: ['Construction coordination','Technical drawings','Quantity or progress tracking','Safety awareness','Site documentation'],
    responsibilities: ['Coordinate assigned construction or engineering activities against approved plans and specifications.','Maintain accurate site, quantity, progress or inspection documentation.','Escalate technical, quality or safety issues through the appropriate project process.']
  },
  {
    id: 'manufacturing-production', category: 'Manufacturing',
    titles: ['Production Supervisor','Production Operator','Manufacturing Engineer','Process Engineer Manufacturing','Plant Operator','Machine Operator','CNC Operator','Assembly Technician','Production Planner'],
    aliases: ['production supervisor','production operator','manufacturing engineer','plant operator','machine operator','cnc','assembly technician','production planner'],
    skills: ['Production processes','Safety compliance','Quality checks','Equipment operation','Production reporting'],
    responsibilities: ['Perform or coordinate production activities according to approved operating procedures.','Monitor quality, output or equipment conditions relevant to the role.','Document production issues and escalate safety, quality or equipment concerns.']
  },
  {
    id: 'quality-manufacturing', category: 'Manufacturing / Quality',
    titles: ['Quality Engineer','Quality Control Inspector','QC Inspector','Quality Assurance Engineer','Supplier Quality Engineer','Quality Manager'],
    aliases: ['quality engineer','qc inspector','quality control','quality assurance engineer','supplier quality','quality manager'],
    skills: ['Quality inspection','Root-cause analysis','Corrective actions','Standards compliance','Quality documentation'],
    responsibilities: ['Inspect or assess products and processes against defined quality requirements.','Document nonconformities and support root-cause or corrective-action activities.','Maintain quality records and communicate material issues to relevant stakeholders.']
  },
  {
    id: 'supply-chain-logistics', category: 'Logistics / Supply Chain',
    titles: ['Supply Chain Analyst','Logistics Coordinator','Logistics Executive','Warehouse Supervisor','Warehouse Associate','Inventory Analyst','Inventory Controller','Procurement Analyst','Buyer','Purchase Executive','Demand Planner','Supply Planner'],
    aliases: ['supply chain','logistics','warehouse','inventory','procurement','buyer','purchase executive','demand planner','supply planner'],
    skills: ['Inventory management','Logistics coordination','Procurement processes','Data accuracy','Operational reporting'],
    responsibilities: ['Coordinate supply, inventory, procurement or logistics activities according to defined processes.','Maintain accurate operational records and investigate discrepancies.','Communicate requirements, delays or exceptions to relevant internal and external stakeholders.']
  },
  {
    id: 'transportation', category: 'Transportation',
    titles: ['Truck Driver','Delivery Driver','Fleet Coordinator','Fleet Manager','Transport Coordinator','Dispatcher','Bus Driver','Courier'],
    aliases: ['truck driver','delivery driver','fleet','transport coordinator','dispatcher','bus driver','courier'],
    skills: ['Route coordination','Safety compliance','Delivery documentation','Time management','Vehicle checks'],
    responsibilities: ['Perform or coordinate transportation activities according to route, safety and service requirements.','Maintain accurate trip, delivery or fleet documentation.','Report delays, incidents or vehicle issues through the defined operational process.']
  },
  {
    id: 'legal', category: 'Legal',
    titles: ['Lawyer','Attorney','Legal Counsel','Legal Associate','Paralegal','Legal Assistant','Contract Analyst','Compliance Counsel'],
    aliases: ['lawyer','attorney','legal counsel','legal associate','paralegal','legal assistant','contract analyst'],
    skills: ['Legal research','Document review','Contract support','Case documentation','Stakeholder communication'],
    responsibilities: ['Research or review legal information relevant to assigned matters under applicable professional requirements.','Prepare or maintain accurate legal, contract or case documentation.','Coordinate deadlines, evidence or stakeholder communication for assigned legal work.']
  },
  {
    id: 'education-teaching', category: 'Education',
    titles: ['Teacher','Primary School Teacher','Secondary School Teacher','High School Teacher','Lecturer','Professor','Teaching Assistant','Special Education Teacher','Tutor','Trainer','Corporate Trainer'],
    aliases: ['teacher','school teacher','lecturer','professor','teaching assistant','special education','tutor','trainer','corporate trainer'],
    skills: ['Instruction','Lesson planning','Assessment','Learner communication','Educational documentation'],
    responsibilities: ['Plan and deliver learning activities appropriate to the assigned subject or learner group.','Assess learner progress using approved methods and maintain relevant records.','Communicate learning needs, progress or support requirements to appropriate stakeholders.']
  },
  {
    id: 'research-science', category: 'Research / Science',
    titles: ['Research Assistant','Research Associate','Research Scientist','Laboratory Researcher','Chemist','Biologist','Microbiologist','Environmental Scientist'],
    aliases: ['research assistant','research associate','research scientist','laboratory researcher','chemist','biologist','microbiologist','environmental scientist'],
    skills: ['Research methods','Data collection','Analysis','Laboratory or field documentation','Reporting'],
    responsibilities: ['Conduct assigned research activities according to approved methods and protocols.','Maintain accurate experimental, field or analytical records.','Analyze results and communicate findings, limitations or anomalies clearly.']
  },
  {
    id: 'hospitality', category: 'Hospitality',
    titles: ['Hotel Manager','Front Desk Executive','Front Office Associate','Guest Relations Executive','Restaurant Manager','Chef','Sous Chef','Cook','Housekeeping Supervisor','Housekeeper','Food and Beverage Executive'],
    aliases: ['hotel manager','front desk','front office','guest relations','restaurant manager','chef','sous chef','cook','housekeeping','food beverage'],
    skills: ['Guest service','Operational coordination','Service standards','Safety and hygiene','Shift documentation'],
    responsibilities: ['Deliver or coordinate hospitality services according to defined service and safety standards.','Maintain accurate guest, shift or operational records relevant to the role.','Resolve or escalate service issues through the appropriate operational process.']
  },
  {
    id: 'retail', category: 'Retail',
    titles: ['Retail Sales Associate','Store Associate','Store Manager','Assistant Store Manager','Cashier','Merchandiser','Visual Merchandiser','Retail Operations Executive'],
    aliases: ['retail','store associate','store manager','cashier','merchandiser','visual merchandiser','retail operations'],
    skills: ['Customer service','Point-of-sale operations','Inventory awareness','Merchandising','Store operations'],
    responsibilities: ['Support store operations and customer service according to defined retail procedures.','Maintain accurate sales, inventory or merchandising information relevant to the role.','Escalate customer, stock or operational issues to the appropriate store leadership.']
  },
  {
    id: 'administration-office', category: 'Administration',
    titles: ['Administrative Assistant','Office Administrator','Office Manager','Executive Assistant','Personal Assistant','Receptionist','Data Entry Operator','Document Controller','Secretary'],
    aliases: ['admin assistant','administrative assistant','office admin','office manager','executive assistant','personal assistant','receptionist','data entry','document controller','secretary'],
    skills: ['Administrative coordination','Document management','Scheduling','Data accuracy','Professional communication'],
    responsibilities: ['Coordinate administrative activities, records or schedules according to office requirements.','Maintain accurate documents, data and correspondence.','Support communication and follow-up actions for relevant internal or external stakeholders.']
  },
  {
    id: 'design-creative', category: 'Design / Creative',
    titles: ['Graphic Designer','UI Designer','UX Designer','UI/UX Designer','Product Designer','Web Designer','Motion Graphic Designer','Video Editor','Animator','Illustrator','Content Designer'],
    aliases: ['graphic designer','ui designer','ux designer','ui ux','product designer','web designer','motion graphics','video editor','animator','illustrator','content designer'],
    skills: ['Visual design','Design tools','User-centered design','Creative production','Design documentation'],
    responsibilities: ['Create or refine design outputs according to approved briefs, requirements or user needs.','Prepare design assets and document relevant decisions or specifications.','Iterate designs using review feedback while maintaining consistency and usability.']
  },
  {
    id: 'architecture', category: 'Architecture',
    titles: ['Architect','Architectural Designer','Interior Designer','Landscape Architect','BIM Modeler','BIM Coordinator'],
    aliases: ['architect','architectural designer','interior designer','landscape architect','bim modeler','bim coordinator'],
    skills: ['Design development','Technical drawings','Building documentation','Design coordination','Regulatory awareness'],
    responsibilities: ['Develop or coordinate design information according to approved requirements and applicable standards.','Prepare and maintain accurate drawings, models or design documentation.','Coordinate design issues with relevant project stakeholders.']
  },
  {
    id: 'government-public-service', category: 'Government / Public Service',
    titles: ['Public Administration Officer','Government Program Officer','Policy Analyst','Public Policy Analyst','Administrative Officer','Municipal Officer','Public Service Officer','Program Coordinator Government'],
    aliases: ['public administration','government officer','policy analyst','public policy','administrative officer','municipal officer','public service'],
    skills: ['Public administration','Policy analysis','Documentation','Stakeholder coordination','Program support'],
    responsibilities: ['Support assigned public-service, policy or administrative activities according to applicable procedures.','Maintain accurate records, correspondence or program documentation.','Coordinate information and follow-up actions with authorized stakeholders.']
  },
  {
    id: 'security-protective', category: 'Protective Services',
    titles: ['Security Officer','Security Guard','Security Supervisor','Loss Prevention Officer','Emergency Management Coordinator','Fire Safety Officer'],
    aliases: ['security officer','security guard','security supervisor','loss prevention','emergency management','fire safety'],
    skills: ['Safety awareness','Incident reporting','Access control','Observation','Emergency procedures'],
    responsibilities: ['Perform assigned protective-service duties according to site and safety procedures.','Observe, document and report incidents or exceptions accurately.','Escalate safety or security concerns through the defined response process.']
  },
  {
    id: 'skilled-electrical', category: 'Skilled Trades',
    titles: ['Electrician','Industrial Electrician','Electrical Technician','Maintenance Electrician','Solar Technician'],
    aliases: ['electrician','industrial electrician','electrical technician','maintenance electrician','solar technician'],
    skills: ['Electrical installation','Troubleshooting','Safety procedures','Testing','Maintenance documentation'],
    responsibilities: ['Install, inspect or maintain electrical systems within the scope of the assigned trade role.','Troubleshoot faults using appropriate testing procedures.','Follow applicable safety requirements and document completed work.']
  },
  {
    id: 'skilled-mechanical', category: 'Skilled Trades',
    titles: ['Mechanical Technician','Maintenance Technician','HVAC Technician','Automotive Technician','Auto Mechanic','Machinist','Welder','Fitter'],
    aliases: ['mechanical technician','maintenance technician','hvac technician','automotive technician','auto mechanic','machinist','welder','fitter'],
    skills: ['Mechanical maintenance','Troubleshooting','Tool and equipment use','Safety procedures','Work documentation'],
    responsibilities: ['Perform assigned maintenance, repair or fabrication activities according to approved procedures.','Inspect equipment or components and document identified faults.','Follow safety requirements and record completed maintenance or repair work.']
  },
  {
    id: 'construction-trades', category: 'Skilled Trades',
    titles: ['Carpenter','Plumber','Mason','Painter','Construction Worker','Equipment Operator','Crane Operator'],
    aliases: ['carpenter','plumber','mason','painter','construction worker','equipment operator','crane operator'],
    skills: ['Trade skills','Tool use','Safety procedures','Measurement','Worksite coordination'],
    responsibilities: ['Perform assigned trade or construction activities according to approved plans and safety procedures.','Use tools, materials and equipment appropriate to the assigned work.','Report worksite hazards, material issues or technical constraints to the appropriate supervisor.']
  },
  {
    id: 'agriculture', category: 'Agriculture',
    titles: ['Agricultural Officer','Agronomist','Farm Manager','Agricultural Technician','Horticulturist','Irrigation Technician'],
    aliases: ['agriculture','agricultural officer','agronomist','farm manager','agricultural technician','horticulturist','irrigation technician'],
    skills: ['Agricultural operations','Crop or field monitoring','Record keeping','Safety','Resource coordination'],
    responsibilities: ['Support agricultural or field activities according to approved operational practices.','Monitor relevant crop, equipment or resource conditions and maintain accurate records.','Report operational issues and coordinate required follow-up actions.']
  },
  {
    id: 'real-estate', category: 'Real Estate',
    titles: ['Real Estate Agent','Property Consultant','Property Manager','Leasing Executive','Real Estate Analyst','Facility Manager'],
    aliases: ['real estate','property consultant','property manager','leasing','real estate analyst','facility manager'],
    skills: ['Client communication','Property documentation','Market awareness','Coordination','Record management'],
    responsibilities: ['Support property, leasing, facility or client activities according to role requirements.','Maintain accurate property, transaction or service documentation.','Coordinate follow-up actions with clients, vendors or internal stakeholders.']
  },
  {
    id: 'procurement-commercial', category: 'Procurement / Commercial',
    titles: ['Procurement Specialist','Procurement Manager','Sourcing Specialist','Category Manager','Commercial Analyst','Contract Administrator'],
    aliases: ['procurement specialist','procurement manager','sourcing','category manager','commercial analyst','contract administrator'],
    skills: ['Sourcing','Vendor coordination','Commercial analysis','Contract documentation','Procurement reporting'],
    responsibilities: ['Coordinate sourcing, procurement or commercial activities according to approved policies.','Maintain accurate supplier, contract or purchasing documentation.','Analyze commercial information and escalate exceptions or risks to relevant stakeholders.']
  }
]);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#./ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ROLE_INDEX = Object.freeze(ROLE_PROFILES.flatMap((profile) =>
  unique(profile.titles).map((title) => Object.freeze({
    title,
    normalizedTitle: normalize(title),
    category: profile.category,
    family: profile.id,
    aliases: unique(profile.aliases || []).map(normalize)
  }))
));

function makeSuggestion(kind, text, family) {
  return Object.freeze({ kind, text, family, provenance: 'suggested', verified: false });
}

function matchProfile(roleTitle) {
  const query = normalize(roleTitle);
  if (!query) return null;
  const exact = ROLE_PROFILES.find((profile) =>
    profile.titles.some((title) => normalize(title) === query) ||
    (profile.aliases || []).some((alias) => normalize(alias) === query)
  );
  if (exact) return exact;

  return ROLE_PROFILES.find((profile) => {
    const titleCandidates = profile.titles.map(normalize);
    const aliasCandidates = (profile.aliases || []).map(normalize);

    const specificTitleMatch = titleCandidates.some((candidate) =>
      candidate && (
        query === candidate ||
        (candidate.includes(' ') && query.includes(candidate)) ||
        (query.includes(' ') && candidate.includes(query))
      )
    );

    const specificAliasMatch = aliasCandidates.some((candidate) =>
      candidate && (
        query === candidate ||
        (candidate.includes(' ') && query.includes(candidate))
      )
    );

    return specificTitleMatch || specificAliasMatch;
  }) || null;
}

export function getTargetRoleSuggestions(query, limit = 8) {
  const value = normalize(query);
  if (value.length < 2) return [];
  const tokens = value.split(' ').filter(Boolean);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));

  const scored = ROLE_INDEX.map((entry) => {
    const title = entry.normalizedTitle;
    const titleTokens = title.split(' ').filter(Boolean);

    let score = Number.POSITIVE_INFINITY;

    // Exact and prefix title matches are strongest.
    if (title === value) score = 0;
    else if (title.startsWith(value)) score = 10 + Math.max(0, title.length - value.length) / 100;
    else if (titleTokens.some((token) => token.startsWith(value))) score = 20;
    else if (title.includes(value)) score = 30;

    // Multi-token queries should reward ordered title coverage.
    const matchedTokens = tokens.filter((token) =>
      titleTokens.some((titleToken) => titleToken.startsWith(token) || titleToken.includes(token))
    ).length;
    if (matchedTokens) {
      const misses = tokens.length - matchedTokens;
      score = Math.min(score, 40 + misses * 20 - matchedTokens * 2);
    }

    // Aliases are useful for abbreviations such as HR, SRE, KYC and SAP,
    // but canonical title text still decides which family title ranks highest.
    for (const alias of entry.aliases) {
      if (alias === value) {
        const titleAffinity = title.includes(value) ? 0 : 8;
        score = Math.min(score, 45 + titleAffinity);
      } else if (alias.startsWith(value) || alias.includes(value)) {
        score = Math.min(score, 55);
      }
    }

    return { title: entry.title, score };
  })
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

  const seen = new Set();
  return scored
    .filter((item) => {
      const key = normalize(item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, safeLimit)
    .map((item) => item.title);
}

export function identifyRoleFamily(roleTitle) {
  const role = clean(roleTitle);
  if (!role) return { id: 'general', category: 'General', confidence: 'none' };
  const found = matchProfile(role);
  return found
    ? { id: found.id, category: found.category, confidence: 'catalog' }
    : { id: 'general', category: 'General', confidence: 'fallback' };
}

export function getRoleSuggestions(roleTitle) {
  const role = clean(roleTitle);
  if (!role) return { role: '', family: 'general', category: 'General', skills: [], responsibilities: [] };
  const found = matchProfile(role);
  if (!found) return { role, family: 'general', category: 'General', skills: [], responsibilities: [] };
  return {
    role,
    family: found.id,
    category: found.category,
    skills: found.skills.map((text) => makeSuggestion('skill', text, found.id)),
    responsibilities: found.responsibilities.map((text) => makeSuggestion('responsibility', text, found.id))
  };
}

export function getRoleCatalogStats() {
  const categories = unique(ROLE_PROFILES.map((profile) => profile.category));
  return Object.freeze({
    profiles: ROLE_PROFILES.length,
    titles: ROLE_INDEX.length,
    categories: categories.length
  });
}
