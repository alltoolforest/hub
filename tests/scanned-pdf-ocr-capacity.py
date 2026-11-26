"""Standalone, browser-local capacity test using original, ground-truthed PDFs."""
import argparse
import importlib.util
from io import BytesIO
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from threading import Thread
from time import monotonic

import fitz
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location(
    'ocr_browser', Path(__file__).with_name('scanned-pdf-ocr-browser.py'))
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


def build(path, pages, narrow):
    """Interleave unique scans and text pages. Use uncompressed large raster streams."""
    large = {1, pages // 2} if narrow else {1, 121, 251, 381}
    reference = {}
    with fitz.open() as doc:
        for number in range(1, pages + 1):
            page = doc.new_page(width=612 if number % 3 else 650, height=792)
            line = f'Record {number:04d}: inspection completed.'
            reference[number] = line
            if number in large or number % 10 == 0:
                dims = (3135, 2770) if number in large else (380, 490)
                image = Image.new('RGB', dims, 'white')
                font = ImageFont.truetype(qa.FONT, int(dims[0] / 23))
                ImageDraw.Draw(image).text((dims[0] // 12, dims[1] // 5), line, fill='black', font=font)
                if number in large:
                    raster = fitz.Pixmap(fitz.csRGB, *dims, image.tobytes(), False)
                    page.insert_image(page.rect, pixmap=raster)
                else:
                    stream = BytesIO()
                    image.save(stream, 'JPEG', quality=82)
                    page.insert_image(page.rect, stream=stream.getvalue())
            else:
                page.insert_text((60, 100), line)
        doc.save(path, deflate=False)
    return reference


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mobile', action='store_true')
    parser.add_argument('--executable')
    parser.add_argument('--runs', type=int, default=2)
    args = parser.parse_args()
    width = 360 if args.mobile else 1280
    count = 100 if args.mobile else 500

    class Handler(qa.SimpleHTTPRequestHandler):
        def __init__(self, *params, **kwargs):
            super().__init__(*params, directory=qa.ROOT, **kwargs)

        def log_message(self, *_):
            pass

    with TemporaryDirectory() as temp, qa.ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        path = Path(temp) / 'capacity.pdf'
        reference = build(path, count, args.mobile)
        print(f'{path.stat().st_size / 2**20:.2f} MiB, {count} pages')
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=args.executable)
            page = browser.new_page(viewport={'width': width, 'height': 900})
            page.on('dialog', lambda dialog: dialog.accept())
            if args.mobile:
                print('Experimental mobile budgets in a desktop browser. Shipping budgets are unchanged.')
                def experimental_budget(route):
                    response = route.fetch()
                    source = response.text()
                    assert 'fileMB:mobile?15:100,pages:mobile?10:500' in source
                    route.fulfill(response=response, body=source.replace(
                        'fileMB:mobile?15:100,pages:mobile?10:500',
                        'fileMB:mobile?50:100,pages:mobile?100:500'))
                page.route('**/scanned-pdf-ocr-performance.js', experimental_budget)
            page.goto(f'http://127.0.0.1:{server.server_port}/documents/scanned-pdf-to-text/')
            page.locator('input[type=file]').set_input_files(path)
            page.get_by_text('File ready. All pages selected.', exact=True).wait_for(timeout=30000)
            box = page.locator('#ocr-text')
            for job in range(args.runs):
                box.fill('')
                start = monotonic()
                page.get_by_role('button', name='Recognize text').click()
                page.get_by_text(re.compile(f'Processed {count} of {count} selected pages')).wait_for(timeout=300000)
                parts = re.split(r'(?:^|\n\n)Page (\d+)\n', box.input_value())
                assert list(map(int, parts[1::2])) == list(reference)
                actual = [part.strip() for part in parts[2::2]]
                total = sum(len(line) for line in reference.values())
                errors = sum(qa.distance(expected, got) for expected, got in zip(reference.values(), actual))
                assert errors / total <= .01, errors
                print(f'Run {job + 1}: {monotonic() - start:.2f}s, CER {100 * errors / total:.2f}%, '
                      f'{len(actual)} pages in order, no omissions.')
        server.shutdown()


if __name__ == '__main__':
    main()
