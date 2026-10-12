// Task 5 — browser-level Organize PDF Pages regression.
// Run against an inert local static server from CI:
//   PDF_ORGANIZER_BASE_URL=http://127.0.0.1:8765/ node tests/pdf-organizer-task5.browser.mjs
// Requires playwright; does not deploy or modify the site.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium, firefox, webkit} from 'playwright';
import axe from 'axe-core';

const require = createRequire(import.meta.url);
const PDF = require('../assets/vendor/pdf-lib.js');
const root = process.env.PDF_ORGANIZER_BASE_URL || 'http://127.0.0.1:8765/';
const report = [];
async function fixture() {
  const document = await PDF.PDFDocument.create({updateMetadata: false});
  for (let i = 0; i < 4; i++) {
    const page = document.addPage([350 + 40 * i, 520 + i * 12]);
    page.drawText('ORIGINAL-PAGE-' + (i + 1), {x: 30, y: 300, size: 17});
  }
  document.setTitle('Task 5 browser fixture');
  // Real /Names + /AF attachment structures reproduce the reported
  // production page-removal bug in a full browser UI workflow.
  await document.attach(new Uint8Array([5, 8, 13, 21]), 'browser-attachment.xml', {
    mimeType: 'application/xml', description: 'Attached fixture'
  });
  const bytes = await document.save();
  return {name: 'organizer-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes)};
}
const file = await fixture();
async function taggedFixture() {
  const document=await PDF.PDFDocument.create({updateMetadata:false});
  for(let i=0;i<3;i++) document.addPage([300+35*i,440]).drawText('TAGGED PAGE '+i);
  document.setTitle('Tagged browser test');
  await document.attach(Uint8Array.from([7,8,9]),'preserve.xml',{mimeType:'application/xml'});
  const C=document.context,N=PDF.PDFName.of;
  const root=C.obj({Type:'StructTreeRoot'}),rootRef=C.register(root),kids=[],nums=[];
  for(let i=0;i<3;i++){
    const elem=C.obj({Type:'StructElem',S:'P',Pg:document.getPage(i).ref,K:0});
    const ref=C.register(elem);kids.push(ref);nums.push(i,C.obj([ref]));
    document.getPage(i).node.set(N('StructParents'),PDF.PDFNumber.of(i));
  }
  // Mixed-page structure requires a deliberate untagged output, not a
  // silent deletion of PDF accessibility relationships.
  const wrapper=C.obj({Type:'StructElem',S:'Sect',P:rootRef,K:C.obj(kids)});
  const wrapperRef=C.register(wrapper);
  for(const kid of kids) C.lookup(kid).set(N('P'),wrapperRef);
  root.set(N('K'),wrapperRef);
  root.set(N('ParentTree'),C.register(C.obj({Nums:nums})));
  document.catalog.set(N('StructTreeRoot'),rootRef);
  document.catalog.set(N('MarkInfo'),C.obj({Marked:true}));
  const bytes=await document.save();
  return {name:'tagged-organizer-fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)};
}
const taggedFile=await taggedFixture();
async function bookmarkFixture(named=false){
  const pdf=await PDF.PDFDocument.create({updateMetadata:false});
  for(let i=0;i<3;i++)pdf.addPage([300+40*i,440]).drawText('BOOKMARK PAGE '+i);
  pdf.setTitle(named?'Complex bookmarked fixture':'Bookmark browser fixture');
  await pdf.attach(Uint8Array.from([3,1,4]),'kept.xml',{mimeType:'application/xml'});
  const C=pdf.context,N=PDF.PDFName.of;
  const outline=C.obj({Type:'Outlines'}),outlineRef=C.register(outline);
  const refs=[];
  for(let i=0;i<3;i++){
    const destination=named&&i===0?N('complexNamedDestination'):
      C.obj([pdf.getPage(i).ref,N('Fit')]);
    refs.push(C.register(C.obj({Title:PDF.PDFString.of('Bookmark '+i),
      Parent:outlineRef,Dest:destination})));
  }
  for(let i=0;i<3;i++){
    const dict=C.lookup(refs[i]);
    if(i)dict.set(N('Prev'),refs[i-1]);
    if(i!==2)dict.set(N('Next'),refs[i+1]);
  }
  outline.set(N('First'),refs[0]);
  outline.set(N('Last'),refs[2]);
  outline.set(N('Count'),PDF.PDFNumber.of(3));
  pdf.catalog.set(N('Outlines'),outlineRef);
  pdf.catalog.set(N('PageMode'),N('UseOutlines'));
  const bytes=await pdf.save();
  return {name:named?'named-bookmarks.pdf':'bookmarked-fixture.pdf',
    mimeType:'application/pdf',buffer:Buffer.from(bytes)};
}
const bookmarkFile=await bookmarkFixture();
const namedBookmarkFile=await bookmarkFixture(true);

async function run(engineName, engine, viewport) {
  const browser = await engine.launch({headless: true});
  const context = await browser.newContext({
    viewport, acceptDownloads: true, hasTouch: viewport.width <= 400,
    isMobile: engineName === 'chromium' && viewport.width <= 400
  });
  const page = await context.newPage();
  const errors = [], external = [], requests = [], consoleMessages = [], failedRequests = [];
  page.on('console', msg => { if (['warning', 'error'].includes(msg.type())) consoleMessages.push(msg.text()); });
  page.on('requestfailed', req => failedRequests.push({url:req.url(),failure:req.failure()}));
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => {
    const reqUrl = req.url();
    if (!reqUrl.startsWith('blob:') &&
        new URL(reqUrl).origin !== new URL(root).origin) external.push(reqUrl);
    requests.push({url: reqUrl, method: req.method(),
      body: req.postData()});
  });
  const name = engineName + '-' + viewport.width;
  const trace = {browser: name};
  try {
    await page.goto(new URL('documents/pdf-organizer/', root).href, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.locator('.pdf-organizer-grid').waitFor({state: 'attached', timeout: 15000});
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.waitForFunction(() =>
      document.querySelectorAll('.pdf-organizer-grid > li').length === 4, {timeout: 30000});
    trace.upload = 'PASS';
    const preview = page.locator('.pdf-page-preview canvas');
    await preview.first().waitFor({state: 'attached', timeout: 12000});
    const previewGeometry = await preview.first().evaluate(c => ({
      width:c.width,height:c.height,cssWidth:getComputedStyle(c).width,
      cssHeight:getComputedStyle(c).height
    }));
    assert.ok(previewGeometry.width > 0 && previewGeometry.height > 0,
      'PDF thumbnail had no rasterized pixels');
    trace.pdfjsThumbnail = 'PASS';

    // Automated WCAG A/AA scan of this tool only — not the unrelated site shell.
    await page.addScriptTag({content: axe.source});
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document.querySelector('#workspace'), {
        runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}
      });
      return result.violations.map(item => ({
        id: item.id, impact: item.impact,
        nodes: item.nodes.slice(0, 3).map(node => ({
          target: node.target, summary: node.failureSummary
        }))
      }));
    });
    assert.deepEqual(violations, [], 'Organizer accessibility scanner violations: ' +
      JSON.stringify(violations));
    trace.wcagWorkspace = 'PASS';

    // All four original pages must begin in original order.
    const keys = () => page.locator('.pdf-organizer-grid > li')
      .evaluateAll(nodes => nodes.map(n => Number(n.dataset.pageKey)));
    assert.deepEqual(await keys(), [0,1,2,3]);

    // Keyboard operability: page-grip remains available alongside move buttons.
    const moveLater = page.getByRole('button', {name:'Move original page 1 later'});
    await moveLater.focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await keys(), [1,0,2,3]);
    const keyFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    assert.ok(keyFocus === 'Move original page 1 later' || keyFocus ===
      'Drag original page 1 to a new position', 'Focus disappeared after keyboard reorder');
    trace.keyboardMove = 'PASS';

    // Direct move-to-position and page-action state are authoritative, not DOM-dependent.
    const sourcePageFour = page.locator('.pdf-page-card[data-page-key="3"]');
    await sourcePageFour.locator('summary').click();
    await sourcePageFour.locator('input[type=number]').fill('1');
    await sourcePageFour.getByRole('button', {name:'Move original page 4 to entered position'}).click();
    assert.deepEqual(await keys(), [3,1,0,2]);
    trace.moveToPosition = 'PASS';

    await page.getByRole('button', {name:'Rotate original page 1 clockwise 90 degrees'}).click();
    await page.getByRole('button', {name:'Remove original page 3'}).click();
    assert.match(await page.locator('.pdf-page-card[data-page-key="2"] .pdf-page-caption').innerText(),
      /Removed/);

    await page.getByRole('button', {name:'Save the current organized PDF'}).click();
    const link = page.locator('#downloads a[download]');
    await link.waitFor({timeout: 30000});
    const downloading = page.waitForEvent('download', {timeout: 15000});
    await link.click();
    const download = await downloading;
    const readable = await download.createReadStream();
    const chunks = [];
    for await (const part of readable) chunks.push(part);
    const organized = await PDF.PDFDocument.load(Buffer.concat(chunks), {updateMetadata:false});
    assert.equal(organized.getPageCount(), 3);
    // Page order now original #4, #2, #1 (original #3 removed).
    assert.deepEqual(organized.getPages().map(p => p.getWidth()), [470,390,350]);
    assert.deepEqual(organized.getPages().map(p => p.getRotation().angle), [0,0,90]);
    assert.equal(organized.getTitle(), 'Task 5 browser fixture');
    assert.ok(organized.catalog.get(PDF.PDFName.of('Names')),
      'Attached file name tree disappeared after page removal');
    assert.ok(organized.catalog.get(PDF.PDFName.of('AF')),
      'Document-associated attachment disappeared after page removal');
    trace.export = 'PASS';

    // Any subsequent change must invalidate the previously downloaded result.
    await page.getByRole('button', {name:'Rotate original page 2 clockwise 90 degrees'}).click();
    assert.equal(await page.locator('#downloads a[download]').count(), 0);
    trace.staleOutput = 'PASS';

    const broken = {name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('bad source')};
    await page.locator('input[type="file"]').setInputFiles(broken);
    await page.waitForFunction(() =>
      (document.querySelector('#status')?.textContent || '').includes('valid PDF header'),
      {timeout: 15000});
    assert.equal(await page.locator('.pdf-page-card').count(), 4,
      'Failed replacement discarded the previous valid document');
    trace.failedReplacement = 'PASS';

    // Task 5 post-audit: final-page removal is prevented before export.
    await page.getByRole('button', {name:'Remove original page 2'}).click();
    await page.getByRole('button', {name:'Remove original page 4'}).click();
    assert.equal(await page.getByRole('button', {name:'Remove original page 1'}).isDisabled(), true);
    assert.match(await page.locator('.pdf-organizer-announcement').innerText(),
      /At least one page must remain/);
    await page.getByRole('button', {name:'Restore original page 3'}).click();
    assert.equal(await page.getByRole('button', {name:'Remove original page 1'}).isEnabled(), true);
    trace.lastPageGuard = 'PASS';

    // Simulate BFCache PageTransitionEvent lifecycle in all browser engines.
    // This confirms the event handlers; real browser cache eligibility remains
    // browser/platform-dependent and needs physical-device verification.
    await page.getByRole('button', {name:'Save the current organized PDF'}).click();
    await page.locator('#downloads a[download]').waitFor({timeout: 30000});
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
      window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });
    assert.equal(await page.locator('#downloads a[download]').count(), 0,
      'Returned BFCache tab retained revoked download link');
    assert.match(await page.locator('#status').innerText(), /Page restored.*PDF edits are intact/);
    await page.getByRole('button', {name:'Rotate original page 1 clockwise 90 degrees'}).click();
    assert.match(await page.locator('#status').innerText(), /Arrangement updated/);
    trace.bfcacheLifecycle = 'PASS';

    // Tagged document with shared structure tree: fail safely until the user
    // opts in, then remove the selected page without broken structure tags.
    await page.locator('input[type="file"]').setInputFiles(taggedFile);
    await page.waitForFunction(() =>
      document.querySelectorAll('.pdf-organizer-grid > li').length === 3 &&
      (document.querySelector('.pdf-organizer-current')?.textContent||'').includes('tagged-organizer-fixture.pdf'),{timeout:30000});
    const tagChoice=page.getByRole('checkbox',{
      name:/Allow removing accessibility tags if they cannot be preserved/
    });
    assert.equal(await tagChoice.isVisible(),false);
    await page.getByRole('button',{name:'Remove original page 2'}).click();
    assert.equal(await tagChoice.isVisible(),true);
    assert.equal(await tagChoice.isChecked(),false,'Fallback consent was preselected');
    await page.getByRole('button',{name:'Save the current organized PDF'}).click();
    await page.waitForFunction(() =>
      (document.querySelector('#status')?.textContent||'').includes('accessibility tags'),{timeout:30000});
    assert.equal(await page.locator('#downloads a[download]').count(),0);
    trace.taggedDefaultProtection='PASS';
    await tagChoice.check();
    await page.getByRole('button',{name:'Save the current organized PDF'}).click();
    const taggedLink=page.locator('#downloads a[download]');
    await taggedLink.waitFor({timeout:30000});
    const taggedDownloadPending=page.waitForEvent('download',{timeout:15000});
    await taggedLink.click();
    const taggedDownload=await taggedDownloadPending;
    const stream=await taggedDownload.createReadStream();
    const taggedChunks=[];
    for await(const part of stream)taggedChunks.push(part);
    const taggedResult=await PDF.PDFDocument.load(Buffer.concat(taggedChunks),{updateMetadata:false});
    assert.equal(taggedResult.getPageCount(),2);
    assert.deepEqual(taggedResult.getPages().map(p=>p.getWidth()),[300,370]);
    assert.equal(taggedResult.getTitle(),'Tagged browser test');
    assert.equal(taggedResult.catalog.get(PDF.PDFName.of('StructTreeRoot')),undefined);
    assert.equal(taggedResult.catalog.get(PDF.PDFName.of('MarkInfo')),undefined);
    assert.ok(taggedResult.catalog.get(PDF.PDFName.of('AF')));
    assert.match(await page.locator('#status').innerText(),/Accessibility tagging was removed with your permission/);
    trace.taggedOptInExport='PASS';

    // Real browser bookmark regression: ordinary /Outlines must not block
    // page deletion, and surviving bookmark destinations stay valid.
    await page.locator('input[type="file"]').setInputFiles(bookmarkFile);
    await page.waitForFunction(() =>
      (document.querySelector('.pdf-organizer-current')?.textContent||'').includes('bookmarked-fixture.pdf'),{timeout:30000});
    await page.getByRole('button',{name:'Remove original page 2'}).click();
    const bookmarkConsent=page.getByRole('checkbox',{
      name:/Allow removing unsupported bookmarks if they cannot be repaired/
    });
    assert.equal(await bookmarkConsent.isVisible(),true);
    assert.equal(await bookmarkConsent.isChecked(),false);
    await page.getByRole('button',{name:'Save the current organized PDF'}).click();
    const bookmarksLink=page.locator('#downloads a[download]');
    await bookmarksLink.waitFor({timeout:30000});
    const downloadPromise=page.waitForEvent('download',{timeout:15000});
    await bookmarksLink.click();
    const bookmarkDownload=await downloadPromise;
    const br=await bookmarkDownload.createReadStream(),bc=[];
    for await(const part of br)bc.push(part);
    const opened=await PDF.PDFDocument.load(Buffer.concat(bc),{updateMetadata:false});
    assert.equal(opened.getPageCount(),2);
    assert.ok(opened.catalog.get(PDF.PDFName.of('Outlines')),
      'Kept-page bookmarks were unexpectedly discarded');
    assert.ok(opened.catalog.get(PDF.PDFName.of('AF')),'Attachment unexpectedly removed');
    const r=opened.context.lookup(opened.catalog.get(PDF.PDFName.of('Outlines')));
    let cursor=r.get(PDF.PDFName.of('First')),titles=[];
    const pages=new Set(opened.getPages().map(p=>String(p.ref)));
    while(cursor){
      const node=opened.context.lookup(cursor);
      titles.push(node.get(PDF.PDFName.of('Title')).decodeText());
      const dest=opened.context.lookup(node.get(PDF.PDFName.of('Dest')));
      assert.ok(pages.has(String(dest.get(0))), 'Bookmark points to deleted page');
      cursor=node.get(PDF.PDFName.of('Next'));
    }
    assert.deepEqual(titles,['Bookmark 0','Bookmark 2']);
    assert.match(await page.locator('#status').innerText(),/bookmark\(s\) pointing to removed pages were removed/);
    trace.bookmarkRepair='PASS';

    // Unresolved named destinations do NOT silently discard bookmarks.
    await page.locator('input[type="file"]').setInputFiles(namedBookmarkFile);
    await page.waitForFunction(() =>
      (document.querySelector('.pdf-organizer-current')?.textContent||'').includes('named-bookmarks.pdf'),{timeout:30000});
    await page.getByRole('button',{name:'Remove original page 2'}).click();
    assert.equal(await bookmarkConsent.isChecked(),false);
    await page.getByRole('button',{name:'Save the current organized PDF'}).click();
    await page.waitForFunction(() =>
      (document.querySelector('#status')?.textContent||'').includes('Allow removing unsupported bookmarks'),{timeout:30000});
    assert.equal(await page.locator('#downloads a[download]').count(),0);
    await bookmarkConsent.check();
    await page.getByRole('button',{name:'Save the current organized PDF'}).click();
    await page.locator('#downloads a[download]').waitFor({timeout:30000});
    assert.match(await page.locator('#status').innerText(),/Unsupported bookmarks were removed with your permission/);
    trace.bookmarkOptIn='PASS';

            if (viewport.width <= 400) {
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, 'Unexpected narrow-phone horizontal overflow');
      trace.mobileOverflow = 'PASS';
    }

    assert.equal(external.length, 0,
      'Unexpected external network requests: ' + external.join(','));
    const uploads = requests.filter(x => x.method !== 'GET' && x.method !== 'HEAD');
    assert.equal(uploads.length, 0, 'Organizer sent a network request containing document data');
    trace.privacyNetwork = 'PASS';
    assert.deepEqual(errors, [], 'Browser console exceptions occurred');
    trace.pageErrors = 'PASS';
    report.push(trace);
  } catch (error) {
    trace.failure = String(error?.stack || error).slice(0,2400);
    trace.consoleErrors = errors;
    trace.consoleWarnings = consoleMessages.slice(-15);
    trace.failedRequests = failedRequests.slice(-15);
    trace.externalRequests = external;
    try {
      trace.debugUI = await page.evaluate(() => ({
        status:document.querySelector('#status')?.textContent,
        feedback:document.querySelector('.pdf-organizer-announcement')?.textContent,
        previews:[...document.querySelectorAll('.pdf-page-preview')].slice(0,2).map(n=>({
          text:n.textContent,html:n.innerHTML.slice(0,180),
          rect:n.getBoundingClientRect().toJSON()
        })),
        canvases:document.querySelectorAll('.pdf-page-preview canvas').length
      }));
    } catch (ignore) {}
    report.push(trace);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

let failed = false;
for (const [name, browser, viewport] of [
  ['chromium', chromium, {width: 1280, height: 900}],
  ['chromium', chromium, {width: 360, height: 780}],
  ['firefox', firefox, {width: 1280, height: 900}],
  ['webkit', webkit, {width: 390, height: 844}],
  ['webkit', webkit, {width: 1280, height: 900}]
]) {
  try { await run(name, browser, viewport); }
  catch (error) { failed = true; }
}
console.log(JSON.stringify({task:'pdf-organizer-task5-browser',report},null,2));
if (failed) process.exitCode = 1;
