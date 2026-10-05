import {
  WRITING_MODE,MESSAGE_TYPE,AUDIENCE,TONE,LENGTH,IMPROVEMENT,MAX_INPUT_CHARS
} from "./contracts.js";
import { createProfessionalWriting,getMessageRequirements } from "./engine.js";

export const TASK2_VERSION="professional-writing-task2";

const FIELD_LIMITS=Object.freeze({
  recipient:160,
  senderName:160,
  topic:500,
  facts:12000,
  requestedAction:3000,
  deadline:300,
  subjectContext:1000,
  previousContact:1000,
  leaveStart:300,
  leaveEnd:300,
  reason:3000,
  returnDate:300,
  coverage:5000,
  lastWorkingDate:300,
  transition:5000,
  meetingTopic:1000,
  meetingDate:300,
  decisions:10000,
  actionItems:10000,
  nextMeeting:1000,
  sourceMessage:12000,
  responseFacts:12000,
  existingText:MAX_INPUT_CHARS,
});

const WRITE_FIELD_KEYS=Object.freeze([
  "topic","facts","requestedAction","deadline","subjectContext","previousContact",
  "leaveStart","leaveEnd","reason","returnDate","coverage","lastWorkingDate",
  "transition","meetingTopic","meetingDate","decisions","actionItems","nextMeeting",
  "sourceMessage","responseFacts"
]);

function clean(value){return String(value??"")}
function enumValue(value,allowed,fallback){
  return Object.values(allowed).includes(value)?value:fallback;
}
function copyFields(fields={}){
  return Object.fromEntries(WRITE_FIELD_KEYS.map(key=>[key,clean(fields[key])]));
}

export function createWritingUiState(seed={}){
  const writeSeed=seed.write||{};
  const improveSeed=seed.improve||{};
  const outputSeed=seed.output||{};
  return {
    version:TASK2_VERSION,
    mode:enumValue(seed.mode,WRITING_MODE,WRITING_MODE.WRITE),
    write:{
      messageType:enumValue(writeSeed.messageType,MESSAGE_TYPE,MESSAGE_TYPE.PROFESSIONAL_EMAIL),
      audience:enumValue(writeSeed.audience,AUDIENCE,AUDIENCE.MANAGER),
      tone:enumValue(writeSeed.tone,TONE,TONE.PROFESSIONAL),
      length:enumValue(writeSeed.length,LENGTH,LENGTH.STANDARD),
      recipient:clean(writeSeed.recipient),
      senderName:clean(writeSeed.senderName),
      fields:copyFields(writeSeed.fields),
    },
    improve:{
      improvement:enumValue(improveSeed.improvement,IMPROVEMENT,IMPROVEMENT.PROFESSIONAL),
      existingText:clean(improveSeed.existingText),
    },
    output:{
      subject:clean(outputSeed.subject),
      text:clean(outputSeed.text),
      generatedSubject:clean(outputSeed.generatedSubject),
      generatedText:clean(outputSeed.generatedText),
      dirtySubject:Boolean(outputSeed.dirtySubject),
      dirtyText:Boolean(outputSeed.dirtyText),
    },
  };
}

export function cloneWritingUiState(state){
  return createWritingUiState({
    ...state,
    write:{...state.write,fields:{...state.write.fields}},
    improve:{...state.improve},
    output:{...state.output},
  });
}

export function setWritingMode(state,mode){
  const next=cloneWritingUiState(state);
  next.mode=enumValue(mode,WRITING_MODE,next.mode);
  return next;
}
export function updateWriteSetting(state,key,value){
  const next=cloneWritingUiState(state);
  if(key==="messageType")next.write.messageType=enumValue(value,MESSAGE_TYPE,next.write.messageType);
  else if(key==="audience")next.write.audience=enumValue(value,AUDIENCE,next.write.audience);
  else if(key==="tone")next.write.tone=enumValue(value,TONE,next.write.tone);
  else if(key==="length")next.write.length=enumValue(value,LENGTH,next.write.length);
  else if(key==="recipient"||key==="senderName")next.write[key]=clean(value);
  else throw new Error("Unsupported write setting.");
  return next;
}
export function updateWriteField(state,key,value){
  if(!WRITE_FIELD_KEYS.includes(key))throw new Error("Unsupported writing field.");
  const next=cloneWritingUiState(state);
  next.write.fields[key]=clean(value);
  return next;
}
export function updateImproveField(state,key,value){
  const next=cloneWritingUiState(state);
  if(key==="improvement")next.improve.improvement=enumValue(value,IMPROVEMENT,next.improve.improvement);
  else if(key==="existingText")next.improve.existingText=clean(value);
  else throw new Error("Unsupported improve field.");
  return next;
}
export function updateOutputDraft(state,key,value){
  if(key!=="subject"&&key!=="text")throw new Error("Unsupported output field.");
  const next=cloneWritingUiState(state);
  next.output[key]=clean(value);
  next.output[key==="subject"?"dirtySubject":"dirtyText"]=true;
  return next;
}

export function fieldLimit(key){
  return FIELD_LIMITS[key]||MAX_INPUT_CHARS;
}

function addError(errors,key,message){
  errors[key]=message;
}
function validateLength(errors,key,value){
  const limit=fieldLimit(key);
  if(clean(value).length>limit)addError(errors,key,"Keep this field within "+limit.toLocaleString("en-US")+" characters.");
}

export function validateWritingUiState(state){
  const errors={};
  if(state.mode===WRITING_MODE.IMPROVE){
    validateLength(errors,"existingText",state.improve.existingText);
    if(!state.improve.existingText.trim())addError(errors,"existingText","Paste the writing you want to improve.");
    return Object.freeze({ok:Object.keys(errors).length===0,errors:Object.freeze(errors)});
  }

  validateLength(errors,"recipient",state.write.recipient);
  validateLength(errors,"senderName",state.write.senderName);
  for(const key of WRITE_FIELD_KEYS)validateLength(errors,key,state.write.fields[key]);

  const req=getMessageRequirements(state.write.messageType);
  for(const key of req.required){
    if(!clean(state.write.fields[key]).trim())addError(errors,key,"This information is required for this message.");
  }
  return Object.freeze({ok:Object.keys(errors).length===0,errors:Object.freeze(errors)});
}

export function generateWritingUiOutput(state){
  const validation=validateWritingUiState(state);
  if(!validation.ok){
    const error=new Error("Please fix the highlighted fields.");
    error.validation=validation;
    throw error;
  }
  const next=cloneWritingUiState(state);
  const input=state.mode===WRITING_MODE.WRITE?{
    mode:WRITING_MODE.WRITE,
    messageType:state.write.messageType,
    audience:state.write.audience,
    tone:state.write.tone,
    length:state.write.length,
    recipient:state.write.recipient,
    senderName:state.write.senderName,
    fields:{...state.write.fields},
  }:{
    mode:WRITING_MODE.IMPROVE,
    improvement:state.improve.improvement,
    existingText:state.improve.existingText,
  };
  const generated=createProfessionalWriting(input);
  next.output.generatedSubject=generated.subject||"";
  next.output.generatedText=generated.text||"";
  next.output.subject=generated.subject||"";
  next.output.text=generated.text||"";
  next.output.dirtySubject=false;
  next.output.dirtyText=false;
  return next;
}

export function resetOutputToGenerated(state,key){
  const next=cloneWritingUiState(state);
  if(key==="subject"){
    next.output.subject=next.output.generatedSubject;
    next.output.dirtySubject=false;
  }else if(key==="text"){
    next.output.text=next.output.generatedText;
    next.output.dirtyText=false;
  }else throw new Error("Unsupported output field.");
  return next;
}

export function textExportContent(state){
  const subject=state.mode===WRITING_MODE.WRITE&&state.output.subject.trim()
    ?"Subject: "+state.output.subject.trim()+"\n\n":"";
  return subject+state.output.text;
}
