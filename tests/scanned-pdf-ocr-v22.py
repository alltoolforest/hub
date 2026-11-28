"""Score the supplied advanced corpus and optionally run it through the browser."""
import argparse
from pathlib import Path
import re
import runpy
from time import monotonic

base = runpy.run_path(str(Path(__file__).with_name('scanned-pdf-ocr-remediation.py')))
split_pages, measure, serve = (base[key] for key in ('split_pages', 'measure', 'serve'))
row = re.compile(r'^[A-Z]{2}-\d{3,6}\b')


def score(reference, output):
    expected, actual = split_pages(reference), split_pages(output)
    totals = dict(rows=0, formatted=0, exact=0, quantity=0, rupee_expected=0, rupee_matched=0)
    field_totals = dict(identifier=0, amount=0, adjustment=0, sign_expected=0, sign_matched=0, exponent_expected=0, exponent_matched=0, empty_expected=0, empty_matched=0)
    print('Page | CER | WER | Exact rows | Formatted rows | Quantity matches')
    for number, target in expected.items():
        got = actual.get(number, '')
        expected_rows = [line.split('\t') for line in target.splitlines() if row.search(line)]
        actual_rows = [line.split('\t') for line in got.splitlines()
                       if row.search(line) and len(line.split('\t')) == 5]
        indexed = {}
        for cells in actual_rows:
            indexed.setdefault(cells[0], []).append(cells)
        exact = quantity = rupees = 0
        for cells in expected_rows:
            found = indexed.get(cells[0], [])
            match = found[0] if len(found) == 1 else None
            exact += match == cells
            quantity += bool(match and match[2] == cells[2])
            rupees += bool(match and '₹' in cells[3] and match[3] == cells[3])
            field_totals['identifier'] += bool(match)
            field_totals['amount'] += bool(match and match[3] == cells[3])
            field_totals['adjustment'] += bool(match and match[4] == cells[4])
            for index in (2, 3, 4):
                value = cells[index]
                candidate = match[index] if match else None
                if value.startswith(('-', '+', '(')):
                    field_totals['sign_expected'] += 1
                    field_totals['sign_matched'] += bool(candidate and candidate.startswith(value[0]))
                if re.search(r'(?i)e[+−-]?\d+$',value):
                    field_totals['exponent_expected'] += 1
                    field_totals['exponent_matched'] += candidate == value
                if not value:
                    field_totals['empty_expected'] += 1
                    field_totals['empty_matched'] += candidate == value
        totals['rows'] += len(expected_rows)
        totals['formatted'] += len(actual_rows)
        totals['exact'] += exact
        totals['quantity'] += quantity
        totals['rupee_expected'] += target.count('₹')
        totals['rupee_matched'] += rupees
        cer, wer = measure(target, got)
        print(f'{number:2} | {cer:.2%} | {wer:.2%} | {exact}/{len(expected_rows)} | {len(actual_rows)} | {quantity}')
    # Sum edit distances across pages, weighted by reference characters and words.
    normalized = lambda value: ' '.join(value.split())
    distance = base['qa']['distance']
    errors = []
    for number, target in expected.items():
        a, b = normalized(target), normalized(actual.get(number, ''))
        errors.append((distance(a, b), len(a), distance(a.split(), b.split()), len(a.split())))
    c, cl, w, wl = map(sum, zip(*errors))
    print('Unique-ID field scores:',field_totals)
    print(f'Rupee glyphs in exported text: {output.count(chr(0x20b9))}')
    print(f'Pages: {len(actual)}/{len(expected)}. Character accuracy: {1-c/cl:.2%}. Word accuracy: {1-w/wl:.2%}. {totals}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('fixture', type=Path)
    parser.add_argument('--executable')
    parser.add_argument('--browser', choices=['chromium','firefox','webkit'], default='chromium')
    parser.add_argument('--existing', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    reference = (args.fixture/'complex_scanned_ocr_24_reference.txt').read_text()
    if args.existing:
        output = args.existing.read_text()
    else:
        with serve() as origin, base['sync_playwright']() as pw:
            browser = getattr(pw,args.browser).launch(executable_path=args.executable)
            page = browser.new_page()
            page.goto(origin+'/documents/scanned-pdf-to-text/')
            source = args.fixture/'complex_scanned_ocr_test_24_pages.pdf'
            page.locator('input[type=file]').set_input_files(source)
            start = monotonic()
            page.get_by_role('button',name='Recognize text').click(timeout=30000)
            page.get_by_text('Result from: '+source.name,exact=False).wait_for(timeout=250000)
            output = page.locator('#ocr-text').input_value()
            print(f'Browser runtime {monotonic()-start:.2f}s')
    if args.output:
        args.output.write_text(output)
    score(reference,output)


if __name__ == '__main__':
    main()
