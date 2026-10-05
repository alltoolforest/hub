import { PROFILE_MODE } from "./contracts.js";
import {
  createTask3State,updateInput,selectTargetRole,generateProfileSections,applyHeadlineAlternative,
  updateDraft,resetDraftToGenerated
} from "./task3-state.js";
import { createLinkedInDraftStore } from "./task3-storage.js";
import { LINKEDIN_PRIVACY_NOTICE } from "./task4-hardening.js";
import {
  searchLinkedInTargetRoles,createLinkedInRoleRecord,isCatalogRole
} from "./rework-task1-role-adapter.js";
import {
  STARTER_STATE,STARTER_SECTION,refreshRoleStarterPack,
  editStarterItem,setStarterItemConfirmed,addUserStarterItem,removeStarterItem
} from "./rework-task2-starter-pack.js";

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
  const privacy=el("div",{className:"liv2-privacy",role:"note"},LINKEDIN_PRIVACY_NOTICE);

  const details=el("section",{className:"liv2-panel","aria-labelledby":"liv2-details-heading"});
  details.append(
    el("h2",{id:"liv2-details-heading"},"1. Choose your profile direction"),
    el("p",{className:"liv2-entry-intro"},"Select your profile mode, then start typing the role you want to target. Role suggestions use the same verified occupation engine as Resume Studio.")
  );

  const mode=el("select",{id:"liv2-mode"});
  mode.append(
    option(PROFILE_MODE.FRESHER,"Fresher / Student"),
    option(PROFILE_MODE.EXPERIENCED,"Experienced"),
    option(PROFILE_MODE.CAREER_CHANGER,"Career changer")
  );
  const inputs={
    targetRole:el("input",{
      id:"liv2-target-role",type:"text",maxLength:160,autocomplete:"off",spellcheck:false,
      role:"combobox","aria-autocomplete":"list","aria-expanded":"false","aria-controls":"liv2-target-role-list"
    }),
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
  const targetRoleField=field(
    "Target role",
    inputs.targetRole,
    "Type at least 2 characters, then choose the closest role. You can keep custom wording if no catalog role matches."
  );
  const roleList=el("div",{id:"liv2-target-role-list",className:"liv2-role-list",role:"listbox",hidden:true});
  const selectedRoleNote=el("small",{className:"liv2-selected-role",hidden:true});
  targetRoleField.append(roleList,selectedRoleNote);

  details.append(
    field("Profile mode",mode,"Choose the profile situation that best matches you."),
    targetRoleField,
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

  const starter=el("section",{className:"liv2-panel liv2-starter-panel",hidden:true,"aria-labelledby":"liv2-starter-heading"});
  starter.append(
    el("h2",{id:"liv2-starter-heading"},"Role starter suggestions"),
    el("p",{className:"liv2-entry-intro"},"These are ideas, not claims about you. Select only what is true, edit suggestions when needed, or add your own information.")
  );
  const starterSections=el("div",{className:"liv2-starter-sections"});
  starter.append(starterSections);

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

  root.append(privacy,details,starter,actions,review,optimize,status);

  function syncInputControls(){
    mode.value=state.input.mode;
    Object.entries(inputs).forEach(([key,node])=>node.value=state.input[key]||"");
    if(state.input.targetRole&&!state.roleSelection){
      const restored=createLinkedInRoleRecord(state.input.targetRole);
      if(isCatalogRole(restored))state=selectTargetRole(state,restored);
    }
    renderSelectedRole();
  }
  function syncStateFromControls(){
    state=updateInput(state,"mode",mode.value);
    for(const [key,node] of Object.entries(inputs))state=updateInput(state,key,node.value);
  }
  let roleOptions=[];
  let activeRoleIndex=-1;

  function renderSelectedRole(){
    if(state.roleSelection&&isCatalogRole(state.roleSelection)){
      selectedRoleNote.hidden=false;
      selectedRoleNote.textContent="Selected role: "+state.roleSelection.title+" · "+state.roleSelection.category;
    }else{
      selectedRoleNote.hidden=true;
      selectedRoleNote.textContent="";
    }
  }

  function hideRoleList(){
    roleList.hidden=true;
    roleList.replaceChildren();
    roleOptions=[];
    activeRoleIndex=-1;
    inputs.targetRole.setAttribute("aria-expanded","false");
    inputs.targetRole.removeAttribute("aria-activedescendant");
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
    if(active)inputs.targetRole.setAttribute("aria-activedescendant",active.id);
  }

  function chooseRole(record){
    state=selectTargetRole(state,record);
    state={...state,starterPack:refreshRoleStarterPack(
      state.starterPack,record,state.input.mode,{currentRole:state.input.currentRole}
    )};
    inputs.targetRole.value=record.title;
    setTargetRoleError();
    renderSelectedRole();
    hideRoleList();
    renderStarterPack();
    status.textContent=record.title+" selected. Role starter suggestions are ready.";
  }

  function renderRoleSuggestions(query){
    const value=String(query||"").trim();
    if(value.length<2){hideRoleList();return}
    roleOptions=[...searchLinkedInTargetRoles(value,8)];
    roleList.replaceChildren();
    activeRoleIndex=-1;
    if(!roleOptions.length){
      hideRoleList();
      return;
    }
    roleOptions.forEach((record,index)=>{
      const item=el("div",{
        id:"liv2-role-option-"+index,
        className:"liv2-role-option",
        role:"option",
        "aria-selected":"false",
        dataset:{roleIndex:String(index)}
      });
      item.append(
        el("strong",{},record.title),
        el("small",{},record.category)
      );
      item.addEventListener("pointerdown",event=>{
        event.preventDefault();
        chooseRole(record);
      });
      roleList.append(item);
    });
    roleList.hidden=false;
    inputs.targetRole.setAttribute("aria-expanded","true");
  }

  const starterMeta=Object.freeze({
    [STARTER_SECTION.HEADLINE]:{
      title:"Current headline",
      help:"Choose role or skill points that are genuinely true about you."
    },
    [STARTER_SECTION.ABOUT]:{
      title:"Current About section",
      help:"Choose the points you want your About section to cover. These prompts are guidance, not factual claims."
    },
    [STARTER_SECTION.EXPERIENCE]:{
      title:"Experience text",
      help:"Confirm only responsibilities you have actually performed."
    },
    [STARTER_SECTION.SKILLS]:{
      title:"Current skills",
      help:"Select only skills you genuinely have. Unselected skills remain suggestions."
    },
    [STARTER_SECTION.ACHIEVEMENTS]:{
      title:"Achievements / evidence",
      help:"Replace blanks with evidence you can support before confirming an achievement."
    },
    [STARTER_SECTION.PROFESSIONAL_FOCUS]:{
      title:"Professional focus / next step",
      help:"Choose or edit the direction statement that best matches your intent."
    }
  });

  function starterBadge(item){
    if(item.state===STARTER_STATE.USER_ENTERED)return "Added by you";
    if(item.state===STARTER_STATE.CONFIRMED)return item.staleForTarget?"Confirmed · review for new target":"Confirmed";
    return "Suggested";
  }

  function renderStarterItem(section,item){
    const row=el("div",{className:"liv2-starter-item",dataset:{state:item.state}});
    const main=el("div",{className:"liv2-starter-item-main"});
    let checkbox=null;
    if(item.state!==STARTER_STATE.USER_ENTERED){
      checkbox=el("input",{
        type:"checkbox",
        checked:item.state===STARTER_STATE.CONFIRMED,
        "aria-label":"Confirm "+starterMeta[section].title+" suggestion"
      });
      main.append(checkbox);
    }else{
      main.append(el("span",{className:"liv2-user-marker","aria-hidden":"true"},"+"));
    }

    const editor=(section===STARTER_SECTION.ABOUT||section===STARTER_SECTION.EXPERIENCE||section===STARTER_SECTION.PROFESSIONAL_FOCUS)
      ? el("textarea",{rows:2,value:item.text,"aria-label":starterMeta[section].title+" starter text"})
      : el("input",{type:"text",value:item.text,"aria-label":starterMeta[section].title+" starter text"});
    const badge=el("span",{className:"liv2-starter-badge"},starterBadge(item));
    const remove=el("button",{type:"button",className:"liv2-starter-remove","aria-label":"Remove this "+starterMeta[section].title+" item"},"Remove");

    const textWrap=el("div",{className:"liv2-starter-text"});
    textWrap.append(editor,badge);
    if(item.requiresEdit)textWrap.append(el("small",{},"Edit this prompt into truthful information before confirming."));
    main.append(textWrap,remove);
    row.append(main);

    editor.addEventListener("input",()=>{
      state={...state,starterPack:editStarterItem(state.starterPack,section,item.id,editor.value)};
      const updated=state.starterPack.sections[section].find(entry=>entry.id===item.id);
      if(updated){
        badge.textContent=starterBadge(updated);
        if(checkbox)checkbox.checked=updated.state===STARTER_STATE.CONFIRMED;
      }
    });
    if(checkbox)checkbox.addEventListener("change",()=>{
      try{
        state={...state,starterPack:setStarterItemConfirmed(state.starterPack,section,item.id,checkbox.checked)};
        const updated=state.starterPack.sections[section].find(entry=>entry.id===item.id);
        badge.textContent=starterBadge(updated);
        row.dataset.state=updated.state;
        status.textContent=updated.state===STARTER_STATE.CONFIRMED
          ? starterMeta[section].title+" item confirmed."
          : starterMeta[section].title+" item returned to Suggested.";
      }catch(error){
        checkbox.checked=false;
        status.textContent=error.message||"Edit this suggestion before confirming it.";
      }
    });
    remove.addEventListener("click",()=>{
      state={...state,starterPack:removeStarterItem(state.starterPack,section,item.id)};
      renderStarterPack();
      status.textContent=starterMeta[section].title+" item removed.";
    });
    return row;
  }

  function renderStarterPack(){
    starterSections.replaceChildren();
    const pack=state.starterPack;
    if(!pack||!state.roleSelection){
      starter.hidden=true;
      return;
    }
    for(const section of Object.values(STARTER_SECTION)){
      const meta=starterMeta[section];
      const card=el("article",{className:"liv2-starter-section",dataset:{section}});
      card.append(el("h3",{},meta.title),el("p",{className:"liv2-starter-help"},meta.help));
      const items=pack.sections[section]||[];
      if(section===STARTER_SECTION.EXPERIENCE){
        const targetItems=items.filter(item=>item.group!=="transferable_current_role");
        const transferItems=items.filter(item=>item.group==="transferable_current_role");
        const targetWrap=el("div",{className:"liv2-starter-list"});
        targetItems.forEach(item=>targetWrap.append(renderStarterItem(section,item)));
        card.append(el("h4",{},"Target-role responsibility ideas"),targetWrap);
        if(transferItems.length){
          const transferWrap=el("div",{className:"liv2-starter-list"});
          transferItems.forEach(item=>transferWrap.append(renderStarterItem(section,item)));
          card.append(
            el("h4",{},"Transferable ideas from your current role"),
            el("p",{className:"liv2-starter-help"},"These come from the current role you entered and stay separate from target-role responsibilities."),
            transferWrap
          );
        }
      }else{
        const list=el("div",{className:"liv2-starter-list"});
        items.forEach(item=>list.append(renderStarterItem(section,item)));
        card.append(list);
      }
      const add=el("button",{type:"button",className:"liv2-starter-add"},"Add your own");
      add.addEventListener("click",()=>{
        state={...state,starterPack:addUserStarterItem(state.starterPack,section,"")};
        renderStarterPack();
        const cardNow=starterSections.querySelector('[data-section="'+section+'"]');
        const editors=cardNow?.querySelectorAll(".liv2-starter-item input[type=text],.liv2-starter-item textarea");
        editors?.[editors.length-1]?.focus();
      });
      card.append(add);
      starterSections.append(card);
    }
    starter.hidden=false;
  }

  function refreshStarterContext(){
    if(!state.roleSelection)return;
    state={...state,starterPack:refreshRoleStarterPack(
      state.starterPack,state.roleSelection,state.input.mode,{currentRole:state.input.currentRole}
    )};
    renderStarterPack();
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
    const textareaId="liv2-draft-"+section;
    const counterId=textareaId+"-counter";
    const textarea=el("textarea",{id:textareaId,rows:section==="about"?10:section==="experience"?9:6,value});
    textarea.setAttribute("aria-label",title+" optimized wording");
    const counter=el("small",{id:counterId,className:"liv2-counter"});
    if(counterMax){
      counter.textContent=textarea.value.length+" / "+counterMax+" characters";
      textarea.setAttribute("aria-describedby",counterId);
    }

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

  mode.addEventListener("change",()=>{
    state=updateInput(state,"mode",mode.value);
    refreshStarterContext();
  });
  Object.entries(inputs).forEach(([key,node])=>node.addEventListener("input",()=>{
    state=updateInput(state,key,node.value);
    if(key==="targetRole"){
      renderSelectedRole();
      renderRoleSuggestions(node.value);
      if(node.value.trim())setTargetRoleError();
      if(!state.roleSelection)starter.hidden=true;
    }
  }));
  inputs.targetRole.addEventListener("keydown",event=>{
    if(event.key==="ArrowDown"){
      if(roleList.hidden)renderRoleSuggestions(inputs.targetRole.value);
      if(roleOptions.length){event.preventDefault();setActiveRole(activeRoleIndex<0?0:activeRoleIndex+1)}
    }else if(event.key==="ArrowUp"&&roleOptions.length){
      event.preventDefault();setActiveRole(activeRoleIndex<=0?roleOptions.length-1:activeRoleIndex-1);
    }else if(event.key==="Enter"&&activeRoleIndex>=0&&roleOptions[activeRoleIndex]){
      event.preventDefault();chooseRole(roleOptions[activeRoleIndex]);
    }else if(event.key==="Escape"){
      hideRoleList();
    }
  });
  inputs.targetRole.addEventListener("blur",()=>setTimeout(hideRoleList,0));
  inputs.currentRole.addEventListener("change",()=>refreshStarterContext());

  const targetError=el("small",{id:"liv2-target-role-error",className:"liv2-field-error",role:"alert",hidden:true});
  inputs.targetRole.setAttribute("aria-describedby","liv2-target-role-error");
  details.insertBefore(targetError,inputs.targetRole.closest(".liv2-field")?.nextSibling||null);

  function setTargetRoleError(message=""){
    if(message){
      targetError.textContent=message;
      targetError.hidden=false;
      inputs.targetRole.setAttribute("aria-invalid","true");
    }else{
      targetError.textContent="";
      targetError.hidden=true;
      inputs.targetRole.removeAttribute("aria-invalid");
    }
  }

  generate.addEventListener("click",()=>{
    try{
      setTargetRoleError();
      syncStateFromControls();
      state=generateProfileSections(state);
      renderReview();
      renderSections();
      status.textContent="Profile review and optimization suggestions are ready.";
    }catch(error){
      const message=error.message||"Unable to optimize this profile.";
      if(/target role/i.test(message))setTargetRoleError(message);
      status.textContent=message;
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
  renderStarterPack();

  return {
    getState:()=>state,
    generate:()=>{syncStateFromControls();state=generateProfileSections(state);renderReview();renderSections();return state},
    save:()=>store.save(state),
    restore:()=>store.load(),
    clearSaved:()=>store.clear()
  };
}
