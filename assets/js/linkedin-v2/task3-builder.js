import { PROFILE_MODE } from "./contracts.js";
import {
  createTask3State,updateInput,selectTargetRole,generateProfileSections,
  applyHeadlineAlternative,updateDraft,resetDraftToGenerated
} from "./task3-state.js";
import { createLinkedInDraftStore } from "./task3-storage.js";
import { LINKEDIN_PRIVACY_NOTICE } from "./task4-hardening.js";
import {
  searchLinkedInTargetRoles,createLinkedInRoleRecord,isCatalogRole
} from "./rework-task1-role-adapter.js";
import {
  STARTER_STATE,STARTER_SECTION,refreshRoleStarterPack,
  setStarterItemConfirmed,addUserStarterItem
} from "./rework-task2-starter-pack.js";
import { assessTargetRoleChange } from "./rework-task4-flow.js";
import { getSimpleStarterOptions,validateSimpleBuild } from "./simplified-flow.js";

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
  const wrap=el("div",{className:"li-simple-field"});
  wrap.append(el("label",{htmlFor:input.id},labelText),input);
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
  root.classList.add("li-simple");

  const status=el("p",{className:"li-simple-status",role:"status","aria-live":"polite"});
  const privacy=el("p",{className:"li-simple-privacy",role:"note"},LINKEDIN_PRIVACY_NOTICE);

  const setup=el("section",{className:"li-simple-card","aria-labelledby":"li-setup-heading"});
  setup.append(
    el("h2",{id:"li-setup-heading"},"Build your LinkedIn profile"),
    el("p",{className:"li-simple-intro"},"Choose where you are in your career and the role you want. We’ll suggest what to include; you only select what is true about you.")
  );

  const mode=el("select",{id:"li-mode"});
  mode.append(
    option(PROFILE_MODE.FRESHER,"Fresher / Student"),
    option(PROFILE_MODE.EXPERIENCED,"Experienced"),
    option(PROFILE_MODE.CAREER_CHANGER,"Career changer")
  );

  const targetRole=el("input",{
    id:"li-target-role",type:"text",maxLength:160,autocomplete:"off",spellcheck:false,
    role:"combobox","aria-autocomplete":"list","aria-expanded":"false","aria-controls":"li-role-list"
  });
  const roleList=el("div",{id:"li-role-list",className:"li-role-list",role:"listbox",hidden:true});
  const roleNote=el("small",{className:"li-role-note",hidden:true});
  const roleField=field("Target role",targetRole,"Start typing and choose the closest role.");
  roleField.append(roleList,roleNote);

  const currentRole=el("input",{id:"li-current-role",type:"text",maxLength:160});
  const currentRoleWrap=field("Current role",currentRole,"Used to find transferable strengths.");

  setup.append(
    field("Profile mode",mode),
    roleField,
    currentRoleWrap
  );

  const truth=el("section",{className:"li-simple-card",hidden:true,"aria-labelledby":"li-truth-heading"});
  truth.append(
    el("h2",{id:"li-truth-heading"},"What is true about you?"),
    el("p",{className:"li-simple-intro"},"Tap only the skills and responsibilities that genuinely describe you. You can add your own too.")
  );
  const skillsBlock=el("div",{className:"li-choice-block"});
  skillsBlock.append(el("h3",{},"Skills you have"));
  const skillsChoices=el("div",{className:"li-choice-grid"});
  const skillAdd=el("div",{className:"li-add-row"});
  const skillInput=el("input",{type:"text",maxLength:200,placeholder:"Add your own skill","aria-label":"Add your own skill"});
  const skillAddBtn=el("button",{type:"button"},"Add");
  skillAdd.append(skillInput,skillAddBtn);
  skillsBlock.append(skillsChoices,skillAdd);

  const expBlock=el("div",{className:"li-choice-block"});
  expBlock.append(
    el("h3",{},"Responsibilities you’ve actually done"),
    el("p",{className:"li-choice-hint"},"For career changes, some suggestions may come from your current role.")
  );
  const expChoices=el("div",{className:"li-choice-grid"});
  const expAdd=el("div",{className:"li-add-row"});
  const expInput=el("input",{type:"text",maxLength:500,placeholder:"Add your own responsibility","aria-label":"Add your own responsibility"});
  const expAddBtn=el("button",{type:"button"},"Add");
  expAdd.append(expInput,expAddBtn);
  expBlock.append(expChoices,expAdd);

  const achievement=el("textarea",{id:"li-achievement",rows:2,maxLength:1000,placeholder:"Example: Reduced repeat contacts by 12%"});
  const achievementWrap=field("One achievement (optional)",achievement,"Only add something you can support with real evidence.");

  truth.append(skillsBlock,expBlock,achievementWrap);

  const more=el("details",{className:"li-more"});
  const moreSummary=el("summary",{},"Already have a profile or want more control?");
  const moreBody=el("div",{className:"li-more-body"});
  const advanced={
    industry:el("input",{id:"li-industry",type:"text",maxLength:160}),
    currentHeadline:el("textarea",{id:"li-existing-headline",rows:2,maxLength:500}),
    currentAbout:el("textarea",{id:"li-existing-about",rows:5,maxLength:12000}),
    experienceText:el("textarea",{id:"li-existing-experience",rows:5,maxLength:30000}),
    skillsText:el("textarea",{id:"li-existing-skills",rows:4,maxLength:12000}),
    resumeText:el("textarea",{id:"li-resume",rows:5,maxLength:50000}),
  };
  moreBody.append(
    field("Industry / niche (optional)",advanced.industry),
    field("Existing headline (optional)",advanced.currentHeadline),
    field("Existing About section (optional)",advanced.currentAbout),
    field("Existing experience (optional)",advanced.experienceText),
    field("Existing skills (optional)",advanced.skillsText,"One skill per line."),
    field("Resume text (optional)",advanced.resumeText)
  );
  const draftActions=el("div",{className:"li-draft-actions"});
  const save=el("button",{type:"button"},"Save draft");
  const restore=el("button",{type:"button"},"Restore draft");
  const startNew=el("button",{type:"button"},"Start over");
  const clearSaved=el("button",{type:"button"},"Clear saved data");
  draftActions.append(save,restore,startNew,clearSaved);
  moreBody.append(draftActions);
  more.append(moreSummary,moreBody);

  const build=el("button",{type:"button",className:"li-build"},"Build my LinkedIn profile");

  const results=el("section",{className:"li-results",hidden:true,"aria-labelledby":"li-results-heading"});
  results.append(
    el("h2",{id:"li-results-heading"},"Your LinkedIn profile"),
    el("p",{className:"li-simple-intro"},"Edit anything you want, then copy each section into LinkedIn.")
  );
  const resultCards=el("div",{className:"li-result-cards"});

  const improve=el("details",{className:"li-improve"});
  improve.append(el("summary",{},"Improve further"));
  const improveBody=el("div",{className:"li-improve-body"});
  const reviewList=el("div",{className:"li-review-list"});
  improveBody.append(
    el("p",{className:"li-choice-hint"},"Optional profile review and additional headline styles."),
    reviewList
  );
  improve.append(improveBody);
  results.append(resultCards,improve);

  root.append(privacy,setup,truth,more,build,results,status);

  let roleOptions=[];
  let activeRoleIndex=-1;
  let roleSelectionBeforeEdit=null;
  let headlineCycleIndex=0;

  function renderMode(){
    currentRoleWrap.hidden=mode.value===PROFILE_MODE.FRESHER;
    currentRole.required=mode.value===PROFILE_MODE.CAREER_CHANGER;
  }

  function renderRoleNote(){
    if(state.roleSelection){
      roleNote.hidden=false;
      roleNote.textContent="Selected: "+state.roleSelection.title+
        (isCatalogRole(state.roleSelection)?" · "+state.roleSelection.category:" · Custom role");
    }else{
      roleNote.hidden=true;
      roleNote.textContent="";
    }
  }

  function hideRoleList(){
    roleList.hidden=true;
    roleList.replaceChildren();
    roleOptions=[];
    activeRoleIndex=-1;
    targetRole.setAttribute("aria-expanded","false");
    targetRole.removeAttribute("aria-activedescendant");
  }

  function setActiveRole(index){
    if(!roleOptions.length)return;
    activeRoleIndex=Math.max(0,Math.min(index,roleOptions.length-1));
    [...roleList.querySelectorAll('[role="option"]')].forEach((node,i)=>{
      const active=i===activeRoleIndex;
      node.setAttribute("aria-selected",active?"true":"false");
      node.classList.toggle("is-active",active);
    });
    const active=roleList.querySelector('[data-role-index="'+activeRoleIndex+'"]');
    if(active)targetRole.setAttribute("aria-activedescendant",active.id);
  }

  function confirmedRoleItems(){
    return Object.values(state.starterPack?.sections||{}).flat().filter(item=>
      item.state===STARTER_STATE.CONFIRMED&&item.source==="target_role"
    );
  }

  function confirmRoleChange(record){
    const previous=state.roleSelection||roleSelectionBeforeEdit;
    if(!previous)return true;
    const impact=assessTargetRoleChange({...state,roleSelection:previous},record);
    if(!impact.requiresConfirmation)return true;
    const message="Changing target role will refresh suggestions. "+impact.affected.length+
      " confirmed item"+(impact.affected.length===1?"":"s")+" will be kept for review. Continue?";
    if(typeof options.confirmTargetRoleChange==="function"){
      return options.confirmTargetRoleChange({message,affected:impact.affected,from:previous,to:record})!==false;
    }
    if(typeof window!=="undefined"&&typeof window.confirm==="function")return window.confirm(message);
    return false;
  }

  function chooseRole(record){
    if(!confirmRoleChange(record)){
      const previous=state.roleSelection||roleSelectionBeforeEdit;
      if(previous){
        state=selectTargetRole(state,previous);
        targetRole.value=previous.title;
      }
      roleSelectionBeforeEdit=null;
      renderRoleNote();
      hideRoleList();
      status.textContent="Target role change cancelled.";
      return;
    }
    state=selectTargetRole(state,record);
    roleSelectionBeforeEdit=null;
    state={...state,starterPack:refreshRoleStarterPack(
      state.starterPack,record,state.input.mode,{currentRole:state.input.currentRole}
    )};
    targetRole.value=record.title;
    renderRoleNote();
    hideRoleList();
    renderSimpleChoices();
    truth.hidden=false;
    status.textContent="Great. Now choose what is true about you.";
  }

  function renderRoleSuggestions(query){
    const value=String(query||"").trim();
    if(value.length<2){hideRoleList();return}
    roleOptions=[...searchLinkedInTargetRoles(value,8)];
    if(!roleOptions.length)roleOptions=[createLinkedInRoleRecord(value)];
    roleList.replaceChildren();
    roleOptions.forEach((record,index)=>{
      const item=el("div",{
        id:"li-role-option-"+index,className:"li-role-option",role:"option",
        "aria-selected":"false",dataset:{roleIndex:String(index)}
      });
      item.append(
        el("strong",{},record.title),
        el("small",{},isCatalogRole(record)?record.category:"Use as custom role")
      );
      item.addEventListener("pointerdown",event=>{event.preventDefault();chooseRole(record)});
      roleList.append(item);
    });
    roleList.hidden=false;
    targetRole.setAttribute("aria-expanded","true");
  }

  function choice(item,section){
    const label=el("label",{className:"li-choice",dataset:{state:item.state}});
    const box=el("input",{
      type:"checkbox",
      checked:item.state===STARTER_STATE.CONFIRMED,
      "aria-label":"Select "+item.text
    });
    const text=el("span",{},item.text);
    label.append(box,text);
    box.addEventListener("change",()=>{
      try{
        state={...state,starterPack:setStarterItemConfirmed(state.starterPack,section,item.id,box.checked)};
        label.dataset.state=box.checked?STARTER_STATE.CONFIRMED:STARTER_STATE.SUGGESTED;
        status.textContent=box.checked?"Added to your profile facts.":"Removed from your profile facts.";
      }catch(error){
        box.checked=false;
        status.textContent=error.message||"This item needs editing before it can be selected.";
      }
    });
    return label;
  }

  function renderSimpleChoices(){
    skillsChoices.replaceChildren();
    expChoices.replaceChildren();
    if(!state.starterPack)return;
    const simple=getSimpleStarterOptions(state.starterPack,state.input.mode);
    simple.skills.forEach(item=>skillsChoices.append(choice(item,STARTER_SECTION.SKILLS)));
    simple.experience.forEach(item=>expChoices.append(choice(item,STARTER_SECTION.EXPERIENCE)));
  }

  function addOwn(section,input){
    const text=input.value.trim();
    if(!text)return;
    state={...state,starterPack:addUserStarterItem(state.starterPack,section,text)};
    input.value="";
    renderSimpleChoices();
    status.textContent="Your information was added.";
  }

  function syncPrimary(){
    state=updateInput(state,"mode",mode.value);
    state=updateInput(state,"currentRole",currentRole.value);
    state=updateInput(state,"achievementsText",achievement.value);
  }

  function syncAdvanced(){
    for(const [key,node] of Object.entries(advanced))state=updateInput(state,key,node.value);
  }

  function syncControlsFromState(){
    mode.value=state.input.mode;
    currentRole.value=state.input.currentRole||"";
    targetRole.value=state.input.targetRole||"";
    achievement.value=state.input.achievementsText||"";
    Object.entries(advanced).forEach(([key,node])=>node.value=state.input[key]||"");
    if(state.input.targetRole&&!state.roleSelection){
      const restored=createLinkedInRoleRecord(state.input.targetRole);
      state=selectTargetRole(state,restored);
    }
    renderMode();
    renderRoleNote();
    renderSimpleChoices();
    truth.hidden=!state.roleSelection;
  }

  function reviewCards(){
    reviewList.replaceChildren();
    for(const check of state.review?.checks||[]){
      const row=el("div",{className:"li-review-row",dataset:{status:check.status}});
      row.append(el("strong",{},check.label),el("span",{},check.status.replace("_"," ")),el("p",{},check.message));
      reviewList.append(row);
    }
    if(state.generated?.headlines?.length>1){
      const alt=el("div",{className:"li-alt-headlines"});
      alt.append(el("strong",{},"Other headline styles"));
      state.generated.headlines.forEach(item=>{
        const btn=el("button",{type:"button"},item.label);
        btn.addEventListener("click",()=>{
          state=applyHeadlineAlternative(state,item.id);
          renderResults();
          status.textContent=item.label+" headline selected.";
        });
        alt.append(btn);
      });
      improveBody.append(alt);
    }
  }

  function resultCard(section,title,rows=6,maxLength=0){
    const card=el("article",{className:"li-result-card"});
    const head=el("div",{className:"li-result-head"});
    head.append(el("h3",{},title));
    const actions=el("div",{className:"li-result-actions"});
    const editBtn=el("button",{type:"button"},"Edit");
    const copyBtn=el("button",{type:"button"},"Copy");
    const regenBtn=el("button",{type:"button"},"Regenerate");
    actions.append(editBtn,copyBtn,regenBtn);
    head.append(actions);
    const area=el("textarea",{rows,value:state.drafts[section]||""});
    if(maxLength)area.maxLength=maxLength;
    area.setAttribute("aria-label",title+" draft");
    area.addEventListener("input",()=>{state=updateDraft(state,section,area.value)});
    editBtn.addEventListener("click",()=>area.focus());
    copyBtn.addEventListener("click",async()=>{
      const result=await copyText(area.value,options.clipboard);
      status.textContent=result.ok?title+" copied.":"Copy is unavailable in this browser.";
    });
    regenBtn.addEventListener("click",()=>{
      if(section==="headline"&&state.generated?.headlines?.length){
        headlineCycleIndex=(headlineCycleIndex+1)%state.generated.headlines.length;
        state=applyHeadlineAlternative(state,state.generated.headlines[headlineCycleIndex].id);
      }else{
        state=resetDraftToGenerated(state,section);
      }
      renderResults();
      status.textContent=title+" regenerated.";
    });
    card.append(head,area);
    return card;
  }

  function renderResults(){
    resultCards.replaceChildren();
    resultCards.append(
      resultCard("headline","Headline",3,220),
      resultCard("about","About",9,2600),
      resultCard("experience","Experience",8),
      resultCard("skills","Skills",6)
    );
    reviewCards();
    results.hidden=false;
  }

  mode.addEventListener("change",()=>{
    state=updateInput(state,"mode",mode.value);
    renderMode();
    if(state.roleSelection){
      state={...state,starterPack:refreshRoleStarterPack(
        state.starterPack,state.roleSelection,state.input.mode,{currentRole:currentRole.value}
      )};
      renderSimpleChoices();
    }
  });

  currentRole.addEventListener("input",()=>{
    state=updateInput(state,"currentRole",currentRole.value);
  });
  currentRole.addEventListener("change",()=>{
    if(state.roleSelection){
      state={...state,starterPack:refreshRoleStarterPack(
        state.starterPack,state.roleSelection,state.input.mode,{currentRole:currentRole.value}
      )};
      renderSimpleChoices();
    }
  });

  targetRole.addEventListener("input",()=>{
    if(state.roleSelection&&targetRole.value.trim()!==state.roleSelection.title)roleSelectionBeforeEdit=state.roleSelection;
    state=updateInput(state,"targetRole",targetRole.value);
    renderRoleSuggestions(targetRole.value);
  });
  targetRole.addEventListener("keydown",event=>{
    if(event.key==="ArrowDown"){
      if(roleList.hidden)renderRoleSuggestions(targetRole.value);
      if(roleOptions.length){event.preventDefault();setActiveRole(activeRoleIndex<0?0:activeRoleIndex+1)}
    }else if(event.key==="ArrowUp"&&roleOptions.length){
      event.preventDefault();setActiveRole(activeRoleIndex<=0?roleOptions.length-1:activeRoleIndex-1);
    }else if(event.key==="Enter"&&activeRoleIndex>=0&&roleOptions[activeRoleIndex]){
      event.preventDefault();chooseRole(roleOptions[activeRoleIndex]);
    }else if(event.key==="Escape"){
      hideRoleList();
    }
  });
  targetRole.addEventListener("blur",()=>setTimeout(hideRoleList,0));

  skillAddBtn.addEventListener("click",()=>addOwn(STARTER_SECTION.SKILLS,skillInput));
  skillInput.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();addOwn(STARTER_SECTION.SKILLS,skillInput)}});
  expAddBtn.addEventListener("click",()=>addOwn(STARTER_SECTION.EXPERIENCE,expInput));
  expInput.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();addOwn(STARTER_SECTION.EXPERIENCE,expInput)}});

  build.addEventListener("click",()=>{
    try{
      syncPrimary();
      syncAdvanced();
      const check=validateSimpleBuild(state);
      if(!check.ok){status.textContent=check.message;return}
      state=generateProfileSections(state);
      renderResults();
      results.scrollIntoView?.({behavior:"smooth",block:"start"});
      status.textContent="Your LinkedIn profile is ready.";
    }catch(error){
      status.textContent=error.message||"Unable to build your profile.";
    }
  });

  save.addEventListener("click",()=>{
    syncPrimary();syncAdvanced();
    const result=store.save(state);
    status.textContent=result.ok?"Draft saved in this browser.":"Draft could not be saved.";
  });
  restore.addEventListener("click",()=>{
    const result=store.load();
    if(result.ok&&result.state){
      state=result.state;
      syncControlsFromState();
      if(state.generated||state.review)renderResults(); else results.hidden=true;
      status.textContent="Saved draft restored.";
    }else status.textContent=result.ok?"No saved draft was found.":"Saved draft could not be restored.";
  });
  startNew.addEventListener("click",()=>{
    state=createTask3State();
    roleSelectionBeforeEdit=null;
    headlineCycleIndex=0;
    hideRoleList();
    syncControlsFromState();
    results.hidden=true;
    status.textContent="Started a new profile.";
  });
  clearSaved.addEventListener("click",()=>{
    const result=store.clear();
    status.textContent=result.ok?"Saved draft cleared.":"Saved draft could not be cleared.";
  });

  syncControlsFromState();

  return {
    getState:()=>state,
    build:()=>{
      syncPrimary();syncAdvanced();
      const check=validateSimpleBuild(state);
      if(!check.ok)throw new Error(check.message);
      state=generateProfileSections(state);renderResults();return state;
    },
    save:()=>store.save(state),
    restore:()=>store.load(),
    clearSaved:()=>store.clear(),
    selectRole:record=>{chooseRole(record);return state},
  };
}
