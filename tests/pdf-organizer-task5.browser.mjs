// Task 5 — browser-level Organize PDF Pages regression.
// Run against an inert local static server from CI:
//   PDF_ORGANIZER_BASE_URL=http://127.0.0.1:8765/ node tests/pdf-organizer-task5.browser.mjs
// Requires playwright; does not deploy or modify the site.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium, firefox, webkit} from 'playwright';

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
  const bytes = await document.save();
  return {name: 'organizer-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes)};
}
const file = await fixture();

async function run(engineName, engine, viewport) {
  const browser = await engine.launch({headless: true});
  const context = await browser.newContext({
    viewport, acceptDownloads: true, hasTouch: viewport.width <= 400,
    isMobile: engineName === 'chromium' && viewport.width <= 400
  });
  const page = await context.newPage();
  const errors = [], external = [], requests = [];
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
    await preview.first().waitFor({timeout: 30000});
    trace.pdfjsThumbnail = 'PASS';

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
    trace.externalRequests = external;
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
