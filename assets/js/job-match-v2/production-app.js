import { createEmptyAnalysisState, isCanonicalAnalysisState } from './schema.js';
import {
  parseResumeFile,
  parsePastedResume,
  applyParsedResumeToState
} from './resume-parser.js';
import {
  analyzeJobDescription,
  applyJobDescriptionIntelligenceToState
} from './job-description-engine.js';
import {
  analyzeAtsReadiness,
  applyAtsReadinessToState
} from './ats-readiness-engine.js';
import {
  analyzeJobMatch,
  applyJobMatchToState
} from './job-match-engine.js';
import {
  analyzeCoverageAndPriorities,
  applyCoverageAndPrioritiesToState
} from './coverage-priority-engine.js';
import { mountJobMatchDashboard } from './dashboard-app.js';

function text(value) {
  return String(value ?? '').trim();
}

function messageFromError(error) {
  const value = text(error?.message);
  return value || 'The analysis could not be completed. Review the inputs and try again.';
}

export async function runJobMatchAnalysis({
  resumeFile = null,
  resumeText = '',
  jobDescription = '',
  documentRef = globalThis.document
} = {}) {
  const pasted = text(resumeText);
  const jd = text(jobDescription);

  if (!jd) throw new TypeError('Paste the job description before analyzing.');
  if (resumeFile && pasted) {
    throw new TypeError('Use either a PDF/DOCX resume file or pasted resume text, not both.');
  }
  if (!resumeFile && !pasted) {
    throw new TypeError('Choose a PDF/DOCX resume or paste resume text before analyzing.');
  }

  let state = createEmptyAnalysisState();
  state.metadata = {
    ...state.metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    engineVersion: 'job-match-v2/production-release-1'
  };

  const parsedResume = resumeFile
    ? await parseResumeFile(resumeFile, { documentRef })
    : parsePastedResume(pasted);

  state = applyParsedResumeToState(state, parsedResume);

  const jobResult = analyzeJobDescription(jd);
  state = applyJobDescriptionIntelligenceToState(state, jobResult);

  const atsResult = analyzeAtsReadiness(state);
  state = applyAtsReadinessToState(state, atsResult);

  const matchResult = analyzeJobMatch(state);
  state = applyJobMatchToState(state, matchResult);

  const coverageResult = analyzeCoverageAndPriorities(state);
  state = applyCoverageAndPrioritiesToState(state, coverageResult);

  state.metadata.updatedAt = new Date().toISOString();

  if (!isCanonicalAnalysisState(state)) {
    throw new Error('The analysis result did not pass the internal state integrity check.');
  }

  return state;
}

export function mountProductionJobMatch({
  documentRef = globalThis.document
} = {}) {
  const form = documentRef?.querySelector?.('#job-match-form');
  const fileInput = documentRef?.querySelector?.('#job-match-resume-file');
  const resumeText = documentRef?.querySelector?.('#job-match-resume-text');
  const jobText = documentRef?.querySelector?.('#job-match-job-description');
  const analyzeButton = documentRef?.querySelector?.('#job-match-analyze');
  const status = documentRef?.querySelector?.('#job-match-status');
  const inputPanel = documentRef?.querySelector?.('#job-match-input-panel');
  const resultsRoot = documentRef?.querySelector?.('#job-match-results');

  if (!form || !fileInput || !resumeText || !jobText || !analyzeButton || !status || !inputPanel || !resultsRoot) {
    throw new Error('ATS & Job Match Analyzer production controls are incomplete.');
  }

  let dashboard = null;
  let lastJobDescription = '';

  function announce(message, isError = false) {
    status.textContent = message;
    status.className = isError ? 'jm-production-status jm-production-status--error' : 'jm-production-status';
  }

  function setBusy(busy) {
    analyzeButton.disabled = busy;
    analyzeButton.setAttribute('aria-busy', busy ? 'true' : 'false');
    analyzeButton.textContent = busy ? 'Analyzing…' : 'Analyze resume';
  }

  function showInput({ clear = false } = {}) {
    dashboard?.destroy?.();
    dashboard = null;
    resultsRoot.replaceChildren();
    resultsRoot.hidden = true;
    inputPanel.hidden = false;
    if (clear) {
      form.reset();
      lastJobDescription = '';
    }
    announce(clear ? 'Ready for a new analysis.' : '');
    if (clear) resumeText.focus();
  }

  async function analyzeRevisedResume(input, currentState) {
    const rawJob = currentState?.jobDescription?.rawText || lastJobDescription;
    if (!rawJob) throw new Error('The original job description is no longer available. Start a new analysis.');

    const revisedState = await runJobMatchAnalysis({
      resumeFile: typeof input === 'string' ? null : input,
      resumeText: typeof input === 'string' ? input : '',
      jobDescription: rawJob,
      documentRef
    });

    lastJobDescription = rawJob;
    return revisedState;
  }

  function showResults(state) {
    inputPanel.hidden = true;
    resultsRoot.hidden = false;
    resultsRoot.replaceChildren();

    dashboard?.destroy?.();
    dashboard = mountJobMatchDashboard({
      root: resultsRoot,
      initialState: state,
      analyzeRevisedResume,
      documentRef,
      onRequestNewAnalysis: async () => {
        showInput({ clear: true });
      },
      onSensitiveDataCleared: async () => {
        showInput({ clear: true });
      }
    });

    resultsRoot.focus?.();
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) resumeText.value = '';
  });

  resumeText.addEventListener('input', () => {
    if (resumeText.value.trim() && fileInput.value) fileInput.value = '';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(true);
    announce('Analyzing locally in your browser…');

    try {
      const state = await runJobMatchAnalysis({
        resumeFile: fileInput.files?.[0] || null,
        resumeText: resumeText.value,
        jobDescription: jobText.value,
        documentRef
      });
      lastJobDescription = state.jobDescription.rawText;
      announce('Analysis complete.');
      showResults(state);
    } catch (error) {
      announce(messageFromError(error), true);
    } finally {
      setBusy(false);
    }
  });

  return Object.freeze({
    analyze: runJobMatchAnalysis,
    reset() {
      showInput({ clear: true });
    },
    destroy() {
      dashboard?.destroy?.();
      dashboard = null;
      lastJobDescription = '';
      resultsRoot.replaceChildren();
      form.reset();
    }
  });
}

if (globalThis.document?.querySelector?.('#job-match-form')) {
  try {
    mountProductionJobMatch({ documentRef: globalThis.document });
  } catch (error) {
    const status = globalThis.document.querySelector('#job-match-status');
    if (status) {
      status.textContent = messageFromError(error);
      status.className = 'jm-production-status jm-production-status--error';
    }
    console.error(error);
  }
}
