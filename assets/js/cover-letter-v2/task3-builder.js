import { CANDIDATE_TYPES } from "./contracts.js";
import { LETTER_LENGTHS, LETTER_TONES } from "./writing-contracts.js";
import { COVER_LETTER_TEMPLATES } from "./template-contracts.js";
import { createBuilderState, updateBuilderState } from "./builder-state.js";
import { createDraftStore } from "./draft-store.js";
import { createCoverLetterDraft, checkCoverLetterQuality } from "./task2-engine.js";
import { createPreviewModel, renderPreview } from "./template-renderer.js";
import { copyCoverLetter } from "./export-utils.js";
import { printOrSavePdf } from "./print-export.js";
import { downloadPdfWithAdapter, hasDirectPdfExporter } from "./pdf-export-adapter.js";
import { browserPdfExporter } from "./browser-pdf-exporter.js";

function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key in node && key !== "form") node[key] = value;
    else node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
}

function field(labelText, name, options = {}) {
  const wrap = el("div", { className: "clv2-field" });
  const id = `clv2-${name}`;
  const label = el("label", { htmlFor: id }, labelText);
  const input = options.multiline
    ? el("textarea", { id, name, rows: options.rows || 5, maxLength: options.maxLength || 80000 })
    : el("input", { id, name, type: options.type || "text", maxLength: options.maxLength || 500 });
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.required) input.required = true;
  wrap.append(label, input);
  return { wrap, input };
}

export function mountCoverLetterTask3(root, options = {}) {
  if (!root || typeof document === "undefined") throw new Error("A DOM root is required.");

  const store = createDraftStore(options.storage || window.localStorage);
  const pdfExporter = options.pdfExporter || browserPdfExporter;
  const restored = store.load();
  let state = restored.ok && restored.state ? restored.state : createBuilderState();

  root.replaceChildren();
  root.classList.add("clv2-builder");
  root.setAttribute("aria-label", "Cover Letter Builder");

  const status = el("p", { className: "clv2-status", role: "status", "aria-live": "polite" });
  const layout = el("div", { className: "clv2-layout" });
  const form = el("form", { className: "clv2-form", noValidate: true });
  const previewPanel = el("section", { className: "clv2-preview-panel", "aria-labelledby": "clv2-preview-heading" });
  previewPanel.append(el("h2", { id: "clv2-preview-heading" }, "Live preview"));
  const preview = el("div", { className: "clv2-preview", tabIndex: 0 });
  previewPanel.append(preview);

  const progress = el("nav", { className: "clv2-progress", "aria-label": "Cover letter steps" });
  const steps = ["Your details","Resume","Target job","Personalization","Generate","Review","Design & Export"];
  steps.forEach((name, index) => {
    const item = el("span", { className: "clv2-step", dataset: { step: String(index + 1) } }, `${index + 1}. ${name}`);
    progress.append(item);
  });
  form.append(progress);

  const candidateTypeWrap = el("fieldset", { className: "clv2-fieldset" });
  candidateTypeWrap.append(el("legend", {}, "Candidate type"));
  [
    [CANDIDATE_TYPES.FRESHER, "Fresher / Student"],
    [CANDIDATE_TYPES.EXPERIENCED, "Experienced"],
    [CANDIDATE_TYPES.CAREER_CHANGER, "Career changer"],
  ].forEach(([value, label]) => {
    const id = `clv2-type-${value}`;
    const radio = el("input", { id, type: "radio", name: "candidateType", value });
    const lab = el("label", { htmlFor: id }, label);
    candidateTypeWrap.append(radio, lab);
  });
  form.append(candidateTypeWrap);

  const fields = {};
  [
    ["Full name","fullName",{required:true}],
    ["Email","email",{type:"email"}],
    ["Phone","phone",{}],
    ["Location","location",{}],
    ["LinkedIn or portfolio","linkedinOrPortfolio",{}],
    ["Target position","targetPosition",{required:true}],
    ["Company","company",{required:true}],
    ["Hiring manager / recipient","recipient",{}],
    ["Paste resume text","resumeText",{multiline:true,rows:8,maxLength:120000}],
    ["Paste job description","jobDescription",{multiline:true,rows:8,maxLength:80000}],
    ["Why this company or role?","motivation",{multiline:true,rows:4,maxLength:6000}],
  ].forEach(([label,name,config]) => {
    const built = field(label,name,config);
    fields[name] = built.input;
    form.append(built.wrap);
  });

  const controls = el("div", { className: "clv2-controls" });
  const toneLabel = el("label", { htmlFor: "clv2-tone" }, "Tone");
  const tone = el("select", { id: "clv2-tone", name: "tone" });
  Object.values(LETTER_TONES).forEach((value) => tone.append(el("option", { value }, value.replace("_"," "))));
  const lengthLabel = el("label", { htmlFor: "clv2-length" }, "Length");
  const length = el("select", { id: "clv2-length", name: "length" });
  Object.values(LETTER_LENGTHS).forEach((value) => length.append(el("option", { value }, value)));
  controls.append(toneLabel,tone,lengthLabel,length);
  form.append(controls);

  const actions = el("div", { className: "clv2-actions" });
  const generate = el("button", { type: "submit", className: "clv2-primary" }, "Generate cover letter");
  const save = el("button", { type: "button" }, "Save draft");
  const clear = el("button", { type: "button" }, "Start new letter");
  actions.append(generate, save, clear);
  form.append(actions);

  const review = el("section", { className: "clv2-review", "aria-labelledby": "clv2-review-heading" });
  review.append(el("h2", { id: "clv2-review-heading" }, "Review"));
  const editorLabel = el("label", { htmlFor: "clv2-editor" }, "Edit cover letter");
  const editor = el("textarea", { id: "clv2-editor", rows: 18, maxLength: 8000 });
  const quality = el("div", { className: "clv2-quality", role: "status", "aria-live": "polite" });
  review.append(editorLabel, editor, quality);
  form.append(review);

  const design = el("fieldset", { className: "clv2-templates" });
  design.append(el("legend", {}, "Choose a template"));
  COVER_LETTER_TEMPLATES.forEach((template) => {
    const id = `clv2-template-${template.id}`;
    const radio = el("input", { id, type: "radio", name: "templateId", value: template.id });
    const label = el("label", { htmlFor: id }, `${template.name} — ${template.description}`);
    design.append(radio,label);
  });
  form.append(design);

  const exportActions = el("div", { className: "clv2-actions clv2-export-actions" });
  const copyButton = el("button", { type: "button" }, "Copy");
  const printButton = el("button", { type: "button" }, "Print / Save PDF");
  const downloadPdfButton = el("button", { type: "button" }, "Download PDF");
  downloadPdfButton.disabled = !hasDirectPdfExporter(pdfExporter);
  if (downloadPdfButton.disabled) {
    downloadPdfButton.title = "Direct PDF download is unavailable until a bundled PDF exporter is provided.";
  }
  exportActions.append(copyButton, printButton, downloadPdfButton);
  form.append(exportActions);

  const privacyNotice = el("p", { className: "clv2-privacy-note" },
    "Your cover-letter content is processed in this browser. Saved drafts use this device's browser storage. No generation request is sent to a server by this V2 builder.");
  form.append(privacyNotice);

  layout.append(form,previewPanel);
  root.append(status,layout);

  function collectInput() {
    const checkedType = form.querySelector('input[name="candidateType"]:checked');
    return {
      candidate: {
        candidateType: checkedType?.value || CANDIDATE_TYPES.EXPERIENCED,
        fullName: fields.fullName.value,
        email: fields.email.value,
        phone: fields.phone.value,
        location: fields.location.value,
        linkedinOrPortfolio: fields.linkedinOrPortfolio.value,
        targetPosition: fields.targetPosition.value,
        company: fields.company.value,
        recipient: fields.recipient.value,
        motivation: fields.motivation.value,
      },
      resumeText: fields.resumeText.value,
      jobDescription: fields.jobDescription.value,
    };
  }

  function updatePreview() {
    renderPreview(preview, createPreviewModel({ letter: editor.value, templateId: state.templateId }));
  }

  function updateQuality() {
    if (!editor.value.trim() || !state.input?.resumeText) {
      quality.textContent = "";
      return;
    }
    try {
      const draft = createCoverLetterDraft(state.input, { tone: state.tone, length: state.length });
      const result = checkCoverLetterQuality(editor.value, draft.foundation);
      state = updateBuilderState(state,{quality:result});
      quality.textContent = `${result.summary}. ${result.wordCount} words.`;
    } catch {
      quality.textContent = "Complete the required inputs to run the quality check.";
    }
  }

  function hydrate(next) {
    state = createBuilderState(next);
    const candidate = state.input?.candidate || {};
    for (const [name,input] of Object.entries(fields)) {
      input.value = name === "resumeText" || name === "jobDescription" ? state.input?.[name] || "" : candidate[name] || "";
    }
    const candidateRadio = form.querySelector(`input[name="candidateType"][value="${candidate.candidateType || CANDIDATE_TYPES.EXPERIENCED}"]`);
    if (candidateRadio) candidateRadio.checked = true;
    tone.value = state.tone;
    length.value = state.length;
    const templateRadio = form.querySelector(`input[name="templateId"][value="${state.templateId}"]`);
    if (templateRadio) templateRadio.checked = true;
    editor.value = state.draft;
    updatePreview();
    updateQuality();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = collectInput();
    try {
      const result = createCoverLetterDraft(input,{tone:tone.value,length:length.value});
      state = updateBuilderState(state,{
        input,
        draft:result.generated.letter,
        manualEdit:false,
        tone:tone.value,
        length:length.value,
        quality:result.quality,
        step:"review",
      });
      editor.value = state.draft;
      status.textContent = "Cover letter generated. Review and edit it before choosing a design.";
      updatePreview();
      updateQuality();
      editor.focus();
    } catch (error) {
      status.textContent = error?.message || "Complete the required information before generating.";
    }
  });

  editor.addEventListener("input", () => {
    state = updateBuilderState(state,{draft:editor.value,manualEdit:true});
    updatePreview();
    updateQuality();
  });

  design.addEventListener("change", (event) => {
    if (event.target?.name !== "templateId") return;
    state = updateBuilderState(state,{templateId:event.target.value,step:"design"});
    updatePreview();
    status.textContent = `${event.target.value} template selected.`;
  });

  copyButton.addEventListener("click", async () => {
    const result = await copyCoverLetter(editor.value);
    status.textContent = result.ok ? "Cover letter copied." : "Could not copy the cover letter.";
  });

  printButton.addEventListener("click", () => {
    const result = printOrSavePdf({ letter: editor.value, templateId: state.templateId, pageSize: "A4" });
    status.textContent = result.ok
      ? "Print dialog opened. Choose Save as PDF to create a PDF."
      : result.reason === "popup_blocked"
        ? "The print window was blocked by the browser. Allow pop-ups for this action and try again."
        : "Generate or enter a cover letter before printing.";
  });

  downloadPdfButton.addEventListener("click", async () => {
    const result = await downloadPdfWithAdapter({
      letter: editor.value,
      templateId: state.templateId,
      candidate: collectInput().candidate,
      pdfExporter,
      pageSize: "A4",
    });
    if (!result.ok) {
      status.textContent = result.reason === "direct_pdf_exporter_unavailable"
        ? "Direct PDF download is not available in this build. Use Print / Save PDF."
        : "Could not create the PDF.";
      return;
    }
    const anchor = el("a", { href: result.url, download: result.filename });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    result.revoke();
    status.textContent = "PDF downloaded.";
  });

  save.addEventListener("click", () => {
    state = updateBuilderState(state,{input:collectInput(),draft:editor.value,tone:tone.value,length:length.value});
    const result = store.save(state);
    status.textContent = result.ok ? "Draft saved on this device." : "Draft could not be saved on this device.";
  });

  clear.addEventListener("click", () => {
    store.clear();
    state = createBuilderState();
    hydrate(state);
    status.textContent = "Started a new cover letter. The saved draft on this device was cleared.";
    fields.fullName.focus();
  });

  hydrate(state);
  if (restored.ok && restored.state) status.textContent = "Saved draft restored from this device.";

  return {
    getState: () => state,
    save: () => store.save(updateBuilderState(state,{input:collectInput(),draft:editor.value})),
    clear: () => { store.clear(); hydrate(createBuilderState()); },
    refreshPreview: updatePreview,
  };
}
