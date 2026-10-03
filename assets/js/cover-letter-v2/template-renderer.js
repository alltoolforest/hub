import { DEFAULT_TEMPLATE_ID, isTemplateId } from "./template-contracts.js";

function text(value) {
  return String(value || "").trim();
}

export function splitLetterForPreview(letter) {
  const blocks = text(letter).split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block, index) => ({
    id: `block-${index + 1}`,
    text: block,
  }));
}

export function createPreviewModel({ letter = "", templateId = DEFAULT_TEMPLATE_ID } = {}) {
  return {
    templateId: isTemplateId(templateId) ? templateId : DEFAULT_TEMPLATE_ID,
    blocks: splitLetterForPreview(letter),
    empty: !text(letter),
  };
}

export function renderPreview(root, model) {
  if (!root || typeof document === "undefined") return;
  root.replaceChildren();
  root.dataset.template = model.templateId;
  root.setAttribute("aria-label", "Cover letter live preview");

  if (model.empty) {
    const empty = document.createElement("p");
    empty.className = "clv2-preview-empty";
    empty.textContent = "Generate a cover letter to see the live document preview.";
    root.append(empty);
    return;
  }

  for (const block of model.blocks) {
    const paragraph = document.createElement("p");
    paragraph.className = "clv2-preview-block";
    paragraph.textContent = block.text;
    root.append(paragraph);
  }
}
