import { $, el } from './core.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function style(node, values) {
  Object.assign(node.style, values);
  return node;
}

function latestDownload(root) {
  return [...root.querySelectorAll('a[download]')].at(-1) || null;
}

async function bitmapFromLink(link) {
  const response = await fetch(link.href);
  if (!response.ok) throw new Error('Enhanced preview could not be loaded.');
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function drawCanvas(target, source, width, height) {
  target.width = Math.max(1, Math.round(width));
  target.height = Math.max(1, Math.round(height));
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Inspection canvas is unavailable.');
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, target.width, target.height);
}

export function mountInspector(root) {
  const sourceCanvas = root.querySelector('canvas[aria-label="Source image preview"]');
  const downloadsRoot = $('#downloads', root);
  if (!sourceCanvas || !downloadsRoot || $('#enhancer-inspector', root)) return;

  const section = el('section', {
    id: 'enhancer-inspector',
    'aria-label': 'Before and after inspection',
    hidden: true
  });
  section.append(el('h2', { text: 'Inspect before / after' }));
  section.append(el('p', {
    class: 'status',
    text: 'Drag the image to pan. Use zoom for synchronized inspection. Click a region to compare the same area before and after.'
  }));

  const controls = el('div', { class: 'fields' });
  const splitWrap = el('div', { class: 'field' });
  const splitLabel = el('label', { for: 'enhancer-compare-split', text: 'Before / after split' });
  const split = el('input', {
    id: 'enhancer-compare-split', type: 'range', min: '0', max: '100', step: '1', value: '50'
  });
  splitWrap.append(splitLabel, split, el('small', { text: '0% shows the original; 100% shows the enhanced result.' }));

  const zoomWrap = el('div', { class: 'field' });
  const zoomLabel = el('label', { for: 'enhancer-inspect-zoom', text: 'Synchronized zoom' });
  const zoom = el('input', {
    id: 'enhancer-inspect-zoom', type: 'range', min: '1', max: '4', step: '0.25', value: '1'
  });
  zoomWrap.append(zoomLabel, zoom, el('small', { id: 'enhancer-zoom-value', text: '1×' }));
  controls.append(splitWrap, zoomWrap);
  section.append(controls);

  const viewport = style(el('div', {
    id: 'enhancer-compare-viewport',
    tabindex: '0',
    'aria-label': 'Synchronized before and after image comparison'
  }), {
    position: 'relative', overflow: 'hidden', width: '100%', maxWidth: '1000px',
    margin: '0 auto', borderRadius: '12px', touchAction: 'none', cursor: 'grab',
    background: 'rgba(127,127,127,.12)'
  });
  const stage = style(el('div', { id: 'enhancer-compare-stage' }), {
    position: 'absolute', inset: '0', transformOrigin: '0 0', willChange: 'transform'
  });
  const beforeCanvas = style(el('canvas', { 'aria-label': 'Original inspection preview' }), {
    position: 'absolute', inset: '0', width: '100%', height: '100%'
  });
  const afterCanvas = style(el('canvas', { 'aria-label': 'Enhanced inspection preview' }), {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    clipPath: 'inset(0 50% 0 0)'
  });
  const divider = style(el('div', { 'aria-hidden': 'true' }), {
    position: 'absolute', top: '0', bottom: '0', left: '50%', width: '2px',
    background: 'currentColor', pointerEvents: 'none', opacity: '.85'
  });
  stage.append(beforeCanvas, afterCanvas, divider);
  viewport.append(stage);
  section.append(viewport);

  const viewActions = el('div', { class: 'actions' });
  const resetView = el('button', { type: 'button', text: 'Reset view' });
  viewActions.append(resetView);
  section.append(viewActions);

  const regionHeading = el('h3', { text: 'Region preview' });
  const regionInfo = el('p', { class: 'status', id: 'enhancer-region-info', text: 'Click the comparison image to inspect a matching region.' });
  const regionGrid = style(el('div', { id: 'enhancer-region-grid' }), {
    display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px'
  });
  const beforeRegionWrap = el('div');
  beforeRegionWrap.append(el('strong', { text: 'Before' }));
  const beforeRegion = style(el('canvas', { id: 'enhancer-region-before', 'aria-label': 'Original selected region' }), {
    display: 'block', width: '100%', marginTop: '6px', borderRadius: '8px', background: 'rgba(127,127,127,.12)'
  });
  beforeRegionWrap.append(beforeRegion);
  const afterRegionWrap = el('div');
  afterRegionWrap.append(el('strong', { text: 'After' }));
  const afterRegion = style(el('canvas', { id: 'enhancer-region-after', 'aria-label': 'Enhanced selected region' }), {
    display: 'block', width: '100%', marginTop: '6px', borderRadius: '8px', background: 'rgba(127,127,127,.12)'
  });
  afterRegionWrap.append(afterRegion);
  regionGrid.append(beforeRegionWrap, afterRegionWrap);
  section.append(regionHeading, regionInfo, regionGrid);

  downloadsRoot.before(section);

  let outputBitmap = null;
  let currentHref = '';
  let zoomLevel = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;

  function updateTransform() {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    $('#enhancer-zoom-value', root).textContent = `${zoomLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}×`;
  }

  function setSplit() {
    const value = clamp(Number(split.value) || 0, 0, 100);
    afterCanvas.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    divider.style.left = `${value}%`;
  }

  function resetViewport() {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    zoom.value = '1';
    split.value = '50';
    updateTransform();
    setSplit();
  }

  function drawRegion(nx = 0.5, ny = 0.5) {
    if (!outputBitmap || !sourceCanvas.width || !sourceCanvas.height) return;
    const normalizedX = clamp(nx, 0, 1);
    const normalizedY = clamp(ny, 0, 1);
    const cropFraction = 0.22;
    const regionW = 260;
    const regionH = 180;

    const draw = (canvas, source, width, height) => {
      canvas.width = regionW;
      canvas.height = regionH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      const cropW = Math.max(1, width * cropFraction);
      const cropH = Math.max(1, cropW * regionH / regionW);
      const sx = clamp(normalizedX * width - cropW / 2, 0, Math.max(0, width - cropW));
      const sy = clamp(normalizedY * height - cropH / 2, 0, Math.max(0, height - cropH));
      ctx.clearRect(0, 0, regionW, regionH);
      ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, regionW, regionH);
    };

    draw(beforeRegion, sourceCanvas, sourceCanvas.width, sourceCanvas.height);
    draw(afterRegion, outputBitmap, outputBitmap.width, outputBitmap.height);
    regionInfo.textContent = `Region centre: ${Math.round(normalizedX * 100)}% × ${Math.round(normalizedY * 100)}% · matched before/after crop.`;
  }

  function inspectAt(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const localX = (clientX - rect.left - panX) / zoomLevel;
    const localY = (clientY - rect.top - panY) / zoomLevel;
    drawRegion(localX / rect.width, localY / rect.height);
  }

  async function refreshFromDownloads() {
    const link = latestDownload(downloadsRoot);
    if (!link) {
      currentHref = '';
      outputBitmap?.close?.();
      outputBitmap = null;
      section.hidden = true;
      return;
    }
    if (link.href === currentHref && outputBitmap) return;
    currentHref = link.href;
    const nextBitmap = await bitmapFromLink(link);
    outputBitmap?.close?.();
    outputBitmap = nextBitmap;

    const maxWidth = 1000;
    const maxHeight = 700;
    const factor = Math.min(1, maxWidth / sourceCanvas.width, maxHeight / sourceCanvas.height);
    const width = Math.max(1, Math.round(sourceCanvas.width * factor));
    const height = Math.max(1, Math.round(sourceCanvas.height * factor));
    drawCanvas(beforeCanvas, sourceCanvas, width, height);
    drawCanvas(afterCanvas, outputBitmap, width, height);
    viewport.style.aspectRatio = `${width} / ${height}`;
    section.hidden = false;
    resetViewport();
    drawRegion(0.5, 0.5);
  }

  split.addEventListener('input', setSplit);
  zoom.addEventListener('input', () => {
    zoomLevel = clamp(Number(zoom.value) || 1, 1, 4);
    updateTransform();
  });
  resetView.addEventListener('click', resetViewport);

  viewport.addEventListener('pointerdown', event => {
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startPanX = panX;
    startPanY = panY;
    viewport.setPointerCapture?.(event.pointerId);
    viewport.style.cursor = 'grabbing';
  });
  viewport.addEventListener('pointermove', event => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    panX = startPanX + dx;
    panY = startPanY + dy;
    updateTransform();
  });
  const finishPointer = event => {
    if (!dragging) return;
    dragging = false;
    viewport.releasePointerCapture?.(event.pointerId);
    viewport.style.cursor = 'grab';
    if (!moved) inspectAt(event.clientX, event.clientY);
  };
  viewport.addEventListener('pointerup', finishPointer);
  viewport.addEventListener('pointercancel', finishPointer);
  viewport.addEventListener('dblclick', resetViewport);

  const observer = new MutationObserver(() => {
    queueMicrotask(() => refreshFromDownloads().catch(error => {
      console.warn('Enhancer inspection preview unavailable.', error);
      section.hidden = true;
    }));
  });
  observer.observe(downloadsRoot, { childList: true, subtree: true });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    outputBitmap?.close?.();
  }, { once: true });
}
