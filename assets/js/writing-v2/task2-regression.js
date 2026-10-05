import {
  WRITING_MODE,MESSAGE_TYPE,AUDIENCE,TONE,LENGTH,IMPROVEMENT
} from "./contracts.js";
import {
  createWritingUiState,setWritingMode,updateWriteSetting,updateWriteField,
  updateImproveField,updateOutputDraft,validateWritingUiState,
  generateWritingUiOutput,resetOutputToGenerated,textExportContent,fieldLimit
} from "./task2-state.js";
import {
  createWritingDraftStore,WRITING_STORAGE_KEY,WRITING_STORAGE_SCHEMA
} from "./task2-storage.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function memoryStorage(){
  const map=new Map([["unrelated.key","keep"]]);
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    raw:(key,value)=>map.set(key,String(value)),
    has:key=>map.has(key),
    value:key=>map.get(key),
  };
}
function baseWrite(type){
  return createWritingUiState({
    mode:WRITING_MODE.WRITE,
    write:{
      messageType:type,
      audience:AUDIENCE.MANAGER,
      tone:TONE.PROFESSIONAL,
      length:LENGTH.STANDARD,
      recipient:"Priya",
      senderName:"Arun",
    }
  });
}
function withField(state,key,value){return updateWriteField(state,key,value)}

export function runProfessionalWritingTask2Regression(){
  let state=createWritingUiState();
  assert(state.mode===WRITING_MODE.WRITE,"Default mode should be Write.");
  assert(state.write.messageType===MESSAGE_TYPE.PROFESSIONAL_EMAIL,"Default message type should be Professional email.");

  const emptyValidation=validateWritingUiState(state);
  assert(!emptyValidation.ok&&Boolean(emptyValidation.errors.facts),"Professional email should identify missing facts at field level.");

  state=withField(state,"facts","report is complete\nfigures checked");
  state=withField(state,"topic","Q4 report");
  state=generateWritingUiOutput(state);
  assert(/Q4 report/.test(state.output.subject),"Generated subject should be stored.");
  assert(/Report is complete\./.test(state.output.text),"Generated output should use Task 1 engine.");
  assert(state.output.dirtyText===false,"Fresh generated output should not be dirty.");

  state=updateOutputDraft(state,"text","My manually edited final wording.");
  const editedBefore=state.output.text;
  state=withField(state,"facts","updated source fact");
  assert(state.output.text===editedBefore&&state.output.dirtyText===true,"Input changes must not overwrite manually edited output.");

  state=resetOutputToGenerated(state,"text");
  assert(state.output.text===state.output.generatedText&&state.output.dirtyText===false,"Explicit reset should restore generated output.");

  let improve=setWritingMode(state,WRITING_MODE.IMPROVE);
  improve=updateImproveField(improve,"improvement",IMPROVEMENT.DIPLOMATIC);
  improve=updateImproveField(improve,"existingText","");
  const improveMissing=validateWritingUiState(improve);
  assert(!improveMissing.ok&&Boolean(improveMissing.errors.existingText),"Improve mode should identify missing pasted text.");

  improve=updateImproveField(improve,"existingText","You need to send the report by October 10, 2026.");
  improve=generateWritingUiOutput(improve);
  assert(/Could you please/i.test(improve.output.text),"Improve mode should use the selected Task 1 objective.");
  assert(/October 10, 2026/.test(improve.output.text),"Improve mode should preserve protected facts.");

  let switched=setWritingMode(improve,WRITING_MODE.WRITE);
  assert(switched.improve.existingText.includes("October 10, 2026"),"Switching modes should preserve Improve input.");
  assert(switched.write.fields.facts==="updated source fact","Switching modes should preserve Write input.");

  const samples={
    [MESSAGE_TYPE.PROFESSIONAL_EMAIL]:{facts:"project is ready"},
    [MESSAGE_TYPE.FOLLOW_UP]:{subjectContext:"invoice approval"},
    [MESSAGE_TYPE.LEAVE_REQUEST]:{leaveStart:"October 7, 2026"},
    [MESSAGE_TYPE.RESIGNATION]:{},
    [MESSAGE_TYPE.MEETING_FOLLOW_UP]:{meetingTopic:"Phoenix rollout"},
    [MESSAGE_TYPE.PROFESSIONAL_REPLY]:{responseFacts:"revised file is ready"},
  };
  for(const [type,fields] of Object.entries(samples)){
    let sample=baseWrite(type);
    for(const [key,value] of Object.entries(fields))sample=withField(sample,key,value);
    const valid=validateWritingUiState(sample);
    assert(valid.ok,"Valid "+type+" state should pass validation.");
    sample=generateWritingUiOutput(sample);
    assert(Boolean(sample.output.text.trim()),type+" should generate editable output.");
  }

  let tooLong=baseWrite(MESSAGE_TYPE.PROFESSIONAL_EMAIL);
  tooLong=withField(tooLong,"facts","x".repeat(fieldLimit("facts")+1));
  const longValidation=validateWritingUiState(tooLong);
  assert(!longValidation.ok&&/characters/.test(longValidation.errors.facts),"Field-specific length errors should be returned.");

  let recipientLong=baseWrite(MESSAGE_TYPE.RESIGNATION);
  recipientLong=updateWriteSetting(recipientLong,"recipient","x".repeat(fieldLimit("recipient")+1));
  const recipientValidation=validateWritingUiState(recipientLong);
  assert(!recipientValidation.ok&&Boolean(recipientValidation.errors.recipient),"Optional bounded fields should receive field-level errors.");

  let exportState=baseWrite(MESSAGE_TYPE.PROFESSIONAL_EMAIL);
  exportState=withField(exportState,"facts","proposal is attached");
  exportState=generateWritingUiOutput(exportState);
  const exported=textExportContent(exportState);
  assert(exported.startsWith("Subject: "),"Write-mode TXT should include the editable subject.");
  assert(exported.includes(exportState.output.text),"TXT should include the editable message.");

  let improveExport=createWritingUiState({
    mode:WRITING_MODE.IMPROVE,
    improve:{improvement:IMPROVEMENT.PROFESSIONAL,existingText:"hi team pls review"},
  });
  improveExport=generateWritingUiOutput(improveExport);
  assert(!textExportContent(improveExport).startsWith("Subject:"),"Improve-mode TXT should not invent a subject.");

  const storage=memoryStorage();
  const store=createWritingDraftStore(storage);
  let persisted=baseWrite(MESSAGE_TYPE.FOLLOW_UP);
  persisted=withField(persisted,"subjectContext","invoice approval");
  persisted=withField(persisted,"deadline","October 12, 2026");
  persisted=generateWritingUiOutput(persisted);
  persisted=updateOutputDraft(persisted,"text","My final manually edited follow-up.");

  const saved=store.save(persisted);
  assert(saved.ok,"Draft save should succeed.");
  const raw=JSON.parse(storage.value(WRITING_STORAGE_KEY));
  assert(raw.schema===WRITING_STORAGE_SCHEMA,"Draft should use the expected schema.");

  const loaded=store.load();
  assert(loaded.ok&&loaded.state,"Saved draft should restore.");
  assert(loaded.state.write.messageType===MESSAGE_TYPE.FOLLOW_UP,"Message type should restore.");
  assert(loaded.state.write.fields.deadline==="October 12, 2026","Message-specific fields should restore.");
  assert(loaded.state.output.text==="My final manually edited follow-up.","Manual output edit should restore exactly.");
  assert(loaded.state.output.dirtyText===true,"Manual dirty state should restore.");
  assert(storage.value("unrelated.key")==="keep","Saving should not alter unrelated browser storage.");

  storage.raw(WRITING_STORAGE_KEY,"{broken");
  const corrupt=store.load();
  assert(!corrupt.ok&&corrupt.reason==="corrupt_data","Corrupt saved data should fail safely.");

  storage.raw(WRITING_STORAGE_KEY,JSON.stringify({schema:99,state:{}}));
  const future=store.load();
  assert(!future.ok&&future.reason==="unsupported_schema","Unsupported future schema should fail safely.");

  store.save(persisted);
  assert(store.clear().ok,"Scoped clear should succeed.");
  assert(!storage.has(WRITING_STORAGE_KEY),"Scoped draft should be removed.");
  assert(storage.value("unrelated.key")==="keep","Scoped clear must preserve unrelated storage.");

  const unavailable=createWritingDraftStore(null);
  assert(!unavailable.save(state).ok,"Unavailable storage should fail safely.");
  assert(!unavailable.load().ok,"Unavailable storage load should fail safely.");

  return Object.freeze({
    pass:true,
    writeImproveModes:true,
    fieldLevelValidation:true,
    sixMessageTypes:true,
    manualEditPreservation:true,
    explicitRegenerate:true,
    modeStatePreservation:true,
    txtExport:true,
    fullDraftPersistence:true,
    corruptRecovery:true,
    schemaGuard:true,
    scopedClear:true,
    storageUnavailableSafe:true,
  });
}
