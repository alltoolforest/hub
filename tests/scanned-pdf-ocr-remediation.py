"""Browser regression for V2.1. Pass --fixture-dir to include the manual corpus."""
from argparse import ArgumentParser
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
import re
import runpy
from tempfile import TemporaryDirectory
from threading import Thread
from time import monotonic

import fitz
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

qa = runpy.run_path(str(Path(__file__).with_name('scanned-pdf-ocr-browser.py')))
splitter = re.compile(r'(?:^|\n\n)page (\d+)\n', re.IGNORECASE)


def split_pages(text):
    parts = splitter.split(text.replace('\r\n', '\n'))
    assert not parts[0].strip()
    return dict(zip(map(int, parts[1::2]), (part.strip() for part in parts[2::2])))


def reference_table(text):
    lines = text.splitlines()
    start = lines.index('Code')
    body = lines[start + 4:start + 4 + 48]
    expected = list(zip(*(iter(body),) * 4))
    return expected, '\n'.join(lines[:start] + [' '.join(lines[start:start+4])]
                               + [' '.join(row) for row in expected] + lines[start+52:])


def measure(reference, actual):
    expected = ' '.join(reference.split())
    got = ' '.join(actual.split())
    cer = qa['distance'](expected, got) / len(expected)
    wer = qa['distance'](expected.split(), got.split()) / len(expected.split())
    return cer, wer


def read_fixture(page, path):
    page.locator('input[type=file]').set_input_files(path)
    page.get_by_text('File ready. All pages selected.', exact=True).wait_for(timeout=30000)
    start = monotonic()
    page.get_by_role('button', name='Recognize text').click()
    page.get_by_text('Result from: ' + path.name, exact=False).wait_for(timeout=120000)
    print(f'{path.name}: {monotonic() - start:.2f}s')
    with page.expect_download() as pending:
        page.get_by_role('button', name='Download TXT').click()
        page.get_by_role('link', name='Download', exact=False).last.click()
    output = Path(pending.value.path()).read_bytes()
    assert output == page.locator('#ocr-text').input_value().encode('utf-8')
    return split_pages(output.decode('utf-8'))


def manual(page, directory):
    expected = split_pages((directory / 'ocr_test_reference.txt').read_text())
    actual = read_fixture(page, directory / 'complex_scanned_ocr_test_10_pages.pdf')
    assert list(actual) == list(range(1, 11))
    passed = True
    for i, reference in expected.items():
        if i == 10:
            ok = actual[i].startswith('[blank:')
            print(i, 'PASS' if ok else 'FAIL', 'blank image')
        else:
            rows_ok = True
            if i in (2, 4, 8):
                expected_rows, reference = reference_table(reference)
                got = [tuple(line.split('\t')) for line in actual[i].splitlines() if line.startswith('AX-')]
                qty = sum(len(a) == 4 and a[2] == b[2] for a, b in zip(got, expected_rows))
                rows_ok = got == expected_rows
                print(f'Page {i}: {qty}/12 quantities and {sum(a == b for a,b in zip(got, expected_rows))}/12 complete rows')
            cer, wer = measure(reference, actual[i])
            order_ok = i != 3 or actual[i].index('LEFT:') < actual[i].index('RIGHT:') < actual[i].index('SAMPLE DOCUMENT')
            phrases_ok = i != 8 or (
                actual[i].count('Safety inspection') == 3 and actual[i].count('Calibration kit') == 3
                and 'NORTHBRIDGE' in actual[i])
            ok = rows_ok and order_ok and phrases_ok and cer < .01
            print(f'Page {i}: {"PASS" if ok else "FAIL"}, CER {cer:.2%}, WER {wer:.2%}')
        passed = passed and ok
    assert passed


def independent(path, ruled):
    expected = [
        ('TX-011', 'Bearing housing', '007', '-18.20'),
        ('TX-013', 'Coolant compound', '38', '105.92'),
        ('TX-017', 'Coolant compound', '', '105.92'),
        ('TX-019', 'Adapter mount', '6', '-21.80'),
        ('TX-022', 'Field service', '007', '10.75'),
        ('TX-028', 'Bearing housing', '2', '2.10'),
    ]
    image = Image.new('L', (1200, 1350), 255)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(qa['FONT'], 27)
    small = ImageFont.truetype(qa['FONT'], 22)
    for i, row in enumerate([('Stock ID', 'Item description', 'Count', 'Net amount'), *expected]):
        y = 210 + i * 85
        if ruled:
            draw.line((55,y-20,1150,y-20),fill=80,width=2)
        for column, (x, text) in enumerate(zip((76, 325, 820, 985), row)):
            draw.text((x,y),text,font=small if i and column==2 else font,fill=0)
    if ruled:
        draw.line((55,785,1150,785),fill=80,width=2)
        for x in (55,302,795,960,1150):
            draw.line((x,190,x,785),fill=80,width=2)
    faint = Image.new('L', (1200, 1350), 252)
    ImageDraw.Draw(faint).text((76, 210),'Faint approval text.',font=font,fill=232)
    reduced = image.resize((660, 743), Image.Resampling.LANCZOS)
    with fitz.open() as doc:
        for bitmap in (image, Image.new('L',(1200,1350),252), faint, reduced, image):
            page = doc.new_page(width=600,height=675)
            stream = BytesIO()
            bitmap.save(stream,'PNG')
            page.insert_image(page.rect,stream=stream.getvalue())
            if len(doc) == 5:
                page.insert_text((38,60),'Native approval heading')
        doc.save(path,deflate=True)
    return expected


@contextmanager
def serve():
    class Handler(qa['SimpleHTTPRequestHandler']):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=qa['ROOT'], **kwargs)

        def log_message(self, *_):
            pass

    with qa['ThreadingHTTPServer'](('127.0.0.1',0),Handler) as server:
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            yield f'http://127.0.0.1:{server.server_port}'
        finally:
            server.shutdown()


def main():
    parser=ArgumentParser()
    parser.add_argument('--fixture-dir',type=Path)
    parser.add_argument('--executable')
    parser.add_argument('--viewport',type=int,default=1280)
    args=parser.parse_args()
    with serve() as origin, TemporaryDirectory() as tmp, sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.executable)
        page=browser.new_page(viewport={'width': args.viewport,'height':900})
        page.goto(origin+'/documents/scanned-pdf-to-text/')
        page.on('dialog',lambda dialog: dialog.accept())
        if args.fixture_dir:
            manual(page,args.fixture_dir)
        for ruled in (False,True):
            path=Path(tmp)/f'table-{ruled}.pdf'
            expected=independent(path,ruled)
            actual=read_fixture(page,path)
            rows=[tuple(line.split('\t')) for line in actual[1].splitlines() if line.startswith('TX-')]
            assert rows==expected,(rows,actual)
            assert actual[2].startswith('[blank:'),actual[2]
            assert 'Faint approval text.' in actual[3], actual[3]
            for number in (4, 5):
                rows = [tuple(line.split('\t')) for line in actual[number].splitlines() if line.startswith('TX-')]
                assert rows == expected, (number, rows, actual[number])
            assert actual[5].count('Native approval heading') == 1, actual[5]
            print(f'Independent {"ruled" if ruled else "borderless"} tables passed, including low-resolution and mixed pages')


if __name__=='__main__':
    main()
