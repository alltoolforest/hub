import unittest
from PIL import Image
from collect_nasa import safe_url, fingerprint
class IntakeTests(unittest.TestCase):
    def test_rejects_nonofficial_and_credential_urls(self):
        for u in ['http://images-api.nasa.gov/search','https://images-api.nasa.gov.attacker.test/x','https://name:secret@images-api.nasa.gov/search','file:///etc/passwd','https://127.0.0.1/x']:
            with self.assertRaises(ValueError):safe_url(u)
    def test_official_https(self):
        for u in ['https://images-api.nasa.gov/search?q=portrait','https://images-assets.nasa.gov/image/a/a~thumb.jpg']:self.assertEqual(safe_url(u),u)
    def test_fingerprint_repeatable(self):
        im=Image.new('RGB',(40,30),(20,40,60));self.assertEqual(fingerprint(im),fingerprint(im.copy()));self.assertEqual(len(fingerprint(im)),16)
if __name__=='__main__':unittest.main()
