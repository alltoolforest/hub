import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  WRITING_MODE,MESSAGE_TYPE,AUDIENCE,TONE,LENGTH,IMPROVEMENT,MAX_INPUT_CHARS
} from "./contracts.js";
import { createProfessionalWriting } from "./engine.js";
import {
  createWritingUiState,updateImproveField,validateWritingUiState,
  generateWritingUiOutput,textExportContent
} from "./task2-state.js";
import { createWritingDraftStore,WRITING_STORAGE_KEY } from "./task2-storage.js";

function memoryStorage(){
  const data=new Map();
  return {
    getItem:key=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key),
    dump:()=>new Map(data),
  };
}

function writeInput(facts){
  return {
    mode:WRITING_MODE.WRITE,
    messageType:MESSAGE_TYPE.PROFESSIONAL_EMAIL,
    audience:AUDIENCE.MANAGER,
    tone:TONE.PROFESSIONAL,
    length:LENGTH.STANDARD,
    recipient:"Manager",
    senderName:"Alex",
    fields:{topic:"Security review",facts,requestedAction:"Please review this.",deadline:"October 10, 2026"},
  };
}

const hostile=[
  '<img src=x onerror="alert(1)">',
  '<script>alert("x")</script>',
  'javascript:alert(1)',
  '"><svg onload=alert(1)>',
  '{{constructor.constructor("alert(1)")()}}',
  'Robert\u202Etxt.exe',
];

for(const payload of hostile){
  const out=createProfessionalWriting(writeInput(payload));
  assert.equal(typeof out.text,"string");
  assert.ok(out.text.includes(payload) || out.text.includes(payload.replace(/^[a-z]/,m=>m.toUpperCase())),
    "Hostile-looking text must remain plain text, not executable markup.");
}

const improved=createProfessionalWriting({
  mode:WRITING_MODE.IMPROVE,
  improvement:IMPROVEMENT.PROFESSIONAL,
  existingText:'hello <script>alert("x")</script> please email test@example.com on October 10, 2026',
});
assert.ok(improved.text.includes("<script>alert"));
assert.ok(improved.text.includes("test@example.com"));
assert.ok(improved.text.includes("October 10, 2026"));

let state=createWritingUiState();
state=updateImproveField(state,"existingText","x".repeat(MAX_INPUT_CHARS));
assert.equal(validateWritingUiState(state).ok,true);
const start=performance.now();
state=generateWritingUiOutput(state);
const elapsed=performance.now()-start;
assert.ok(elapsed<1000,"Maximum supported input should process without a long synchronous stall in Node.");
assert.equal(textExportContent(state).length>0,true);

let tooLong=createWritingUiState();
tooLong=updateImproveField(tooLong,"existingText","x".repeat(MAX_INPUT_CHARS+1));
assert.equal(validateWritingUiState(tooLong).ok,false);

const storage=memoryStorage();
const store=createWritingDraftStore(storage);
const saved=store.save(createWritingUiState({
  improve:{existingText:'Private draft <script>alert("x")</script>'}
}));
assert.equal(saved.ok,true);
assert.equal(storage.dump().size,1);
assert.ok(storage.dump().has(WRITING_STORAGE_KEY));
const loaded=store.load();
assert.equal(loaded.ok,true);
assert.equal(loaded.state.improve.existingText,'Private draft <script>alert("x")</script>');
assert.equal(store.clear().ok,true);
assert.equal(storage.dump().size,0);

console.log("Task 3 regression PASS");
console.log(JSON.stringify({
  hostilePlainTextCases:hostile.length,
  maxInputChars:MAX_INPUT_CHARS,
  maxInputProcessingMs:Number(elapsed.toFixed(2)),
  storageScopedAndClearable:true,
  networkDependencyAdded:false,
}));
