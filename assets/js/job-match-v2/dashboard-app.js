import { renderJobMatchDashboard } from './dashboard-ui.js';
import { createImprovementWorkflow } from './improvement-workflow.js';

export function mountJobMatchDashboard({
  root,
  initialState,
  analyzeRevisedResume,
  onRequestNewAnalysis = null,
  onSensitiveDataCleared = null,
  documentRef = root?.ownerDocument || globalThis.document
}) {
  if (!root) throw new TypeError('A dashboard root element is required.');
  if (!initialState?.analysis?.jobMatch) {
    throw new TypeError('A completed ATS & Job Match V2 state is required.');
  }
  if (typeof analyzeRevisedResume !== 'function') {
    throw new TypeError('A revised-resume analysis callback is required.');
  }

  let workflow = createImprovementWorkflow({
    initialState,
    analyzeRevisedResume
  });
  let renderer = null;

  function renderCurrent(state, comparison = null) {
    renderer?.destroy?.();
    renderer = renderJobMatchDashboard({
      root,
      state,
      comparison,
      documentRef,
      callbacks: {
        async onReanalyze(input) {
          const result = await workflow.reanalyze(input.file || input.text);
          renderCurrent(result.state, result.comparison);
        },

        async onNewAnalysis() {
          workflow.startNewAnalysis();
          renderer = null;
          if (typeof onRequestNewAnalysis === 'function') {
            await onRequestNewAnalysis();
          }
        },

        async onClearSensitiveData() {
          workflow.clearSensitiveData();
          renderer = null;
          if (typeof onSensitiveDataCleared === 'function') {
            await onSensitiveDataCleared();
          }
        }
      }
    });
    return renderer;
  }

  renderCurrent(initialState, workflow.getComparison());

  return Object.freeze({
    getState() {
      return workflow.getState();
    },

    getComparison() {
      return workflow.getComparison();
    },

    update(state) {
      if (!state?.analysis?.jobMatch) {
        throw new TypeError('A completed analysis state is required.');
      }
      workflow.clearSensitiveData();
      workflow = createImprovementWorkflow({
        initialState: state,
        analyzeRevisedResume
      });
      return renderCurrent(state, workflow.getComparison()).viewModel;
    },

    destroy() {
      workflow.clearSensitiveData();
      renderer?.destroy?.();
      renderer = null;
    }
  });
}
