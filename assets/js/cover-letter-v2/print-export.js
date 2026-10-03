import { createPreviewModel } from "./template-renderer.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function templateFont(templateId) {
  if (templateId === "classic") return "Georgia, 'Times New Roman', serif";
  return "Arial, Helvetica, sans-serif";
}

export function buildPrintableHtml({ letter = "", templateId = "classic", pageSize = "A4" } = {}) {
  const model = createPreviewModel({ letter, templateId });
  const size = pageSize === "LETTER" ? "Letter" : "A4";
  const blocks = model.blocks.map((block) => `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cover Letter</title><style>
@page{size:${size};margin:18mm}
html,body{margin:0;padding:0;background:#fff;color:#111}
body{font-family:${templateFont(model.templateId)};font-size:11pt;line-height:1.5;overflow-wrap:anywhere}
main{max-width:180mm;margin:0 auto}
p{margin:0 0 1em;white-space:normal}
[data-template="modern"]{border-top:6px solid #111;padding-top:14mm}
[data-template="minimal"]{max-width:165mm}
[data-template="professional"]{border:1.5px solid #111;padding:12mm;box-sizing:border-box}
</style></head><body><main data-template="${escapeHtml(model.templateId)}">${blocks}</main></body></html>`;
}

export function printOrSavePdf({ letter, templateId = "classic", pageSize = "A4" } = {}, win = globalThis.window) {
  if (!String(letter || "").trim()) return { ok: false, reason: "empty" };
  if (!win || typeof win.open !== "function") return { ok: false, reason: "window_unavailable" };

  const popup = win.open("", "_blank", "noopener,noreferrer");
  if (!popup) return { ok: false, reason: "popup_blocked" };

  const html = buildPrintableHtml({ letter, templateId, pageSize });
  popup.document.open();
  popup.document.write(html);
  popup.document.close();

  const run = () => {
    try {
      popup.focus();
      popup.print();
    } catch {}
  };

  if (popup.document.readyState === "complete") run();
  else popup.addEventListener("load", run, { once: true });

  return { ok: true, method: "browser_print_dialog" };
}
