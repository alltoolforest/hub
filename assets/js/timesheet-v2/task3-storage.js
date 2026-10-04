import { TASK1_VERSION } from "./contracts.js";
import { cloneState } from "./task2-state.js";
import { assertRestorableState } from "./task3-validation.js";

export const TIMESHEET_STORAGE_KEY="alltoolforest.timesheet-v2.week";
export const TIMESHEET_STORAGE_SCHEMA=1;
export const MAX_STORED_CHARS=100000;

function safeStorage(storage) {
  return storage&&typeof storage.getItem==="function"&&typeof storage.setItem==="function"&&typeof storage.removeItem==="function"?storage:null;
}

function envelope(state) {
  return {
    schema:TIMESHEET_STORAGE_SCHEMA,
    engineVersion:TASK1_VERSION,
    savedAt:new Date().toISOString(),
    state:cloneState(state),
  };
}

export function createTimesheetStore(storage) {
  const target=safeStorage(storage);
  return {
    save(state) {
      if (!target) return {ok:false,reason:"storage_unavailable"};
      try {
        assertRestorableState(state);
        const serialized=JSON.stringify(envelope(state));
        if (serialized.length>MAX_STORED_CHARS) return {ok:false,reason:"storage_too_large"};
        target.setItem(TIMESHEET_STORAGE_KEY,serialized);
        return {ok:true};
      } catch(error) {
        return {ok:false,reason:"invalid_state",message:error.message};
      }
    },
    load() {
      if (!target) return {ok:false,reason:"storage_unavailable",state:null};
      let raw;
      try { raw=target.getItem(TIMESHEET_STORAGE_KEY); }
      catch { return {ok:false,reason:"storage_failed",state:null}; }
      if (!raw) return {ok:true,state:null};
      if (raw.length>MAX_STORED_CHARS) return {ok:false,reason:"storage_too_large",state:null};

      try {
        const parsed=JSON.parse(raw);
        if (parsed?.schema!==TIMESHEET_STORAGE_SCHEMA) return {ok:false,reason:"unsupported_schema",state:null};
        if (parsed?.engineVersion!==TASK1_VERSION) return {ok:false,reason:"unsupported_engine_version",state:null};
        assertRestorableState(parsed.state);
        return {ok:true,state:cloneState(parsed.state),savedAt:parsed.savedAt||null};
      } catch {
        return {ok:false,reason:"corrupt_data",state:null};
      }
    },
    clear() {
      if (!target) return {ok:false,reason:"storage_unavailable"};
      try { target.removeItem(TIMESHEET_STORAGE_KEY); return {ok:true}; }
      catch { return {ok:false,reason:"storage_failed"}; }
    },
  };
}
