"""Reproducible recipe for independently authored Task 3 inputs.

Test dependencies only: reportlab, Pillow, pypdf, pyHanko 0.37.0. Generated
certificates are disposable self-signed QA certificates, never production keys.
No user documents, network requests or production assets are used.
"""
import io
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from pyhanko.sign import signers
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext
from asn1crypto import x509 as asn1_x509

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
plain = out / 'independent-text.pdf'
c = canvas.Canvas(str(plain), pagesize=(400, 560), invariant=1)
c.setTitle('Independent QA document')
c.drawString(30, 500, 'AllToolForest independent document fixture')
c.linkURL('https://example.com/', (30, 480, 180, 500), relative=0)
c.acroForm.textfield(name='reference', value='QA-123', x=30, y=430,
                     width=200, height=20)
c.bookmarkPage('first')
c.addOutlineEntry('First page', 'first')
c.showPage()
c.save()

for name, grayscale in [('independent-scan-color.pdf', False),
                        ('independent-scan-gray.pdf', True)]:
    image = Image.new('RGB', (1200, 1600), '#faf7ee')
    draw = ImageDraw.Draw(image)
    for row in range(40):
        draw.text((80, 70+35*row), f'Printed document line {row+1}: preserve legibility 0123456789',
                  fill='#152b38', font_size=23)
    if grayscale:
        image = image.convert('L')
    c = canvas.Canvas(str(out / name), pagesize=(400, 560), invariant=1)
    c.drawImage(ImageReader(image), 0, 0, width=400, height=560)
    c.showPage()
    c.save()

writer = PdfWriter()
writer.append(PdfReader(plain))
writer.encrypt('QA-only-password', algorithm='AES-256')
with (out / 'encrypted.pdf').open('wb') as f:
    writer.write(f)

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Disposable ATF QA Signer')])
now = datetime.now(timezone.utc)
cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=2))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=True,
                                    key_encipherment=False, data_encipherment=False,
                                    key_agreement=False, key_cert_sign=True,
                                    crl_sign=True, encipher_only=False,
                                    decipher_only=False), critical=True)
        .sign(key, hashes.SHA256()))
pfx = out / 'qa-only.p12'
pfx.write_bytes(pkcs12.serialize_key_and_certificates(
    b'qa-only', key, cert, None, serialization.BestAvailableEncryption(b'qa-only')))
signer = signers.SimpleSigner.load_pkcs12(str(pfx), passphrase=b'qa-only')
with plain.open('rb') as src, (out / 'signed.pdf').open('wb') as target:
    signers.sign_pdf(IncrementalPdfFileWriter(src),
                     signers.PdfSignatureMetadata(field_name='Signature'),
                     signer=signer, output=target)
with (out / 'signed.pdf').open('rb') as f:
    reader = PdfFileReader(f)
    trust = asn1_x509.Certificate.load(cert.public_bytes(serialization.Encoding.DER))
    status = validate_pdf_signature(reader.embedded_signatures[0],
        signer_validation_context=ValidationContext(trust_roots=[trust], allow_fetching=False))
    if not status.bottom_line:
        raise RuntimeError('QA digital signature did not validate')
pfx.unlink()
print(json.dumps({'signatureCryptographicallyValid': True, 'encrypted': True,
                  'source': 'independently generated QA documents; not physical scanner output',
                  'files': sorted(p.name for p in out.glob('*.pdf'))}))
