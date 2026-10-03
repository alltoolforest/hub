import { createEmptyAnalysisState, isCanonicalAnalysisState } from './schema.js';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function assertCanonical(value) {
  if (!isCanonicalAnalysisState(value)) {
    throw new TypeError('ATS & Job Match V2 state does not match the canonical Task 1 schema.');
  }
}

export function createAnalysisStore(initialState = createEmptyAnalysisState()) {
  assertCanonical(initialState);

  let state = clone(initialState);
  const listeners = new Set();

  function emit() {
    const snapshot = clone(state);
    for (const listener of listeners) listener(snapshot);
  }

  return Object.freeze({
    getState() {
      return clone(state);
    },

    replace(nextState) {
      assertCanonical(nextState);
      state = clone(nextState);
      emit();
      return clone(state);
    },

    update(mutator) {
      if (typeof mutator !== 'function') {
        throw new TypeError('State update requires a mutator function.');
      }
      const draft = clone(state);
      const result = mutator(draft);
      const nextState = result === undefined ? draft : result;
      assertCanonical(nextState);
      state = clone(nextState);
      emit();
      return clone(state);
    },

    reset() {
      state = createEmptyAnalysisState();
      emit();
      return clone(state);
    },

    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('State listener must be a function.');
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
