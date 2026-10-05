import {
  WRITING_MODE,MESSAGE_TYPE,AUDIENCE,TONE,LENGTH,IMPROVEMENT,
  TASK1_VERSION,MAX_INPUT_CHARS
} from "./contracts.js";

const ALL={
  mode:new Set(Object.values(WRITING_MODE)),
  messageType:new Set(Object.values(MESSAGE_TYPE)),
  audience:new Set(Object.values(AUDIENCE)),
  tone:new Set(Object.values(TONE)),
  length:new Set(Object.values(LENGTH)),
  improvement:new Set(Object.values(IMPROVEMENT)),
};

const PROTECTED_PATTERNS=[
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?\b/g,
  /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:\s+\d{4})?\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g,
  /\b\d+(?:\.\d+)?%\b/g,
  /(?:[$€£₹¥]|USD|EUR|GBP|INR|JPY)\s?\d[\d,.]*/gi,
  /\b\d+(?:\.\d+)?\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bhttps?:\/\/[^\s]+/gi,
  /["“][^"”]+["”]/g,
];

function clean(value){
  return String(value??"").replace(/\r\n?/g,"\n").trim();
}
function oneLine(value){
  return clean(value).replace(/\s+/g," ");
}
function ensureBound(value,label="Input"){
  const text=String(value??"");
  if(text.length>MAX_INPUT_CHARS)throw new Error(label+" exceeds the supported length.");
  return text;
}
function sentence(value){
  let text=oneLine(value);
  if(!text)return "";
  text=text.replace(/^[•\-*]\s*/,"");
  text=text.replace(/\bpls\b/gi,"please").replace(/\bplz\b/gi,"please");
  text=text.replace(/\bthx\b/gi,"thanks");
  text=text.replace(/\bcan't\b/gi,"cannot").replace(/\bwon't\b/gi,"will not");
  text=text.charAt(0).toUpperCase()+text.slice(1);
  if(!/[.!?]$/.test(text))text+=".";
  return text;
}
function lines(value){
  return clean(value).split(/\n+/).map(oneLine).filter(Boolean);
}
function unique(values){
  const seen=new Set();
  return values.filter(Boolean).filter(value=>{
    const key=value.toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
function requireValue(value,label){
  const text=oneLine(ensureBound(value,label));
  if(!text)throw new Error(label+" is required.");
  return text;
}
function requireText(value,label){
  const text=clean(ensureBound(value,label));
  if(!text)throw new Error(label+" is required.");
  return text;
}
function validateChoice(value,set,label){
  if(!set.has(value))throw new Error("Unsupported "+label+".");
}
function nameOrFallback(value,fallback){
  const text=oneLine(value);
  return text||fallback;
}
function greeting(audience,recipient,tone){
  const who=nameOrFallback(recipient,audience===AUDIENCE.RECRUITER?"Hiring Team":"");
  if(tone===TONE.FORMAL)return who?"Dear "+who+",":"Dear Sir or Madam,";
  if(tone===TONE.WARM||audience===AUDIENCE.COLLEAGUE)return who?"Hi "+who+",":"Hello,";
  return who?"Hello "+who+",":"Hello,";
}
function signoff(name,tone){
  const n=oneLine(name);
  const close=tone===TONE.FORMAL?"Sincerely,":tone===TONE.WARM?"Best regards,":"Kind regards,";
  return n?close+"\n"+n:close;
}
function toneIntro(tone){
  if(tone===TONE.CONFIDENT)return "I’m writing to";
  if(tone===TONE.DIPLOMATIC)return "I wanted to";
  if(tone===TONE.WARM)return "I’m reaching out to";
  return "I’m writing to";
}
function maybeDeadline(deadline,tone){
  const d=oneLine(deadline);
  if(!d)return "";
  if(tone===TONE.DIPLOMATIC)return "If possible, I would appreciate an update by "+d+".";
  return "Please let me know by "+d+".";
}
function paragraph(parts){
  return parts.map(sentence).filter(Boolean).join(" ");
}
function formatBody(blocks,length){
  const nonempty=blocks.map(clean).filter(Boolean);
  if(length===LENGTH.SHORT)return nonempty.join(" ");
  return nonempty.join("\n\n");
}
function subjectFor(type,fields){
  const topic=oneLine(fields.topic||fields.subjectContext||fields.requestedAction||fields.meetingTopic||"");
  switch(type){
    case MESSAGE_TYPE.PROFESSIONAL_EMAIL:
      return topic?"Regarding "+topic.replace(/[.!?]$/,""):"Professional message";
    case MESSAGE_TYPE.FOLLOW_UP:
      return topic?"Follow-up: "+topic.replace(/[.!?]$/,""):"Follow-up";
    case MESSAGE_TYPE.LEAVE_REQUEST:{
      const start=oneLine(fields.leaveStart),end=oneLine(fields.leaveEnd);
      return start&&end&&start!==end?"Leave request: "+start+" to "+end:start?"Leave request: "+start:"Leave request";
    }
    case MESSAGE_TYPE.RESIGNATION:
      return "Resignation notice";
    case MESSAGE_TYPE.MEETING_FOLLOW_UP:
      return topic?"Meeting follow-up: "+topic.replace(/[.!?]$/,""):"Meeting follow-up";
    case MESSAGE_TYPE.PROFESSIONAL_REPLY:
      return topic?"Re: "+topic.replace(/^Re:\s*/i,""):"Professional reply";
    default:return "Professional message";
  }
}
function writeProfessionalEmail(fields,context){
  const facts=requireText(fields.facts,"Key information");
  const purpose=oneLine(fields.topic);
  const request=oneLine(fields.requestedAction);
  const deadline=oneLine(fields.deadline);
  const blocks=[];
  if(purpose)blocks.push(sentence(toneIntro(context.tone)+" discuss "+purpose.replace(/[.!?]$/,"")));
  blocks.push(paragraph(lines(facts)));
  if(request)blocks.push(sentence(request));
  if(deadline)blocks.push(maybeDeadline(deadline,context.tone));
  return blocks;
}
function writeFollowUp(fields,context){
  const contextText=requireValue(fields.subjectContext||fields.facts,"Follow-up context");
  const previous=oneLine(fields.previousContact);
  const request=oneLine(fields.requestedAction);
  const deadline=oneLine(fields.deadline);
  const blocks=[
    sentence((context.tone===TONE.WARM?"I wanted to follow up on ":"I’m following up on ")+contextText.replace(/[.!?]$/,"")),
  ];
  if(previous&&context.length!==LENGTH.SHORT)blocks.push(sentence("My previous contact was "+previous.replace(/[.!?]$/,"")));
  if(fields.facts&&oneLine(fields.facts)!==contextText)blocks.push(paragraph(lines(fields.facts)));
  if(request)blocks.push(sentence(request));
  if(deadline)blocks.push(maybeDeadline(deadline,context.tone));
  return blocks;
}
function writeLeave(fields,context){
  const start=requireValue(fields.leaveStart,"Leave start date");
  const end=oneLine(fields.leaveEnd)||start;
  const reason=oneLine(fields.reason);
  const returnDate=oneLine(fields.returnDate);
  const coverage=oneLine(fields.coverage);
  const dates=start===end?start:start+" to "+end;
  const blocks=[sentence("I would like to request leave for "+dates)];
  if(reason)blocks.push(sentence("The reason is "+reason.replace(/[.!?]$/,"")));
  if(returnDate)blocks.push(sentence("I expect to return on "+returnDate));
  if(coverage&&context.length!==LENGTH.SHORT)blocks.push(sentence(coverage));
  return blocks;
}
function writeResignation(fields,context){
  const lastDay=oneLine(fields.lastWorkingDate);
  const reason=oneLine(fields.reason);
  const transition=oneLine(fields.transition);
  const blocks=[sentence("Please accept this message as notice of my resignation")];
  if(lastDay)blocks.push(sentence("My intended last working day is "+lastDay));
  if(reason&&context.length===LENGTH.DETAILED)blocks.push(sentence(reason));
  if(transition)blocks.push(sentence(transition));
  else if(context.length!==LENGTH.SHORT)blocks.push("I will support a smooth handover during my remaining time.");
  return blocks;
}
function writeMeetingFollowUp(fields,context){
  const meetingTopic=requireValue(fields.meetingTopic||fields.facts,"Meeting topic or summary");
  const meetingDate=oneLine(fields.meetingDate);
  const decisions=lines(fields.decisions);
  const actions=lines(fields.actionItems);
  const nextMeeting=oneLine(fields.nextMeeting);
  const blocks=[
    sentence("Thank you for the discussion"+(meetingDate?" on "+meetingDate:"")+" regarding "+meetingTopic.replace(/[.!?]$/,"")),
  ];
  if(decisions.length)blocks.push("Decisions:\n"+decisions.map(x=>"• "+sentence(x)).join("\n"));
  if(actions.length)blocks.push("Action items:\n"+actions.map(x=>"• "+sentence(x)).join("\n"));
  if(nextMeeting&&context.length!==LENGTH.SHORT)blocks.push(sentence("Next meeting: "+nextMeeting));
  return blocks;
}
function writeProfessionalReply(fields,context){
  const source=oneLine(fields.sourceMessage);
  const facts=requireText(fields.responseFacts||fields.facts,"Reply points");
  const request=oneLine(fields.requestedAction);
  const blocks=[];
  if(source&&context.length===LENGTH.DETAILED)blocks.push("Thank you for your message regarding "+sentence(source).replace(/[.!?]$/,"")+".");
  else blocks.push("Thank you for your message.");
  blocks.push(paragraph(lines(facts)));
  if(request)blocks.push(sentence(request));
  return blocks;
}
function writeBlocks(type,fields,context){
  switch(type){
    case MESSAGE_TYPE.PROFESSIONAL_EMAIL:return writeProfessionalEmail(fields,context);
    case MESSAGE_TYPE.FOLLOW_UP:return writeFollowUp(fields,context);
    case MESSAGE_TYPE.LEAVE_REQUEST:return writeLeave(fields,context);
    case MESSAGE_TYPE.RESIGNATION:return writeResignation(fields,context);
    case MESSAGE_TYPE.MEETING_FOLLOW_UP:return writeMeetingFollowUp(fields,context);
    case MESSAGE_TYPE.PROFESSIONAL_REPLY:return writeProfessionalReply(fields,context);
    default:throw new Error("Unsupported message type.");
  }
}
function warmEnding(tone,audience){
  if(tone===TONE.WARM)return "Thank you for your time and understanding.";
  if(tone===TONE.DIPLOMATIC)return "Thank you for considering this.";
  if(tone===TONE.CONFIDENT&&audience===AUDIENCE.CLIENT)return "I look forward to your response.";
  if(audience===AUDIENCE.RECRUITER)return "Thank you for your consideration.";
  if(audience===AUDIENCE.CLIENT)return "Thank you for your time.";
  if(audience===AUDIENCE.VENDOR)return "Thank you for your cooperation.";
  if(audience===AUDIENCE.COLLEAGUE)return "Thank you for your help.";
  return "";
}
function detailedEnding(messageType){
  switch(messageType){
    case MESSAGE_TYPE.LEAVE_REQUEST:return "Please let me know if you need any additional information from me.";
    case MESSAGE_TYPE.RESIGNATION:return "Please let me know how I can best support the transition.";
    case MESSAGE_TYPE.MEETING_FOLLOW_UP:return "Please let me know if I missed or misrepresented any of the points above.";
    default:return "Please let me know if any additional information would be helpful.";
  }
}
function buildMessage({messageType,audience=AUDIENCE.OTHER,tone=TONE.PROFESSIONAL,length=LENGTH.STANDARD,recipient="",senderName="",fields={}}){
  validateChoice(messageType,ALL.messageType,"message type");
  validateChoice(audience,ALL.audience,"audience");
  validateChoice(tone,ALL.tone,"tone");
  validateChoice(length,ALL.length,"length");
  for(const [key,value] of Object.entries(fields||{}))ensureBound(value,key);
  ensureBound(recipient,"Recipient");
  ensureBound(senderName,"Sender name");

  const context={audience,tone,length};
  let blocks=writeBlocks(messageType,fields||{},context);
  const ending=warmEnding(tone,audience);
  if(ending&&length!==LENGTH.SHORT)blocks.push(ending);
  if(length===LENGTH.DETAILED)blocks.push(detailedEnding(messageType));
  if(length===LENGTH.SHORT)blocks=blocks.slice(0,3);

  return Object.freeze({
    subject:subjectFor(messageType,fields||{}),
    message:[
      greeting(audience,recipient,tone),
      "",
      formatBody(blocks,length),
      "",
      signoff(senderName,tone),
    ].join("\n").replace(/\n{3,}/g,"\n\n"),
  });
}
function protectedTokens(text){
  const found=[];
  for(const pattern of PROTECTED_PATTERNS){
    pattern.lastIndex=0;
    for(const match of text.matchAll(pattern))found.push(match[0]);
  }
  const leadingContext=new Set(["Contact","Please","Hello","Dear","Send","Review","Tell","Ask","Meet","Discuss"]);
  for(const token of [...found]){
    const parts=token.split(/\s+/);
    if(parts.length>=3&&leadingContext.has(parts[0]))found.push(parts.slice(1).join(" "));
  }
  return unique(found);
}
function protect(text){
  let output=text;
  const tokens=protectedTokens(text).sort((a,b)=>b.length-a.length);
  const map=[];
  tokens.forEach((token,index)=>{
    const marker="ZXQ"+index+"QXZ";
    output=output.split(token).join(marker);
    map.push([marker,token]);
  });
  return {output,map,tokens};
}
function restore(text,map){
  let output=text;
  for(const [marker,token] of map)output=output.split(marker).join(token);
  return output;
}
function professionalize(text){
  return text
    .replace(/\bpls\b/gi,"please")
    .replace(/\bplz\b/gi,"please")
    .replace(/\bthx\b/gi,"thank you")
    .replace(/\bthanks a lot\b/gi,"thank you")
    .replace(/\bcan'?t\b/gi,"cannot")
    .replace(/\bwon'?t\b/gi,"will not")
    .replace(/\bwanna\b/gi,"would like to")
    .replace(/\bgonna\b/gi,"going to")
    .replace(/\bu\b/g,"you");
}
function removeFiller(text){
  return text
    .replace(/\bI just wanted to\s+/gi,"I wanted to ")
    .replace(/\bI wanted to just\s+/gi,"I wanted to ")
    .replace(/\bjust wanted to\s+/gi,"wanted to ")
    .replace(/\bkind of\b/gi,"")
    .replace(/\bsort of\b/gi,"")
    .replace(/\bbasically\b/gi,"")
    .replace(/[ \t]{2,}/g," ");
}
function clearer(text){
  return text
    .replace(/[ \t]+([,.;!?])/g,"$1")
    .replace(/([.!?])\s*(?=[A-Z])/g,"$1\n")
    .replace(/;\s*/g,";\n");
}
function improveText(existingText,objective){
  validateChoice(objective,ALL.improvement,"improvement objective");
  const original=clean(ensureBound(existingText,"Existing writing"));
  if(!original)throw new Error("Existing writing is required.");

  const p=protect(original);
  let out=p.output;
  out=professionalize(out);
  out=out.replace(/[ \t]+/g," ").replace(/\n[ \t]+/g,"\n").trim();

  if(objective===IMPROVEMENT.CLEARER)out=clearer(out);
  if(objective===IMPROVEMENT.CONCISE)out=removeFiller(clearer(out));
  if(objective===IMPROVEMENT.WARMER){
    out=clearer(out);
    if(!/^thank you/i.test(out))out="Thank you for your message.\n\n"+out;
  }
  if(objective===IMPROVEMENT.DIPLOMATIC){
    out=clearer(out)
      .replace(/^You need to\b/i,"Could you please")
      .replace(/^I need you to\b/i,"Could you please");
    if(!/thank you/i.test(out))out+="\n\nThank you for your consideration.";
  }
  if(objective===IMPROVEMENT.CONFIDENT){
    out=clearer(out)
      .replace(/\bI think\b/gi,"I believe")
      .replace(/\bmaybe\b/gi,"");
  }
  if(objective===IMPROVEMENT.PROFESSIONAL)out=clearer(out);

  out=restore(out,p.map);
  out=out.split("\n").map(line=>line.trim()?sentence(line):"").join("\n").replace(/\n{3,}/g,"\n\n").trim();

  const missing=p.tokens.filter(token=>!out.includes(token));
  if(missing.length)throw new Error("Protected details changed during rewriting.");

  return Object.freeze({
    text:out,
    preserved:Object.freeze(p.tokens),
  });
}
export function createProfessionalWriting(input){
  if(!input||typeof input!=="object")throw new Error("Writing input is required.");
  validateChoice(input.mode,ALL.mode,"writing mode");
  if(input.mode===WRITING_MODE.WRITE){
    const result=buildMessage(input);
    return Object.freeze({
      version:TASK1_VERSION,
      mode:input.mode,
      subject:result.subject,
      text:result.message,
      preserved:Object.freeze(protectedTokens(Object.values(input.fields||{}).map(String).join("\n"))),
    });
  }
  const improved=improveText(input.existingText,input.improvement||IMPROVEMENT.PROFESSIONAL);
  return Object.freeze({
    version:TASK1_VERSION,
    mode:input.mode,
    subject:"",
    text:improved.text,
    preserved:improved.preserved,
  });
}

export function getMessageRequirements(messageType){
  validateChoice(messageType,ALL.messageType,"message type");
  const requirements={
    [MESSAGE_TYPE.PROFESSIONAL_EMAIL]:Object.freeze({required:["facts"],optional:["topic","requestedAction","deadline"]}),
    [MESSAGE_TYPE.FOLLOW_UP]:Object.freeze({required:["subjectContext"],optional:["previousContact","facts","requestedAction","deadline"]}),
    [MESSAGE_TYPE.LEAVE_REQUEST]:Object.freeze({required:["leaveStart"],optional:["leaveEnd","reason","returnDate","coverage"]}),
    [MESSAGE_TYPE.RESIGNATION]:Object.freeze({required:[],optional:["lastWorkingDate","reason","transition"]}),
    [MESSAGE_TYPE.MEETING_FOLLOW_UP]:Object.freeze({required:["meetingTopic"],optional:["meetingDate","decisions","actionItems","nextMeeting"]}),
    [MESSAGE_TYPE.PROFESSIONAL_REPLY]:Object.freeze({required:["responseFacts"],optional:["sourceMessage","requestedAction"]}),
  };
  return requirements[messageType];
}

export function extractProtectedDetails(text){
  return Object.freeze(protectedTokens(clean(text)));
}
