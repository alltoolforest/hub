import { $, el, field, format, status } from './core.js';

const MIME = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
});

function replaceExtension(name, extension) {
  const base = (name || 'enhanced-image').replace(/\.[^.]+$/, '');
  return `${base}.${extension}`;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(`This browser could not encode ${type}.`)), type, quality);
  });
}

async function decodeBlob(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch {}
  }
  const objectURL = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The enhanced result could not be decoded for export.'));
      image.src = objectURL;
    });
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}

async function decodeDownload(link) {
  const response = await fetch(link.href);
  if (!response.ok) throw new Error('The enhanced result could not be read for export.');
  return decodeBlob(await response.blob());
}

export function mountExportControls(root) {
  const downloadsRoot = $('#downloads', root);
  if (!downloadsRoot || $('#enhancer-export-format', root)) return;

  const formatWrap = field('enhancer-export-format', 'Export format', 'select', 'png', {
    options: [['png', 'PNG — lossless / transparency'], ['jpeg', 'JPG — smaller photos'], ['webp', 'WebP — compact / transparency']]
  });
  const qualityWrap = field('enhancer-export-quality', 'Lossy export quality', 'number', '92', {
    min: '1', max: '100', step: '1',
    hint: 'Used only for JPG and WebP. PNG remains lossless.'
  });
  const backgroundWrap = field('enhancer-jpeg-background', 'JPG transparency background', 'color', '#ffffff', {
    hint: 'JPG cannot store transparency. Transparent pixels are flattened onto this colour.'
  });
  const section = el('section', { id: 'enhancer-export-panel', 'aria-label': 'Export processed image', hidden: true });
  section.append(el('h2', { text: 'Export result' }));
  const exportFields = el('div', { class: 'fields' });
  exportFields.append(formatWrap, qualityWrap, backgroundWrap);
  section.append(exportFields);
  const info = el('p', {
    id: 'enhancer-export-info', class: 'status',
    text: 'Process an image first. Export conversion happens locally in your browser.'
  });
  const actions = el('div', { class: 'actions' });
  const exportButton = el('button', { type: 'button', class: 'primary', text: 'Create export copy', disabled: true });
  actions.append(exportButton);
  const exportDownloads = el('div', { id: 'enhancer-export-downloads', class: 'downloads' });
  section.append(info, actions, exportDownloads);
  downloadsRoot.before(section);

  const formatSelect = $('#enhancer-export-format', root);
  const qualityInput = $('#enhancer-export-quality', root);
  const backgroundInput = $('#enhancer-jpeg-background', root);
  const exportURLs = new Set();
  let busy = false;

  function latestCanonicalLink() {
    return [...downloadsRoot.querySelectorAll('a[download]')].at(-1) || null;
  }

  function clearExportRows() {
    for (const url of exportURLs) URL.revokeObjectURL(url);
    exportURLs.clear();
    exportDownloads.replaceChildren();
  }

  function syncControls() {
    const type = formatSelect.value;
    const lossy = type === 'jpeg' || type === 'webp';
    qualityWrap.hidden = !lossy;
    backgroundWrap.hidden = type !== 'jpeg';
    const canonical = latestCanonicalLink();
    section.hidden = !canonical;
    exportButton.disabled = busy || !canonical;
    if (!canonical) {
      info.classList.remove('error');
      info.textContent = 'Process an image first. Export conversion happens locally in your browser.';
      return;
    }
    info.classList.remove('error');
    if (type === 'png') info.textContent = 'PNG export is lossless and preserves transparency when the enhanced result contains alpha.';
    else if (type === 'webp') info.textContent = `WebP export uses ${qualityInput.value}% quality and preserves transparency.`;
    else info.textContent = `JPG export uses ${qualityInput.value}% quality. Transparency will be flattened onto ${backgroundInput.value.toUpperCase()}.`;
  }

  async function createExport() {
    if (busy) return;
    const canonical = latestCanonicalLink();
    if (!canonical) {
      status('Process an image first.', true);
      return;
    }

    const typeKey = formatSelect.value;
    const mime = MIME[typeKey];
    if (!mime) {
      status('Choose a supported export format.', true);
      return;
    }
    const qualityPercent = Math.max(1, Math.min(100, Number(qualityInput.value) || 92));
    qualityInput.value = String(Math.round(qualityPercent));
    const quality = qualityPercent / 100;
    busy = true;
    exportButton.disabled = true;
    info.classList.remove('error');
    info.textContent = `Creating ${typeKey === 'jpeg' ? 'JPG' : typeKey.toUpperCase()} export…`;

    let bitmap = null;
    try {
      bitmap = await decodeDownload(canonical);
      const canvas = el('canvas', { width: bitmap.width, height: bitmap.height });
      const ctx = canvas.getContext('2d', { alpha: typeKey !== 'jpeg' });
      if (!ctx) throw new Error('Export canvas is unavailable in this browser.');
      if (typeKey === 'jpeg') {
        ctx.fillStyle = backgroundInput.value || '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bitmap, 0, 0);
      const blob = await canvasBlob(canvas, mime, typeKey === 'png' ? undefined : quality);
      canvas.width = canvas.height = 0;

      const extension = typeKey === 'jpeg' ? 'jpg' : typeKey;
      const filename = replaceExtension(canonical.download, extension);
      clearExportRows();
      const objectURL = URL.createObjectURL(blob);
      exportURLs.add(objectURL);

      const row = el('div', { class: 'download-row', 'data-enhancer-export': typeKey });
      row.append(
        el('span', { text: `${filename} · ${format(blob.size / 1024)} KB · ${mime}` }),
        el('a', { href: objectURL, download: filename, class: 'button primary', text: 'Download export' }),
        el('a', { href: objectURL, target: '_blank', rel: 'noopener', class: 'button', text: 'Open export' })
      );
      exportDownloads.append(row);
      const transparencyNote = typeKey === 'jpeg' ? ` Transparency flattened onto ${backgroundInput.value.toUpperCase()}.` : '';
      info.textContent = `${extension.toUpperCase()} copy ready · ${bitmap.width.toLocaleString()} × ${bitmap.height.toLocaleString()} px · ${format(blob.size / 1024)} KB.${transparencyNote}`;
      status(`${extension.toUpperCase()} export copy ready.`);
    } catch (error) {
      console.error(error);
      info.classList.add('error');
      info.textContent = error?.message || 'Export conversion failed.';
      status(error?.message || 'Export conversion failed.', true);
    } finally {
      bitmap?.close?.();
      busy = false;
      exportButton.disabled = !latestCanonicalLink();
    }
  }

  exportButton.addEventListener('click', createExport);
  for (const control of [formatSelect, qualityInput, backgroundInput]) {
    const changed = () => {
      clearExportRows();
      syncControls();
    };
    control.addEventListener('input', changed);
    control.addEventListener('change', changed);
  }

  const observer = new MutationObserver(() => {
    clearExportRows();
    syncControls();
  });
  observer.observe(downloadsRoot, { childList: true, subtree: true });

  const resetButton = [...root.querySelectorAll('button')].find(button => button.textContent === 'Reset');
  resetButton?.addEventListener('click', () => {
    formatSelect.value = 'png';
    qualityInput.value = '92';
    backgroundInput.value = '#ffffff';
    clearExportRows();
    syncControls();
  });

  syncControls();
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    clearExportRows();
  }, { once: true });
}
