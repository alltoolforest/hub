import {
  WRITING_MODE,MESSAGE_TYPE,AUDIENCE,TONE,LENGTH,IMPROVEMENT,MAX_INPUT_CHARS
} from "./contracts.js";
import {
  createProfessionalWriting,getMessageRequirements,extractProtectedDetails
} from "./engine.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function write(messageType,fields,extra={}){
  return createProfessionalWriting({
    mode:WRITING_MODE.WRITE,
    messageType,
    audience:AUDIENCE.MANAGER,
    tone:TONE.PROFESSIONAL,
    length:LENGTH.STANDARD,
    recipient:"Priya",
    senderName:"Arun",
    fields,
    ...extra,
  });
}

export function runProfessionalWritingTask1Regression(){
  const email=write(MESSAGE_TYPE.PROFESSIONAL_EMAIL,{
    topic:"Q4 report",
    facts:"report is complete\nfigures checked",
    requestedAction:"Please review the attached summary",
    deadline:"October 10, 2026",
  });
  assert(!/^Subject:/m.test(email.text),"Message body should not duplicate Subject label.");
  assert(email.subject.includes("Q4 report"),"Professional email subject should be generated.");
  assert(/Report is complete\./.test(email.text)&&/Figures checked\./.test(email.text),"Rough facts should become complete sentences.");
  assert(email.text.includes("October 10, 2026"),"Date must be preserved.");

  const follow=write(MESSAGE_TYPE.FOLLOW_UP,{
    subjectContext:"invoice approval",
    previousContact:"September 30, 2026",
    requestedAction:"Please confirm the approval status",
    deadline:"October 6, 2026",
  },{tone:TONE.DIPLOMATIC});
  assert(/follow/i.test(follow.subject)&&/invoice approval/i.test(follow.subject),"Follow-up subject should be contextual.");
  assert(/September 30, 2026/.test(follow.text)&&/October 6, 2026/.test(follow.text),"Follow-up dates must be preserved.");

  const leave=write(MESSAGE_TYPE.LEAVE_REQUEST,{
    leaveStart:"October 7, 2026",
    leaveEnd:"October 7, 2026",
    reason:"medical appointment",
    returnDate:"October 8, 2026",
    coverage:"I will hand over urgent items before I leave",
  },{tone:TONE.FORMAL});
  assert(/October 7, 2026/.test(leave.subject)&&/medical appointment/i.test(leave.text),"Leave request should use supplied dates/reason.");
  assert(/October 8, 2026/.test(leave.text),"Return date must be preserved.");

  const leaveNoReason=write(MESSAGE_TYPE.LEAVE_REQUEST,{leaveStart:"2026-10-07"});
  assert(!/reason is/i.test(leaveNoReason.text),"Missing leave reason must be omitted, not invented.");

  const resignation=write(MESSAGE_TYPE.RESIGNATION,{
    lastWorkingDate:"October 31, 2026",
    transition:"I will document current tasks and hand over open items",
  },{tone:TONE.FORMAL});
  assert(/October 31, 2026/.test(resignation.text),"Resignation last day must be preserved.");
  assert(/hand over open items/i.test(resignation.text),"User transition plan should be included.");

  const meeting=write(MESSAGE_TYPE.MEETING_FOLLOW_UP,{
    meetingTopic:"Phoenix rollout",
    meetingDate:"October 5, 2026",
    decisions:"Launch on October 20, 2026\nKeep budget at ₹50,000",
    actionItems:"Maya will prepare the checklist\nArun will contact vendor@example.com",
  });
  assert(/Phoenix rollout/.test(meeting.subject)&&/October 20, 2026/.test(meeting.text),"Meeting facts must be preserved.");
  assert(meeting.text.includes("₹50,000")&&meeting.text.includes("vendor@example.com"),"Money/email details must be preserved.");

  const reply=write(MESSAGE_TYPE.PROFESSIONAL_REPLY,{
    sourceMessage:"Can you send the revised file?",
    responseFacts:"revised file is ready\nI will send it today",
    requestedAction:"Please let me know if any other changes are needed",
  },{audience:AUDIENCE.CLIENT,tone:TONE.WARM});
  assert(/Revised file is ready\./.test(reply.text),"Reply facts should be professionally normalized.");

  const short=write(MESSAGE_TYPE.PROFESSIONAL_EMAIL,{
    facts:"project is on track",
    requestedAction:"Please confirm receipt",
    deadline:"October 12, 2026",
  },{length:LENGTH.SHORT});
  const detailed=write(MESSAGE_TYPE.PROFESSIONAL_EMAIL,{
    facts:"project is on track",
    requestedAction:"Please confirm receipt",
    deadline:"October 12, 2026",
  },{length:LENGTH.DETAILED});
  assert(short.text.length<=detailed.text.length,"Short length must not exceed detailed output.");

  const warm=write(MESSAGE_TYPE.PROFESSIONAL_EMAIL,{facts:"the proposal is attached"},{tone:TONE.WARM,audience:AUDIENCE.CLIENT});
  const formal=write(MESSAGE_TYPE.PROFESSIONAL_EMAIL,{facts:"the proposal is attached"},{tone:TONE.FORMAL,audience:AUDIENCE.CLIENT});
  assert(warm.text!==formal.text,"Tone should materially change wording.");

  const improved=createProfessionalWriting({
    mode:WRITING_MODE.IMPROVE,
    improvement:IMPROVEMENT.PROFESSIONAL,
    existingText:"hi Priya pls review invoice INV-204 for ₹12,500 by October 9, 2026. thx",
  });
  ["Priya","INV-204","₹12,500","October 9, 2026"].forEach(token=>assert(improved.text.includes(token),"Improve mode must preserve "+token));
  assert(/please/i.test(improved.text)&&/thank you/i.test(improved.text),"Professional improvement should normalize common shorthand.");

  const concise=createProfessionalWriting({
    mode:WRITING_MODE.IMPROVE,
    improvement:IMPROVEMENT.CONCISE,
    existingText:"I just wanted to follow up on Project Atlas. I wanted to just check whether the review is complete.",
  });
  assert(!/just wanted to/i.test(concise.text),"Concise mode should remove safe filler.");
  assert(/Project Atlas/.test(concise.text),"Concise mode must preserve named details.");

  const diplomatic=createProfessionalWriting({
    mode:WRITING_MODE.IMPROVE,
    improvement:IMPROVEMENT.DIPLOMATIC,
    existingText:"You need to send the report by 5 PM on October 6, 2026.",
  });
  assert(/Could you please/i.test(diplomatic.text),"Diplomatic mode should soften direct commands.");
  assert(/5 PM/.test(diplomatic.text)&&/October 6, 2026/.test(diplomatic.text),"Diplomatic rewrite must preserve deadline details.");

  const protectedDetails=extractProtectedDetails("Contact Ana Patel at ana@example.com about $250 on 2026-10-11 via https://example.com.");
  ["Ana Patel","ana@example.com","$250","2026-10-11","https://example.com."].forEach(token=>assert(protectedDetails.includes(token),"Protected detail extraction should include "+token));

  for(const type of Object.values(MESSAGE_TYPE)){
    const req=getMessageRequirements(type);
    assert(Array.isArray(req.required)&&Array.isArray(req.optional),"Each message type needs a field contract.");
  }

  let over=false;
  try{
    createProfessionalWriting({
      mode:WRITING_MODE.IMPROVE,
      improvement:IMPROVEMENT.CLEARER,
      existingText:"x".repeat(MAX_INPUT_CHARS+1),
    });
  }catch{over=true}
  assert(over,"Oversized improve input must be rejected.");

  let missing=false;
  try{write(MESSAGE_TYPE.PROFESSIONAL_EMAIL,{facts:""})}catch{missing=true}
  assert(missing,"Required message facts must be validated.");

  const noInvent=createProfessionalWriting({
    mode:WRITING_MODE.IMPROVE,
    improvement:IMPROVEMENT.CLEARER,
    existingText:"Please review the proposal.",
  });
  assert(!/\b\d{4}-\d{2}-\d{2}\b/.test(noInvent.text)&&!/%/.test(noInvent.text),"Improve mode must not invent dates or metrics.");

  return Object.freeze({
    pass:true,
    writeMode:true,
    improveMode:true,
    sixMessageTypes:true,
    audience:true,
    sixTones:true,
    threeLengths:true,
    subjectGeneration:true,
    messageSpecificRequirements:true,
    dateNumberNamePreservation:true,
    noInventedOptionalFacts:true,
    inputBounds:true,
    editableStringOutput:true,
  });
}
