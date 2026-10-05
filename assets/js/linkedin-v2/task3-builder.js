import { PROFILE_MODE } from "./contracts.js";
import {
  createTask3State,updateInput,generateProfileSections,applyHeadlineAlternative,
  updateDraft,resetDraftToGenerated
} from "./task3-state.js";
import { createLinkedInDraftStore } from "./task3-storage.js";

function el(tag,attrs={},text=""){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(key==="className")node.className=value;
    else if(key==="dataset")Object.assign(node.dataset,value);
    else if(key in node)node[key]=value;
    else node.setAttribute(key,value);
  }
  if(text)node.textContent=text;
  return node;
}
function option(value,label){return el("option",{value},label)}
function field(labelText,input,hint=""){
  const wrap=el("div",{className:"liv2-field"});
  const label=el("label",{htmlFor:input.id},labelText);
  wrap.append(label,input);
  if(hint)wrap.append(el("small",{},hint));
  return wrap;
}
function copyText(text,clipboard=globalThis.navigator?.clipboard){
  if(!text)return Promise.resolve({ok:false,reason:"empty"});
  if(!clipboard||typeof clipboard.writeText!=="function")return Promise.resolve({ok:false,reason:"clipboard_unavailable"});
  return clipboard.writeText(text).then(()=>({ok:true})).catch(()=>({ok:false,reason:"clipboard_failed"}));
}

export function mountLinkedInTask3(root,options={}){
  if(!root||typeof document==="undefined")throw new Error("A DOM root is required.");
  let state=createTask3State(options.seed||{});
  let browserStorage=options.storage||null;
  if(!browserStorage){try{browserStorage=window.localStorage}catch{}}
  const store=createLinkedInDraftStore(browserStorage);

  root.replaceChildren();
  root.classList.add("liv2-builder");

  const status=el("p",{className:"liv2-status",role:"status","aria-live":"polite"});

  const details=el("section",{className:"liv2-panel","aria-labelledby":"liv2-details-heading"});
  details.append(el("h2",{id:"liv2-details-heading"},"1. Profile details"));

  const mode=el("select",{id:"liv2-mode"});
  mode.append(
    option(PROFILE_MODE.FRESHER,"Fresher / Student"),
    option(PROFILE_MODE.EXPERIENCED,"Experienced"),
    option(PROFILE_MODE.CAREER_CHANGER,"Career changer")
  );
  const inputs={
    targetRole:el("input",{id:"liv2-target-role",type:"text",maxLength:160}),
    currentRole:el("input",{id:"liv2-current-role",type:"text",maxLength:160}),
    industry:el("input",{id:"liv2-industry",type:"text",maxLength:160}),
    currentHeadline:el("textarea",{id:"liv2-current-headline",rows:3,maxLength:500}),
    currentAbout:el("textarea",{id:"liv2-current-about",rows:6,maxLength:12000}),
    experienceText:el("textarea",{id:"liv2-experience",rows:7,maxLength:30000}),
    skillsText:el("textarea",{id:"liv2-skills",rows:5,maxLength:12000}),
    achievementsText:el("textarea",{id:"liv2-achievements",rows:5,maxLength:16000}),
    professionalGoal:el("textarea",{id:"liv2-goal",rows:3,maxLength:3000}),
    resumeText:el("textarea",{id:"liv2-resume",rows:6,maxLength:50000}),
  };
  details.append(
    field("Profile mode",mode),
    field("Target role",inputs.targetRole),
    field("Current role (optional)",inputs.currentRole),
    field("Industry / niche (optional)",inputs.industry),
    field("Current headline",inputs.currentHeadline),
    field("Current About section",inputs.currentAbout),
    field("Experience text",inputs.experienceText,"Use one responsibility or result per line where possible."),
    field("Current skills",inputs.skillsText,"Enter one skill per line."),
    field("Achievements / evidence",inputs.achievementsText,"Enter only outcomes you can support."),
    field("Professional focus / next step",inputs.professionalGoal),
    field("Resume text (optional)",inputs.resumeText)
  );

  const actions=el("div",{className:"liv2-actions"});
  const generate=el("button",{type:"button"},"Review & optimize");
  const save=el("button",{type:"button"},"Save draft");
  const restore=el("button",{type:"button"},"Restore draft");
  const startNew=el("button",{type:"button"},"Start new");
  const clearSaved=el("button",{type:"button"},"Clear saved data");
  actions.append(generate,save,restore,startNew,clearSaved);

  const review=el("section",{className:"liv2-panel",hidden:true,"aria-labelledby":"liv2-review-heading"});
  review.append(el("h2",{id:"liv2-review-heading"},"2. Profile review"));
  const reviewList=el("div",{className:"liv2-review-list"});
  review.append(reviewList);

  const optimize=el("section",{className:"liv2-panel",hidden:true,"aria-labelledby":"liv2-optimize-heading"});
  optimize.append(el("h2",{id:"liv2-optimize-heading"},"3. Optimize your profile"));
  const sections=el("div",{className:"liv2-sections"});
  optimize.append(sections);

  root.append(details,actions,review,optimize,status);

  function syncInputControls(){
    mode.value=state.input.mode;
    Object.entries(inputs).forEach(([key,node])=>node.value=state.input[key]||"");
  }
  function syncStateFromControls(){
    state=updateInput(state,"mode",mode.value);
    for(const [key,node] of Object.entries(inputs))state=updateInput(state,key,node.value);
  }
  function renderReview(){
    reviewList.replaceChildren();
    for(const check of state.review?.checks||[]){
      const card=el("div",{className:"liv2-review-item",dataset:{status:check.status}});
      card.append(el("strong",{},check.label),el("span",{className:"liv2-review-status"},check.status.replace("_"," ")),el("p",{},check.message));
      reviewList.append(card);
    }
    review.hidden=false;
  }
  function sectionCard(section,title,value,{counterMax=0,headlineChoices=false,skillNotice=""}={}){
    const card=el("article",{className:"liv2-section-card",dataset:{section}});
    const head=el("div",{className:"liv2-section-head"});
    head.append(el("h3",{},title));
    const copyBtn=el("button",{type:"button"},"Copy");
    head.append(copyBtn);
    const textarea=el("textarea",{rows:section==="about"?10:section==="experience"?9:6,value});
    textarea.setAttribute("aria-label",title+" optimized wording");
    const counter=el("small",{className:"liv2-counter"});
    if(counterMax)counter.textContent=textarea.value.length+" / "+counterMax+" characters";

    if(headlineChoices&&state.generated){
      const chooser=el("div",{className:"liv2-headline-choices","aria-label":"Headline alternatives"});
      state.generated.headlines.forEach(item=>{
        const btn=el("button",{type:"button"},item.label);
        btn.addEventListener("click",()=>{
          state=applyHeadlineAlternative(state,item.id);
          renderSections();
          status.textContent=item.label+" headline selected.";
        });
        chooser.append(btn);
      });
      card.append(head,chooser,textarea,counter);
    }else card.append(head,textarea,counter);

    if(skillNotice)card.append(el("p",{className:"liv2-skill-notice"},skillNotice));

    const reset=el("button",{type:"button",className:"liv2-reset"},"Reset to suggestion");
    card.append(reset);

    textarea.addEventListener("input",()=>{
      state=updateDraft(state,section,textarea.value);
      if(counterMax)counter.textContent=textarea.value.length+" / "+counterMax+" characters";
    });
    copyBtn.addEventListener("click",async()=>{
      const result=await copyText(textarea.value,options.clipboard);
      status.textContent=result.ok?title+" copied.":"Copy is unavailable in this browser.";
    });
    reset.addEventListener("click",()=>{
      state=resetDraftToGenerated(state,section);
      renderSections();
      status.textContent=title+" reset to generated suggestion.";
    });
    return card;
  }
  function renderSections(){
    sections.replaceChildren();
    sections.append(
      sectionCard("headline","Headline",state.drafts.headline,{counterMax:220,headlineChoices:true}),
      sectionCard("about","About",state.drafts.about,{counterMax:2600}),
      sectionCard("experience","Experience",state.drafts.experience),
      sectionCard("skills","Skills",state.drafts.skills,{skillNotice:state.generated?.skills?.disclaimer||""})
    );
    optimize.hidden=false;
  }

  mode.addEventListener("change",()=>{state=updateInput(state,"mode",mode.value)});
  Object.entries(inputs).forEach(([key,node])=>node.addEventListener("input",()=>{state=updateInput(state,key,node.value)}));

  generate.addEventListener("click",()=>{
    try{
      syncStateFromControls();
      state=generateProfileSections(state);
      renderReview();
      renderSections();
      status.textContent="Profile review and optimization suggestions are ready.";
    }catch(error){
      status.textContent=error.message||"Unable to optimize this profile.";
    }
  });
  save.addEventListener("click",()=>{
    syncStateFromControls();
    const result=store.save(state);
    status.textContent=result.ok?"Draft saved in this browser.":"Draft could not be saved in this browser.";
  });
  restore.addEventListener("click",()=>{
    const result=store.load();
    if(result.ok&&result.state){
      state=result.state;
      syncInputControls();
      review.hidden=true;
      optimize.hidden=true;
      status.textContent="Saved draft restored. Run Review & optimize to refresh suggestions.";
    }else status.textContent=result.ok?"No saved LinkedIn draft was found.":"Saved draft could not be restored.";
  });
  startNew.addEventListener("click",()=>{
    state=createTask3State();
    syncInputControls();
    review.hidden=true;
    optimize.hidden=true;
    status.textContent="Started a new profile draft. Saved browser data was not deleted.";
  });
  clearSaved.addEventListener("click",()=>{
    const result=store.clear();
    status.textContent=result.ok?"Saved LinkedIn draft cleared from this browser.":"Saved draft could not be cleared.";
  });

  syncInputControls();

  return {
    getState:()=>state,
    generate:()=>{syncStateFromControls();state=generateProfileSections(state);renderReview();renderSections();return state},
    save:()=>store.save(state),
    restore:()=>store.load(),
    clearSaved:()=>store.clear()
  };
}
