"""Integrated OCR qualification. Requires pymupdf, pillow, and playwright."""
import argparse
from collections import defaultdict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import re
import tempfile
from threading import Thread
from time import monotonic

import fitz
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
LINES = [
    'Quarterly office records and payment summary.',
    'The quick brown fox jumps over the lazy dog.',
    'Invoice total: $4,271.60. Balance due Friday.',
    'Pack my box with five dozen liquor jugs.',
]


def distance(expected, actual):
    row = list(range(len(actual) + 1))
    for index, item in enumerate(expected, 1):
        next_row = [index]
        for offset, token in enumerate(actual, 1):
            next_row.append(min(row[offset] + 1, next_row[-1] + 1,
                                row[offset - 1] + (item != token)))
        row = next_row
    return row[-1]


def fixture(path, index):
    expected = {}
    doc = fitz.open()
    for number in range(1, 8):
        page = doc.new_page()
        text = '\n'.join(LINES[(index + number) % 4:] + LINES[:(index + number) % 4])
        kind = 'digital'
        if number == 1:
            kind = ['clean', 'office', 'degraded', 'rotated', 'skewed', 'mixed'][index % 6]
            image = Image.new('L', (1100, 1400), 255)
            fill = 80 if kind == 'degraded' else 0
            ImageDraw.Draw(image).multiline_text((70, 160), text, font=ImageFont.truetype(FONT, 35),
                                                fill=fill, spacing=16)
            if kind == 'office':
                image = image.resize((550, 700))
            if kind == 'degraded':
                image = image.resize((440, 560)).filter(ImageFilter.GaussianBlur(.65))
            if kind in ('skewed', 'rotated'):
                image = image.rotate(4 if kind == 'skewed' else 180, fillcolor=255)
            stream = BytesIO()
            image.save(stream, format='JPEG', quality=68)
            page.insert_image(page.rect, stream=stream.getvalue())
            if kind == 'mixed':
                page.insert_text((40, 25), 'Document heading')
        elif number == 7:
            kind = 'blank'
        else:
            text = f'Record {index + 1}, page {number}. Café costs €4.50.'
            page.insert_text((60, 100), text, fontname='DejaVu', fontfile=FONT)
        expected[number] = (kind, text)
    doc.save(path, deflate=True)
    doc.close()
    return expected


def qualify(page, origin, directory, count, stress):
    requests = []
    errors = []
    page.on('request', lambda request: requests.append((request.method, request.url)))
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script("""window.ocrLayoutShift = 0;
        if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
            new PerformanceObserver(list => {
                for (const event of list.getEntries()) {
                    if (!event.hadRecentInput) window.ocrLayoutShift += event.value;
                }
            }).observe({type: 'layout-shift', buffered: true});
        }""")
    page.goto(origin + '/documents/scanned-pdf-to-text/')
    page.on('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='Recognize text').wait_for()
    assert page.evaluate("""() => [...document.querySelectorAll('#workspace button, #workspace select, #workspace summary')]
        .every(element => element.getBoundingClientRect().height >= 44)""")
    assert page.get_by_role('textbox', name='Editable recognized text').is_visible()
    page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    assert page.evaluate('window.ocrLayoutShift') <= .1
    file_input = page.locator('input[type=file]')
    text_box = page.locator('#ocr-text')
    run = page.get_by_role('button', name='Recognize text')
    totals = defaultdict(lambda: [0, 0, 0, 0])
    durations = []
    for index in range(count):
        name = f'qualification-{index+1}.pdf'
        path = directory / name
        expected = fixture(path, index)
        file_input.set_input_files(path)
        page.get_by_text('File ready. All pages selected.', exact=True).wait_for(timeout=20000)
        start = monotonic()
        run.click()
        page.get_by_text('Result from: ' + name, exact=False).wait_for(timeout=120000)
        durations.append(monotonic() - start)
        parts = re.split(r'(?:^|\n\n)Page (\d+)\n', text_box.input_value())
        assert list(map(int, parts[1::2])) == list(expected), name
        for number, actual in zip(map(int, parts[1::2]), parts[2::2]):
            category, source = expected[number]
            if category == 'blank':
                assert actual.startswith('[blank:'), (name, actual)
            else:
                if category == 'mixed':
                    source = 'Document heading ' + source
                ref = ' '.join(source.split())
                got = ' '.join(actual.replace('[Additional OCR text — review reading order]', '').split())
                scores = totals[category]
                scores[0] += distance(ref, got)
                scores[1] += len(ref)
                scores[2] += distance(ref.split(), got.split())
                scores[3] += len(ref.split())
    minimum = {'clean': 99, 'office': 97, 'degraded': 90, 'digital': 99.5}
    for category, (char_errors, chars, word_errors, words) in sorted(totals.items()):
        print(f'{category}: CER {100*char_errors/chars:.2f}% ({char_errors}/{chars}), '
              f'WER {100*word_errors/words:.2f}% ({word_errors}/{words})')
        assert 100 * (chars - char_errors) / chars >= minimum.get(category, 90), category
    print(f'{count} PDFs, {count*7} pages. First run {durations[0]:.2f}s. '
          f'Repeated run range {min(durations[1:] or durations):.2f}–{max(durations[1:] or durations):.2f}s.')
    corrected = text_box.input_value() + '\nReview note: café — €4.50'
    text_box.fill(corrected)
    if page.context.browser.browser_type.name == 'chromium':
        page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        page.get_by_role('button', name='Copy text').click()
        assert page.evaluate('navigator.clipboard.readText()') == corrected
    with page.expect_download() as pending:
        page.get_by_role('button', name='Download TXT').click()
        page.get_by_role('link', name='Download', exact=False).last.click()
    assert Path(pending.value.path()).read_bytes() == corrected.encode('utf-8')
    file_input.set_input_files({'name': 'invalid.pdf', 'mimeType': 'application/pdf', 'buffer': b'not a PDF'})
    page.get_by_text(re.compile('This file appears to be corrupted')).wait_for()
    assert text_box.input_value() == corrected
    data = (directory / 'qualification-1.pdf').read_bytes()
    file_input.set_input_files({'name': 'truncated.pdf', 'mimeType': 'application/pdf',
                                'buffer': data[:data.rfind(b'%%EOF')]})
    page.get_by_text(re.compile('This PDF appears truncated')).wait_for()
    assert text_box.input_value() == corrected
    protected = directory / 'protected.pdf'
    with fitz.open() as doc:
        doc.new_page()
        doc.save(protected, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw='test', owner_pw='owner')
    file_input.set_input_files(protected)
    page.get_by_text(re.compile('This PDF is password-protected')).wait_for()
    assert text_box.input_value() == corrected
    oversize = directory / 'oversized-image.pdf'
    with fitz.open() as doc:
        doc.new_page().insert_text((50, 50), 'Page before oversized image')
        image_page = doc.new_page()
        stream = BytesIO()
        Image.new('L', (6000, 6000), 255).save(stream, format='JPEG')
        image_page.insert_image(image_page.rect, stream=stream.getvalue())
        doc.new_page().insert_text((50, 50), 'Page after oversized image')
        doc.save(oversize)
    file_input.set_input_files(oversize)
    page.get_by_text('File ready. All pages selected.', exact=True).wait_for()
    run.click()
    page.get_by_text('Result from: oversized-image.pdf', exact=False).wait_for(timeout=20000)
    result = text_box.input_value()
    assert 'Page after oversized image' in result
    assert 'Image exceeded maximum allowed size' in result, result
    page.get_by_role('button', name='Retry failed pages').click()
    page.get_by_text('Recognition finished with warnings.').wait_for(timeout=20000)
    assert text_box.input_value() == result
    columns = directory / 'two-columns.pdf'
    with fitz.open() as doc:
        image = Image.new('L', (1300, 1500), 255)
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(FONT, 34)
        for x, heading in ((45, 'Left'), (740, 'Right')):
            for number, line in enumerate(('project notes', 'invoice records', 'payment details', 'office schedule')):
                draw.text((x, 160 + number * 62), f'{heading} {line}', fill=0, font=font)
        stream = BytesIO()
        image.save(stream, format='PNG')
        sheet = doc.new_page()
        sheet.insert_image(sheet.rect, stream=stream.getvalue())
        doc.save(columns, deflate=True)
    file_input.set_input_files(columns)
    page.get_by_text('File ready. All pages selected.', exact=True).wait_for()
    run.click()
    page.get_by_text('Result from: two-columns.pdf', exact=False).wait_for(timeout=30000)
    result = text_box.input_value()
    assert 'Left office schedule' in result and 'Right project notes' in result, result
    assert result.index('Left office schedule') < result.index('Right project notes'), result
    benchmark = directory / 'ten-scans.pdf'
    with fitz.open() as doc, fitz.open(directory / 'qualification-1.pdf') as source:
        for _ in range(10):
            doc.insert_pdf(source, from_page=0, to_page=0)
        doc.save(benchmark, garbage=4, deflate=True)
    file_input.set_input_files(benchmark)
    page.get_by_text('File ready. All pages selected.', exact=True).wait_for()
    start = monotonic()
    run.click()
    page.get_by_text('Result from: ten-scans.pdf', exact=False).wait_for(timeout=120000)
    duration = monotonic() - start
    assert text_box.input_value().count(LINES[0]) == 10
    page.evaluate("""() => {
        const progress = document.querySelector('progress');
        const cancel = [...document.querySelectorAll('button')].find(button => button.textContent === 'Cancel');
        const observer = new MutationObserver(() => {
            if (progress.value === 10 && !cancel.disabled) {
                observer.disconnect();
                window.ocrCancelStart = performance.now();
                cancel.click();
            }
        });
        observer.observe(progress, {attributes: true, attributeFilter: ['value']});
    }""")
    run.click()
    page.get_by_text('Cancelled. Previous results have been kept.', exact=True).wait_for(timeout=10000)
    assert text_box.input_value().count(LINES[0]) == 10
    page.get_by_role('textbox', name='Recovered recognition output').wait_for()
    cancelled = page.evaluate('(performance.now() - window.ocrCancelStart) / 1000')
    print(f'Ten scanned pages: {duration:.2f}s. Cancellation acknowledgement: {cancelled:.2f}s.')
    if stress:
        limit = 10 if page.viewport_size['width'] <= 700 else 30
        stress_pdf = directory / 'raster-stress.pdf'
        with fitz.open() as doc, fitz.open(directory / 'qualification-1.pdf') as source:
            for _ in range(limit):
                doc.insert_pdf(source, from_page=0, to_page=0)
            doc.save(stress_pdf, garbage=4, deflate=True)
        file_input.set_input_files(stress_pdf)
        page.get_by_text('File ready. All pages selected.', exact=True).wait_for()
        timings = []
        for _ in range(3):
            text_box.fill('')
            start = monotonic()
            run.click()
            page.get_by_text(re.compile(f'Processed {limit} of {limit} selected pages')).wait_for(timeout=120000)
            assert text_box.input_value().count(LINES[0]) == limit
            timings.append(round(monotonic() - start, 2))
        print(f'Raster stress: {limit} pages per run, 3 runs, times {timings}s, no pages lost.')
        file_input.set_input_files(benchmark)
        page.get_by_text('File ready. All pages selected.', exact=True).wait_for()
        run.click()
        page.get_by_text('Result from: ten-scans.pdf', exact=False).wait_for(timeout=120000)
    def deny_model(route):
        if route.request.method == 'HEAD':
            route.continue_()
        else:
            route.abort()
    page.route('**/eng.traineddata.gz', deny_model)
    run.click()
    page.get_by_text(re.compile('OCR worker failed')).wait_for(timeout=20000)
    assert text_box.input_value().count(LINES[0]) == 10
    page.unroute('**/eng.traineddata.gz', deny_model)
    assert all(method in ('GET', 'HEAD') and url.startswith(origin + '/') for method, url in requests), requests
    assert not errors, errors
    assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
    print(f'Passed UTF-8 export, bad header, password rejection, oversized image reporting, '
          f'page order, viewport width and same-origin read-only network checks ({len(requests)} requests).')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--executable')
    parser.add_argument('--browser', choices=['chromium', 'firefox', 'webkit'], default='chromium')
    parser.add_argument('--mobile', action='store_true')
    parser.add_argument('--count', type=int, default=30)
    parser.add_argument('--stress', action='store_true')
    args = parser.parse_args()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *params, **kwargs):
            super().__init__(*params, directory=ROOT, **kwargs)

        def log_message(self, *_):
            pass

    with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server, tempfile.TemporaryDirectory() as temp:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as pw:
                browser = getattr(pw, args.browser).launch(executable_path=args.executable)
                viewport = {'width': 360, 'height': 800} if args.mobile else {'width': 1280, 'height': 900}
                qualify(browser.new_page(viewport=viewport, accept_downloads=True),
                        f'http://127.0.0.1:{server.server_port}', Path(temp), args.count, args.stress)
        finally:
            server.shutdown()


if __name__ == '__main__':
    main()
