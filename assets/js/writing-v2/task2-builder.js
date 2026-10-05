import {
  WRITING_MODE,MESSAGE_TYPE,AUDIENCE,TONE,LENGTH,IMPROVEMENT
} from "./contracts.js";
import {
  createWritingUiState,setWritingMode,updateWriteSetting,updateWriteField,
  updateImproveField,updateOutputDraft,validateWritingUiState,
  generateWritingUiOutput,resetOutputToGenerated,textExportContent,fieldLimit
} from "./task2-state.js";
import { createWritingDraftStore } from "./task2-storage.js";

export const MESSAGE_FIELDS=Object.freeze({
  [MESSAGE_TYPE.PROFESSIONAL_EMAIL]:Object.freeze([
    {key:"topic",label:"Topic or purpose",placeholder:"Example: Q4 report",advanced:false},
    {key:"facts",label:"Key information",textarea:true,required:true,placeholder:"Write the facts or points you need to communicate. One point per line works well.",advanced:false},
    {key:"requestedAction",label:"What do you want the reader to do? (optional)",textarea:true,placeholder:"Example: Please review the attached summary",advanced:false},
    {key:"deadline",label:"Deadline (optional)",placeholder:"Example: October 10, 2026",advanced:true},
  ]),
  [MESSAGE_TYPE.FOLLOW_UP]:Object.freeze([
    {key:"subjectContext",label:"What are you following up on?",required:true,placeholder:"Example: invoice approval",advanced:false},
    {key:"requestedAction",label:"What response or action do you need? (optional)",textarea:true,placeholder:"Example: Please confirm the approval status",advanced:false},
    {key:"facts",label:"Additional facts (optional)",textarea:true,placeholder:"Add any details the reader needs.",advanced:false},
    {key:"previousContact",label:"Previous contact/context (optional)",placeholder:"Example: Email sent on September 30, 2026",advanced:true},
    {key:"deadline",label:"Preferred response date (optional)",placeholder:"Example: October 6, 2026",advanced:true},
  ]),
  [MESSAGE_TYPE.LEAVE_REQUEST]:Object.freeze([
    {key:"leaveStart",label:"Leave start date",required:true,placeholder:"Example: October 7, 2026",advanced:false},
    {key:"leaveEnd",label:"Leave end date (optional)",placeholder:"Leave blank for a single day",advanced:false},
    {key:"reason",label:"Reason (optional)",textarea:true,placeholder:"Example: medical appointment",advanced:false},
    {key:"returnDate",label:"Return date (optional)",placeholder:"Example: October 8, 2026",advanced:true},
    {key:"coverage",label:"Handover or coverage (optional)",textarea:true,placeholder:"Example: I will hand over urgent items before I leave",advanced:true},
  ]),
  [MESSAGE_TYPE.RESIGNATION]:Object.freeze([
    {key:"lastWorkingDate",label:"Last working date (optional)",placeholder:"Example: October 31, 2026",advanced:false},
    {key:"transition",label:"Transition or handover note (optional)",textarea:true,placeholder:"Example: I will document current tasks and hand over open items",advanced:false},
    {key:"reason",label:"Reason (optional)",textarea:true,placeholder:"Only include this if you want it in a detailed version",advanced:true},
  ]),
  [MESSAGE_TYPE.MEETING_FOLLOW_UP]:Object.freeze([
    {key:"meetingTopic",label:"Meeting topic or summary",required:true,placeholder:"Example: Phoenix rollout",advanced:false},
    {key:"decisions",label:"Decisions (optional)",textarea:true,placeholder:"One decision per line",advanced:false},
    {key:"actionItems",label:"Action items (optional)",textarea:true,placeholder:"One action item per line. Include owners/deadlines only if known.",advanced:false},
    {key:"meetingDate",label:"Meeting date (optional)",placeholder:"Example: October 5, 2026",advanced:true},
    {key:"nextMeeting",label:"Next meeting (optional)",placeholder:"Example: October 12 at 3 PM",advanced:true},
  ]),
  [MESSAGE_TYPE.PROFESSIONAL_REPLY]:Object.freeze([
    {key:"sourceMessage",label:"Message you are replying to (optional)",textarea:true,placeholder:"Paste the relevant message or summarize it.",advanced:false},
    {key:"responseFacts",label:"What do you need to say?",textarea:true,required:true,placeholder:"Write your reply points. One point per line works well.",advanced:false},
    {key:"requestedAction",label:"Next action (optional)",textarea:true,placeholder:"Example: Please let me know if any other changes are needed",advanced:false},
  ]),
});

const LABELS=Object.freeze({
  messageType:{
    [MESSAGE_TYPE.PROFESSIONAL_EMAIL]:"Professional email",
    [MESSAGE_TYPE.FOLLOW_UP]:"Follow-up",
    [MESSAGE_TYPE.LEAVE_REQUEST]:"Leave request",
    [MESSAGE_TYPE.RESIGNATION]:"Resignation",
    [MESSAGE_TYPE.MEETING_FOLLOW_UP]:"Meeting follow-up",
    [MESSAGE_TYPE.PROFESSIONAL_REPLY]:"Professional reply",
  },
  audience:{
    [AUDIENCE.MANAGER]:"Manager",
    [AUDIENCE.COLLEAGUE]:"Colleague",
    [AUDIENCE.CLIENT]:"Client / customer",
    [AUDIENCE.RECRUITER]:"Recruiter / hiring team",
    [AUDIENCE.VENDOR]:"Vendor / partner",
    [AUDIENCE.OTHER]:"Other",
  },
  tone:{
    [TONE.PROFESSIONAL]:"Professional",
    [TONE.FORMAL]:"Formal",
    [TONE.WARM]:"Warm",
    [TONE.CONCISE]:"Concise",
    [TONE.CONFIDENT]:"Confident",
    [TONE.DIPLOMATIC]:"Diplomatic",
  },
  length:{
    [LENGTH.SHORT]:"Short",
    [LENGTH.STANDARD]:"Standard",
    [LENGTH.DETAILED]:"Detailed",
  },
  improvement:{
    [IMPROVEMENT.PROFESSIONAL]:"Make professional",
    [IMPROVEMENT.CLEARER]:"Make clearer",
    [IMPROVEMENT.CONCISE]:"Make concise",
    [IMPROVEMENT.WARMER]:"Make warmer",
    [IMPROVEMENT.DIPLOMATIC]:"Make diplomatic",
    [IMPROVEMENT.CONFIDENT]:"Make confident",
  },
});

function el(tag,attrs={},text=""){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(key==="className")node.className=value;
    else if(key==="dataset")Object.assign(node.dataset,value);
    else if(key==="textContent")node.textContent=value;
    else if(key in node)node[key]=value;
    else node.setAttribute(key,value);
  }
  if(text)node.textContent=text;
  return node;
}
function option(value,label){return el("option",{value},label)}
function fillSelect(select,labels){
  for(const [value,label] of Object.entries(labels))select.append(option(value,label));
}
function safeStorage(options){
  if(options.storage)return options.storage;
  try{return window.localStorage}catch{return null}
}
function safeFilename(){return "professional-writing.txt"}

export function mountProfessionalWritingTask2(root,options={}){
  if(!root||typeof document==="undefined")throw new Error("A DOM root is required.");
  let state=createWritingUiState(options.seed||{});
  const store=createWritingDraftStore(safeStorage(options));
  const controls=new Map();
  const errors=new Map();

  root.replaceChildren();
  root.classList.add("pwa2");

  const status=el("p",{className:"pwa2-status",role:"status","aria-live":"polite"});

  const modeSection=el("section",{className:"pwa2-card","aria-labelledby":"pwa2-mode-heading"});
  modeSection.append(
    el("h2",{id:"pwa2-mode-heading"},"What do you want to do?"),
    el("p",{className:"pwa2-intro"},"Start from a few facts, or paste writing you already have.")
  );
  const modeGroup=el("fieldset",{className:"pwa2-mode-group"});
  modeGroup.append(el("legend",{className:"sr-only"},"Writing mode"));
  const writeId="pwa2-mode-write", improveId="pwa2-mode-improve";
  const writeRadio=el("input",{id:writeId,type:"radio",name:"pwa2-mode",value:WRITING_MODE.WRITE});
  const improveRadio=el("input",{id:improveId,type:"radio",name:"pwa2-mode",value:WRITING_MODE.IMPROVE});
  const writeLabel=el("label",{htmlFor:writeId,className:"pwa2-mode-choice"},"Write a professional message");
  const improveLabel=el("label",{htmlFor:improveId,className:"pwa2-mode-choice"},"Improve existing writing");
  modeGroup.append(writeRadio,writeLabel,improveRadio,improveLabel);
  modeSection.append(modeGroup);

  const writePanel=el("section",{className:"pwa2-card","aria-labelledby":"pwa2-write-heading"});
  writePanel.append(el("h2",{id:"pwa2-write-heading"},"Write a professional message"));
  const settings=el("div",{className:"pwa2-settings"});
  const messageType=el("select",{id:"pwa2-message-type"});
  const audience=el("select",{id:"pwa2-audience"});
  const tone=el("select",{id:"pwa2-tone"});
  fillSelect(messageType,LABELS.messageType);
  fillSelect(audience,LABELS.audience);
  fillSelect(tone,LABELS.tone);

  function simpleField(label,node,hint=""){
    const wrap=el("div",{className:"pwa2-field"});
    wrap.append(el("label",{htmlFor:node.id},label),node);
    if(hint)wrap.append(el("small",{},hint));
    return wrap;
  }
  settings.append(
    simpleField("Message type",messageType),
    simpleField("Audience",audience),
    simpleField("Tone",tone)
  );
  writePanel.append(settings);

  const keyInfo=el("div",{className:"pwa2-key-info"});
  keyInfo.append(el("h3",{},"Key information"));
  const primaryFields=el("div",{className:"pwa2-fields"});
  keyInfo.append(primaryFields);
  writePanel.append(keyInfo);

  const advanced=el("details",{className:"pwa2-advanced"});
  advanced.append(el("summary",{},"More options"));
  const advancedBody=el("div",{className:"pwa2-advanced-body"});
  const advancedFields=el("div",{className:"pwa2-fields"});
  const length=el("select",{id:"pwa2-length"});
  fillSelect(length,LABELS.length);
  const recipient=el("input",{id:"pwa2-recipient",type:"text",maxLength:fieldLimit("recipient"),autocomplete:"name"});
  const senderName=el("input",{id:"pwa2-sender-name",type:"text",maxLength:fieldLimit("senderName"),autocomplete:"name"});
  advancedFields.append(
    simpleField("Length",length),
    createValidatedField("recipient","Recipient name (optional)",recipient),
    createValidatedField("senderName","Your name (optional)",senderName)
  );
  const dynamicAdvanced=el("div",{className:"pwa2-fields"});
  advancedBody.append(advancedFields,dynamicAdvanced);
  advanced.append(advancedBody);
  writePanel.append(advanced);

  const createButton=el("button",{type:"button",className:"primary pwa2-primary"},"Create professional wording");
  writePanel.append(createButton);

  const improvePanel=el("section",{className:"pwa2-card","aria-labelledby":"pwa2-improve-heading",hidden:true});
  improvePanel.append(
    el("h2",{id:"pwa2-improve-heading"},"Improve existing writing"),
    el("p",{className:"pwa2-intro"},"Paste what you already wrote. The tool will improve the wording while preserving protected details such as names, dates, numbers, email addresses and URLs.")
  );
  const existingText=el("textarea",{
    id:"pwa2-existing-text",
    rows:10,
    maxLength:fieldLimit("existingText"),
    placeholder:"Paste the message you want to improve."
  });
  const improvement=el("select",{id:"pwa2-improvement"});
  fillSelect(improvement,LABELS.improvement);
  const improveFields=el("div",{className:"pwa2-fields"});
  improveFields.append(
    createValidatedField("existingText","Your writing",existingText,""),
    simpleField("How should it improve?",improvement)
  );
  improvePanel.append(improveFields);
  const improveButton=el("button",{type:"button",className:"primary pwa2-primary"},"Improve writing");
  improvePanel.append(improveButton);

  const draft=el("details",{className:"pwa2-draft"});
  draft.append(el("summary",{},"Draft options"));
  const draftActions=el("div",{className:"pwa2-actions"});
  const saveButton=el("button",{type:"button"},"Save draft");
  const restoreButton=el("button",{type:"button"},"Restore draft");
  const clearButton=el("button",{type:"button"},"Clear saved draft");
  draftActions.append(saveButton,restoreButton,clearButton);
  draft.append(draftActions);

  const result=el("section",{className:"pwa2-result","aria-labelledby":"pwa2-result-heading",hidden:true});
  result.append(el("h2",{id:"pwa2-result-heading"},"Your professional wording"));
  const subjectWrap=el("div",{className:"pwa2-field"});
  const subject=el("input",{id:"pwa2-result-subject",type:"text",maxLength:1000});
  subjectWrap.append(el("label",{htmlFor:subject.id},"Subject"),subject);
  const outputText=el("textarea",{id:"pwa2-result-text",rows:12,maxLength:50000});
  const outputWrap=simpleField("Message",outputText);
  const resultActions=el("div",{className:"pwa2-actions"});
  const copyButton=el("button",{type:"button"},"Copy");
  const regenerateButton=el("button",{type:"button"},"Regenerate from current inputs");
  const downloadButton=el("button",{type:"button"},"Download TXT");
  const newButton=el("button",{type:"button"},"New message");
  resultActions.append(copyButton,regenerateButton,downloadButton,newButton);
  result.append(subjectWrap,outputWrap,resultActions);

  root.append(modeSection,writePanel,improvePanel,draft,result,status);

  function errorId(key){return "pwa2-error-"+key}
  function hintId(key){return "pwa2-hint-"+key}

  function createValidatedField(key,labelText,node,hint=""){
    node.dataset.fieldKey=key;
    const wrap=el("div",{className:"pwa2-field"});
    const label=el("label",{htmlFor:node.id},labelText);
    const ids=[];
    wrap.append(label,node);
    if(hint){
      const h=el("small",{id:hintId(key)},hint);
      wrap.append(h);ids.push(h.id);
    }
    const error=el("small",{id:errorId(key),className:"pwa2-error",hidden:true});
    wrap.append(error);ids.push(error.id);
    node.setAttribute("aria-describedby",ids.join(" "));
    controls.set(key,node);
    errors.set(key,error);
    return wrap;
  }

  function fieldNode(spec){
    const node=spec.textarea
      ? el("textarea",{id:"pwa2-field-"+spec.key,rows:spec.key==="facts"||spec.key==="responseFacts"?6:4})
      : el("input",{id:"pwa2-field-"+spec.key,type:"text"});
    node.maxLength=fieldLimit(spec.key);
    node.placeholder=spec.placeholder||"";
    if(spec.required)node.setAttribute("aria-required","true");
    node.addEventListener("input",()=>{
      state=updateWriteField(state,spec.key,node.value);
      clearFieldError(spec.key);
    });
    return createValidatedField(spec.key,spec.label,node,spec.required?"Required":"");
  }

  function renderMessageFields(){
    primaryFields.replaceChildren();
    dynamicAdvanced.replaceChildren();
    const staticKeys=new Set(["existingText","recipient","senderName"]);
    for(const key of [...controls.keys()]){
      if(!staticKeys.has(key))controls.delete(key);
    }
    for(const key of [...errors.keys()]){
      if(!staticKeys.has(key))errors.delete(key);
    }
    for(const spec of MESSAGE_FIELDS[state.write.messageType]){
      const wrap=fieldNode(spec);
      const node=controls.get(spec.key);
      node.value=state.write.fields[spec.key]||"";
      (spec.advanced?dynamicAdvanced:primaryFields).append(wrap);
    }
    dynamicAdvanced.hidden=dynamicAdvanced.childElementCount===0;
  }

  function clearFieldError(key){
    const node=controls.get(key);
    const error=errors.get(key);
    if(node)node.removeAttribute("aria-invalid");
    if(error){error.hidden=true;error.textContent=""}
  }
  function clearErrors(){
    for(const key of errors.keys())clearFieldError(key);
  }
  function showErrors(validation){
    clearErrors();
    let first=null;
    for(const [key,message] of Object.entries(validation.errors||{})){
      const node=controls.get(key);
      const error=errors.get(key);
      if(node&&error){
        node.setAttribute("aria-invalid","true");
        error.textContent=message;
        error.hidden=false;
        if(!first)first=node;
      }
    }
    first?.focus();
  }

  function syncStaticControls(){
    writeRadio.checked=state.mode===WRITING_MODE.WRITE;
    improveRadio.checked=state.mode===WRITING_MODE.IMPROVE;
    messageType.value=state.write.messageType;
    audience.value=state.write.audience;
    tone.value=state.write.tone;
    length.value=state.write.length;
    recipient.value=state.write.recipient;
    senderName.value=state.write.senderName;
    improvement.value=state.improve.improvement;
    existingText.value=state.improve.existingText;
    writePanel.hidden=state.mode!==WRITING_MODE.WRITE;
    improvePanel.hidden=state.mode!==WRITING_MODE.IMPROVE;
  }

  function renderOutput(){
    const hasOutput=Boolean(state.output.text);
    result.hidden=!hasOutput;
    if(!hasOutput)return;
    subjectWrap.hidden=state.mode!==WRITING_MODE.WRITE;
    subject.value=state.output.subject;
    outputText.value=state.output.text;
  }

  function renderAll(){
    syncStaticControls();
    renderMessageFields();
    renderOutput();
  }

  function setMode(mode){
    state=setWritingMode(state,mode);
    clearErrors();
    writePanel.hidden=mode!==WRITING_MODE.WRITE;
    improvePanel.hidden=mode!==WRITING_MODE.IMPROVE;
    result.hidden=true;
    status.textContent="";
  }

  function syncWriteBasics(){
    state=updateWriteSetting(state,"messageType",messageType.value);
    state=updateWriteSetting(state,"audience",audience.value);
    state=updateWriteSetting(state,"tone",tone.value);
    state=updateWriteSetting(state,"length",length.value);
    state=updateWriteSetting(state,"recipient",recipient.value);
    state=updateWriteSetting(state,"senderName",senderName.value);
  }

  function generate(){
    try{
      syncWriteBasics();
      state=updateImproveField(state,"improvement",improvement.value);
      state=updateImproveField(state,"existingText",existingText.value);
      const validation=validateWritingUiState(state);
      if(!validation.ok){
        showErrors(validation);
        status.textContent="Please fix the highlighted fields.";
        return false;
      }
      clearErrors();
      state=generateWritingUiOutput(state);
      renderOutput();
      status.textContent=state.mode===WRITING_MODE.WRITE
        ?"Professional wording created."
        :"Writing improved.";
      return true;
    }catch(error){
      if(error.validation)showErrors(error.validation);
      status.textContent=error.message||"Unable to create professional wording.";
      return false;
    }
  }

  async function copyResult(){
    const text=textExportContent(state);
    if(!text.trim()){status.textContent="Create wording before copying.";return}
    try{
      if(options.clipboard?.writeText)await options.clipboard.writeText(text);
      else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else{
        const temp=el("textarea");
        temp.value=text;temp.setAttribute("readonly","");
        temp.style.position="fixed";temp.style.opacity="0";
        document.body.append(temp);temp.select();
        document.execCommand("copy");temp.remove();
      }
      status.textContent="Copied.";
    }catch{
      status.textContent="Copy is unavailable in this browser.";
    }
  }

  function downloadResult(){
    const text=textExportContent(state);
    if(!text.trim()){status.textContent="Create wording before downloading.";return}
    try{
      const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
      const urlApi=options.urlApi||URL;
      const objectUrl=urlApi.createObjectURL(blob);
      const a=el("a",{href:objectUrl,download:safeFilename()});
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>urlApi.revokeObjectURL(objectUrl),1500);
      status.textContent="TXT download prepared.";
    }catch{
      status.textContent="Download is unavailable in this browser.";
    }
  }

  writeRadio.addEventListener("change",()=>{if(writeRadio.checked)setMode(WRITING_MODE.WRITE)});
  improveRadio.addEventListener("change",()=>{if(improveRadio.checked)setMode(WRITING_MODE.IMPROVE)});

  messageType.addEventListener("change",()=>{
    state=updateWriteSetting(state,"messageType",messageType.value);
    clearErrors();renderMessageFields();result.hidden=true;
  });
  audience.addEventListener("change",()=>{state=updateWriteSetting(state,"audience",audience.value)});
  tone.addEventListener("change",()=>{state=updateWriteSetting(state,"tone",tone.value)});
  length.addEventListener("change",()=>{state=updateWriteSetting(state,"length",length.value)});
  recipient.addEventListener("input",()=>{state=updateWriteSetting(state,"recipient",recipient.value);clearFieldError("recipient")});
  senderName.addEventListener("input",()=>{state=updateWriteSetting(state,"senderName",senderName.value);clearFieldError("senderName")});
  improvement.addEventListener("change",()=>{state=updateImproveField(state,"improvement",improvement.value)});
  existingText.addEventListener("input",()=>{state=updateImproveField(state,"existingText",existingText.value);clearFieldError("existingText")});

  createButton.addEventListener("click",generate);
  improveButton.addEventListener("click",generate);
  regenerateButton.addEventListener("click",generate);

  subject.addEventListener("input",()=>{state=updateOutputDraft(state,"subject",subject.value)});
  outputText.addEventListener("input",()=>{state=updateOutputDraft(state,"text",outputText.value)});

  copyButton.addEventListener("click",copyResult);
  downloadButton.addEventListener("click",downloadResult);

  newButton.addEventListener("click",()=>{
    state=createWritingUiState();
    clearErrors();renderAll();result.hidden=true;
    status.textContent="Started a new message. Saved browser draft was not deleted.";
  });

  saveButton.addEventListener("click",()=>{
    syncWriteBasics();
    state=updateImproveField(state,"improvement",improvement.value);
    state=updateImproveField(state,"existingText",existingText.value);
    const saved=store.save(state);
    status.textContent=saved.ok?"Draft saved in this browser.":"Draft could not be saved.";
  });
  restoreButton.addEventListener("click",()=>{
    const loaded=store.load();
    if(loaded.ok&&loaded.state){
      state=loaded.state;
      clearErrors();renderAll();
      status.textContent="Saved draft restored.";
    }else{
      status.textContent=loaded.ok?"No saved draft was found.":"Saved draft could not be restored.";
    }
  });
  clearButton.addEventListener("click",()=>{
    const cleared=store.clear();
    status.textContent=cleared.ok?"Saved draft cleared.":"Saved draft could not be cleared.";
  });

  controls.set("existingText",existingText);
  const existingError=improveFields.querySelector("#"+errorId("existingText"));
  if(existingError)errors.set("existingText",existingError);

  renderAll();

  return {
    getState:()=>state,
    generate,
    save:()=>store.save(state),
    restore:()=>store.load(),
    clearSaved:()=>store.clear(),
    resetOutput:key=>{state=resetOutputToGenerated(state,key);renderOutput();return state},
  };
}
