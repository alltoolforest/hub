import tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from cleanup_trial import download
class IntegrityTests(unittest.TestCase):
    def test_cached_hash_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'model.pth';path.write_bytes(b'corrupt')
            with patch('urllib.request.urlopen',side_effect=AssertionError('Unexpected network')):
                with self.assertRaisesRegex(ValueError,'hash mismatch'):download('https://example.invalid',path,'0'*64)
    def test_oversized_cached_artifact_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'model.pth';path.write_bytes(b'x'*8_000_001)
            with self.assertRaisesRegex(ValueError,'size cap'):download('https://example.invalid',path)
if __name__=='__main__':unittest.main()
