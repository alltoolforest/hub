function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(text) {
  return new TextEncoder().encode(String(text));
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = words.shift();
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function templateFont(templateId) {
  return templateId === "classic" ? "Georgia" : "Arial";
}

function drawLetterPages({ letter, templateId = "classic", pageSize = "A4" }) {
  if (typeof document === "undefined") throw new Error("browser_canvas_unavailable");
  const canvasWidth = 1240;
  const canvasHeight = pageSize === "LETTER" ? 1605 : 1754;
  const marginX = templateId === "minimal" ? 130 : 105;
  const marginY = templateId === "professional" ? 120 : 105;
  const fontSize = 28;
  const lineHeight = 43;
  const paragraphGap = 18;
  const usableWidth = canvasWidth - marginX * 2;
  const usableBottom = canvasHeight - marginY;
  const paragraphs = String(letter || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pages = [];

  let canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  let ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("browser_canvas_unavailable");

  const resetPage = () => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#111";
    ctx.textBaseline = "top";
    ctx.font = `${fontSize}px ${templateFont(templateId)}`;
    if (templateId === "modern") {
      ctx.fillRect(0, 0, canvasWidth, 18);
    }
    if (templateId === "professional") {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#111";
      ctx.strokeRect(60, 60, canvasWidth - 120, canvasHeight - 120);
    }
  };

  const pushPage = () => {
    pages.push({
      width: canvasWidth,
      height: canvasHeight,
      jpeg: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.93)),
    });
    canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("browser_canvas_unavailable");
    resetPage();
  };

  resetPage();
  let y = marginY + (templateId === "modern" ? 26 : 0);

  for (const paragraph of paragraphs) {
    const rawLines = paragraph.split("\n");
    for (const rawLine of rawLines) {
      const wrapped = wrapText(ctx, rawLine, usableWidth);
      for (const line of wrapped) {
        if (y + lineHeight > usableBottom) {
          pushPage();
          y = marginY + (templateId === "modern" ? 26 : 0);
        }
        ctx.fillText(line, marginX, y, usableWidth);
        y += lineHeight;
      }
    }
    y += paragraphGap;
  }
  pushPage();
  return pages;
}

function buildPdfFromJpegs(pages, pageSize = "A4") {
  const pageWidth = pageSize === "LETTER" ? 612 : 595.28;
  const pageHeight = pageSize === "LETTER" ? 792 : 841.89;
  const objectCount = 2 + pages.length * 3;
  const objects = new Array(objectCount + 1);
  const kids = [];

  objects[1] = ascii("<< /Type /Catalog /Pages 2 0 R >>");
  for (let i = 0; i < pages.length; i += 1) {
    const pageObj = 3 + i * 3;
    const imageObj = pageObj + 1;
    const contentObj = pageObj + 2;
    kids.push(`${pageObj} 0 R`);
    const page = pages[i];
    objects[pageObj] = ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${i + 1} ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
    objects[imageObj] = concatBytes([
      ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`),
      page.jpeg,
      ascii("\nendstream"),
    ]);
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i + 1} Do\nQ`;
    objects[contentObj] = ascii(`<< /Length ${ascii(content).length} >>\nstream\n${content}\nendstream`);
  }
  objects[2] = ascii(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`);

  const chunks = [ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = new Array(objectCount + 1).fill(0);
  let position = chunks[0].length;

  for (let i = 1; i <= objectCount; i += 1) {
    offsets[i] = position;
    const prefix = ascii(`${i} 0 obj\n`);
    const suffix = ascii("\nendobj\n");
    chunks.push(prefix, objects[i], suffix);
    position += prefix.length + objects[i].length + suffix.length;
  }

  const xrefOffset = position;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objectCount; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(ascii(xref));
  return concatBytes(chunks);
}

export const browserPdfExporter = Object.freeze({
  async exportPdf({ letter, templateId = "classic", pageSize = "A4" } = {}) {
    if (!String(letter || "").trim()) throw new Error("empty");
    if (typeof Blob === "undefined" || typeof document === "undefined") throw new Error("browser_pdf_unavailable");
    const pages = drawLetterPages({ letter, templateId, pageSize });
    const bytes = buildPdfFromJpegs(pages, pageSize);
    return new Blob([bytes], { type: "application/pdf" });
  },
});
