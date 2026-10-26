import {detectFile} from './file-router.js';
import {readDraft, writeDraft, clearDraft} from './drafts.js';

const root = document.querySelector('#document-v2');
const pick = root.querySelector('#document-v2-file');
const stage = root.querySelector('#document-v2-stage');
const status = root.querySelector('#document-v2-status');
const title = root.querySelector('#document-v2-title');
const recovery = root.querySelector('#document-v2-recovery');
const actions = root.querySelector('#document-v2-actions');
let session = null, timer = null, downloadUrl = null, generation = 0, pendingSave = Promise.resolve(), actionBusy = false;

function say(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function nameForExport(name, format) {
  return name.replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 90) + '-edited.' + format;
}
function controls() {
  for (const button of actions.querySelectorAll('button')) {
    button.disabled = actionBusy || !session || button.dataset.action === 'undo' && session.cursor === 0 ||
      button.dataset.action === 'redo' && session.cursor >= session.history.length - 1;
  }
}
async function persist(allowStorageFailure = false) {
  if (!session) return;
  const current = session, token = generation;
  const snapshot = await current.engine.snapshot();
  if(current !== session || token !== generation)return;
  if(current.engine.asyncSnapshots && snapshot.revision !== current.history[current.cursor]?.revision){
    current.history = current.history.slice(0,current.cursor+1);
    current.history.push(snapshot);
    // Binary scan snapshots are bounded independently of text-engine history.
    const size = value => value instanceof Blob ? value.size : value instanceof Uint8Array ? value.byteLength :
      Array.isArray(value) ? value.reduce((sum,item)=>sum+size(item),0) : value && typeof value==='object' ? Object.values(value).reduce((sum,item)=>sum+size(item),0) : typeof value==='string' ? value.length*2 : 8;
    while(current.history.length>1 && (current.history.length>20 || size(current.history)>64*1024*1024))current.history.shift();
    current.cursor=current.history.length-1;controls();
  }
  const draft = {file:current.file, format:current.format, snapshot,
    history:current.history, cursor:current.cursor, modified:Date.now()};
  pendingSave = pendingSave.catch(() => {}).then(() => token === generation ? writeDraft(draft) : undefined);
  try { await pendingSave; } catch(error) { if(!allowStorageFailure)throw error; return; }
  if (current === session) say('Draft saved on this device. Export to save a document file.');
}
function changed() {
  if (!session) return;
  if(session.engine.asyncSnapshots){
    session.dirty=true;
    say('Unsaved PDF changes. Finish the edit to save a local draft.');
    clearTimeout(timer);timer=setTimeout(()=>persist().catch(error=>say(error.message||'Local autosave failed. Export your work.',true)),700);
    return;
  }
  const next = session.engine.snapshot();
  if (JSON.stringify(next) !== JSON.stringify(session.history[session.cursor])) {
    session.history = session.history.slice(0, session.cursor + 1);
    session.history.push(next);
    if (session.history.length > 20) session.history.shift();
    session.cursor = session.history.length - 1;
    session.dirty = true;
    controls();
    say('Unsaved document changes. Local draft will be saved automatically.');
    clearTimeout(timer);
    timer = setTimeout(() => persist().catch(() => say('Local autosave failed. Export your work now.', true)), 700);
  }
}
async function display() {
  await session.engine.render(stage, changed);
  title.textContent = session.file.name + ' · ' + session.format.toUpperCase();
  actions.hidden = false;
  recovery.hidden = true;
  controls();
}
async function open(file, draft = null) {
  const detected = await detectFile(file);
  if (draft && detected.format !== draft.format) throw new Error('Recovery file type has changed.');
  const module = await import(`./engines/${detected.engine}.js`);
  const engine = await module.open(file, detected.format, draft?.snapshot);
  let initialSnapshot;
  try { if (draft) await engine.restore(draft.snapshot); initialSnapshot=await engine.snapshot(); } catch(error) { await engine.dispose?.(); throw error; }
  // Do not replace a working session until detection and parsing succeed.
  clearTimeout(timer);
  generation++;
  await pendingSave.catch(() => {});
  const previous = session;
  session = {file, format:detected.format, engine, dirty:!!draft,
    history:draft?.history?.length ? draft.history : [initialSnapshot],
    cursor:draft?.cursor ?? 0};
  try { await display(); }
  catch (error) {
    session = previous;
    await engine.dispose?.();
    if (previous) { try { await previous.engine.render(stage, changed); } catch {} }
    throw error;
  }
  try { await previous?.engine.dispose?.(); } catch {}
  say(draft ? 'Recovered local draft. Export to keep a separate file.' : 'File opened. The original is untouched.');
}
pick.addEventListener('change', async () => {
  const file = pick.files?.[0];
  pick.value = '';
  if (!file) return;
  if (session?.dirty && !confirm('Opening another file will replace your current editing session. Export first if needed. Continue?')) return;
  say('Checking and opening file…');
  pick.disabled = true;
  try { await open(file); await clearDraft().catch(() => say('File opened, but an earlier local draft could not be cleared.', true)); }
  catch (error) { say(error.message || 'Could not open this file.', true); }
  finally { pick.disabled = false; }
});
actions.addEventListener('click', async event => {
  const action = event.target.closest('button')?.dataset.action;
  if (!session || !action || actionBusy) return;
  actionBusy=true;controls();pick.disabled=true;stage.inert=true;
  try {
    if (action === 'undo' || action === 'redo') {
      clearTimeout(timer);
      if(session.engine.asyncSnapshots)await persist(true);
      const nextCursor=session.cursor+(action === 'undo' ? -1 : 1);
      if(nextCursor<0||nextCursor>=session.history.length)return;
      await session.engine.restore(session.history[nextCursor]);
      session.cursor=nextCursor;
      session.dirty = true;
      await display();
      await persist();
    } else if (action === 'export') {
      await persist().catch(() => say('Local autosave is unavailable. Preparing your export directly.', true));
      const blob = await session.engine.export();
      if (!(blob instanceof Blob) || (!blob.size && session.format !== 'txt')) throw new Error('Export did not produce a valid file. Your draft is retained.');
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = nameForExport(session.file.name, session.format);
      link.click();
      say('Export prepared. Confirm the download was saved on your device.');
    } else if (action === 'new') {
      if (session.dirty && !confirm('Clear this session and its local draft? Export first if needed.')) return;
      clearTimeout(timer);
      generation++;
      await pendingSave.catch(() => {});
      await clearDraft();
      await session.engine.dispose?.();
      session = null;
      stage.replaceChildren();
      title.textContent = 'No file open';
      controls();
      actions.hidden = true;
      say('Workspace cleared.');
    }
  } catch (error) { say(error.message || 'The action failed; your editing session is retained.', true); }
  finally {actionBusy=false;stage.inert=false;pick.disabled=false;controls();}
});
root.querySelector('#document-v2-restore').addEventListener('click', async () => {
  if(actionBusy)return;
  if(session?.dirty&&!confirm('Restore the saved draft and replace this editing session?'))return;
  actionBusy=true;pick.disabled=true;stage.inert=true;controls();
  try { const draft = await readDraft(); if (draft?.file) await open(draft.file, draft); }
  catch (error) { say(error.message || 'Could not restore the local draft.', true); }
  finally {actionBusy=false;pick.disabled=false;stage.inert=false;controls();}
});
root.querySelector('#document-v2-discard').addEventListener('click', async () => {
  try { await clearDraft(); recovery.hidden = true; say('Local draft discarded.'); }
  catch { say('Could not discard the local draft.', true); }
});
window.addEventListener('beforeunload', event => {
  if (session?.dirty) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); });
readDraft().then(draft => {
  if (draft?.file) {
    recovery.hidden = false;
    root.querySelector('#document-v2-recovery-name').textContent = `${draft.file.name} · ${new Date(draft.modified).toLocaleString()}`;
  }
}).catch(() => say('Local recovery is unavailable in this browser. Export changes before leaving.', true));
