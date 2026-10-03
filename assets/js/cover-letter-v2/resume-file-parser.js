import { classifyResumeFile } from "./file-intake.js";
import { loadPdfEngine, loadDocxEngine } from "./resume-parser-loader.js";

const MAX_PDF_PAGES = 60;
const MAX_EXTRACTED_CHARS = 120000;

function clean(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

async function parsePdf(arrayBuffer) {
  const pdfjs = await loadPdfEngine();
  let task;
  let doc;
  try {
    task = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer).slice(), isEvalSupported: false });
    doc = await task.promise;
    if (doc.numPages > MAX_PDF_PAGES) throw new Error("This PDF has too many pages for the cover-letter workflow.");

    const pages = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = (content.items || []).map((item) => clean(item?.str)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push(text);
        if (pages.join("\n\n").length > MAX_EXTRACTED_CHARS) throw new Error("Extracted resume text is too large.");
      } finally {
        page.cleanup?.();
      }
    }
    const extractedText = pages.join("\n\n").trim();
    if (!extractedText || extractedText.replace(/\s/g, "").length < 30) {
      return { status: "needs_paste_fallback", message: "Very little selectable text was found. If this is a scanned or image-only PDF, paste the resume text to continue." };
    }
    return { status: "ready", extractedText, warnings: [] };
  } catch (error) {
    const message = clean(error?.message).toLowerCase();
    if (/password|encrypted/.test(message)) return { status: "needs_paste_fallback", message: "This PDF is password-protected. Use an unlocked copy or paste the resume text." };
    return { status: "needs_paste_fallback", message: "The PDF could not be read reliably in this browser. Try another copy or paste the resume text." };
  } finally {
    try { await doc?.destroy?.(); } catch {}
    try { await task?.destroy?.(); } catch {}
  }
}

function textFromHtml(html) {
  const source = String(html || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return source.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

async function parseDocx(arrayBuffer) {
  try {
    const mammoth = await loadDocxEngine();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const extractedText = textFromHtml(result?.value);
    if (!extractedText) return { status: "needs_paste_fallback", message: "No readable text was found in this DOCX. Paste the resume text to continue." };
    if (extractedText.length > MAX_EXTRACTED_CHARS) return { status: "needs_paste_fallback", message: "The extracted DOCX text is too large. Paste a shorter resume version." };
    return { status: "ready", extractedText, warnings: (result?.messages || []).map((item) => clean(item?.message)).filter(Boolean).slice(0, 5) };
  } catch {
    return { status: "needs_paste_fallback", message: "The DOCX could not be read reliably in this browser. Try another copy or paste the resume text." };
  }
}

export async function parseResumeFile(file) {
  const classification = classifyResumeFile(file);
  if (!classification.ok) return { status: "error", ...classification };
  if (typeof file.arrayBuffer !== "function") return { status: "error", code: "file_api_unavailable", message: "This browser cannot read the selected file. Paste the resume text instead." };

  const arrayBuffer = await file.arrayBuffer();
  if (classification.extension === "pdf") return { ...(await parsePdf(arrayBuffer)), source: "pdf", name: classification.name };
  return { ...(await parseDocx(arrayBuffer)), source: "docx", name: classification.name };
}
