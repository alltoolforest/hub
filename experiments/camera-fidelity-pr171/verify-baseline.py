#!/usr/bin/env python3
"""Read-only integrity gate. Run before and after every experimental task."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--task0', action='store_true', help='Also require candidate to equal baseline')
args = parser.parse_args()
root = Path(__file__).resolve().parent
repo = Path(subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--show-toplevel'], text=True).strip())
manifest = json.loads((root / 'manifest.json').read_text())
sha = manifest['source_commit']
assert sha == 'a672855f9c4047dafe31cd0823cfeb7de2bb04f7', 'Unexpected source revision'
expected = {entry['path'] for entry in manifest['files']}
assert {str(p.relative_to(root / 'baseline')) for p in (root / 'baseline').rglob('*') if p.is_file()} == expected, 'Baseline file inventory changed'
for entry in manifest['files']:
    name = entry['path']
    original = subprocess.check_output(['git', '-C', str(repo), 'show', f'{sha}:{name}'])
    copied = (root / 'baseline' / name).read_bytes()
    assert original == copied, f'Baseline differs from source: {name}'
    assert len(copied) == entry['bytes'], f'Size mismatch: {name}'
    assert hashlib.sha256(copied).hexdigest() == entry['sha256'], f'Checksum mismatch: {name}'
    blob = subprocess.check_output(['git', '-C', str(repo), 'hash-object', '--stdin'], input=copied).decode().strip()
    assert blob == entry['git_blob'], f'Git blob mismatch: {name}'
    if args.task0:
        assert (root / 'candidate' / name).read_bytes() == original, f'Candidate differs at Task 0: {name}'
# Prevent changes outside the experimental directory relative to the pinned PR head.
changes = subprocess.check_output(['git', '-C', str(repo), 'diff', '--name-only', sha], text=True).splitlines()
changes += subprocess.check_output(['git', '-C', str(repo), 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
prefix = str(root.relative_to(repo)) + '/'
assert all(name.startswith(prefix) for name in changes), 'Out-of-scope repository changes: ' + repr(changes)
print(f'PASS: {len(expected)} exact baseline files, SHA-256 and Git blobs verified; protected paths unchanged' + ('; candidate exact' if args.task0 else ''))
