import { createBuilderState } from "./builder-state.js";

export const DRAFT_STORAGE_KEY = "alltoolforest.cover-letter-v2.draft";

export function createDraftStore(storage) {
  const safeStorage = storage && typeof storage.getItem === "function" && typeof storage.setItem === "function"
    ? storage
    : null;

  return {
    save(state) {
      if (!safeStorage) return { ok: false, reason: "storage_unavailable" };
      try {
        const payload = createBuilderState(state);
        safeStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
        return { ok: true };
      } catch {
        return { ok: false, reason: "storage_failed" };
      }
    },
    load() {
      if (!safeStorage) return { ok: false, reason: "storage_unavailable", state: null };
      try {
        const raw = safeStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return { ok: true, state: null };
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== "cover-letter-v2-task3") {
          return { ok: false, reason: "invalid_draft", state: null };
        }
        return { ok: true, state: createBuilderState(parsed) };
      } catch {
        return { ok: false, reason: "invalid_draft", state: null };
      }
    },
    clear() {
      if (!safeStorage || typeof safeStorage.removeItem !== "function") return { ok: false, reason: "storage_unavailable" };
      try {
        safeStorage.removeItem(DRAFT_STORAGE_KEY);
        return { ok: true };
      } catch {
        return { ok: false, reason: "storage_failed" };
      }
    },
  };
}
