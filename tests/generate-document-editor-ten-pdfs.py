from pathlib import Path
import sys,json,hashlib,io
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image,ImageDraw,ImageFont
from pypdf import PdfReader,PdfWriter
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
if not Path(font).exists():font='/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'
scan=Image.new('RGB',(1224,1584),'white');d=ImageDraw.Draw(scan);f=ImageFont.truetype(font,30);d.text((120,130),'Scanned document review sentinel.',font=f,fill='black')
for i in range(22):d.text((120,220+i*47),f'Scan record {i+1:02d}: verify recognition and correction.',font=ImageFont.truetype(font,22),fill='black')
image=Image.new('RGB',(320,160),'#336699');ImageDraw.Draw(image).rectangle((30,30,130,130),fill='#f9bd35')
manifest=[]
names=['dense-report','two-column','table-ledger','images-links','interactive-forms','scanned','mixed-native-scan','rotation-crop','page-overflow','encrypted']
for n,name in enumerate(names,1):
 path=out/f'{n:02d}-{name}.pdf';buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(612,792),pageCompression=1);pages=8 if n==1 else 4 if n==7 else 2 if n in (6,9) else 3
 for p in range(pages):
  if n==6 or n==7 and p%2:
   c.drawImage(ImageReader(scan),0,0,width=612,height=792);c.showPage();continue
  c.setFont('Helvetica',12);c.drawString(48,735,'Complex PDF edit sentinel.');c.setFont('Helvetica-Bold',17);c.drawString(48,696,f'{name.replace("-"," ").title()} - page {p+1}')
  c.setFont('Helvetica',10);c.drawString(48,42,f'Footer preserved | fixture {n:02d} | page {p+1}');c.bookmarkPage(f'p{p}');c.addOutlineEntry(f'Page {p+1}',f'p{p}',0,False)
  if n==2:
   for col in range(2):
    for row in range(26):c.drawString(48+col*270,650-row*20,f'Column {col+1} record {row+1:02d}: retained text.')
  elif n==3:
   for row in range(20):
    y=650-row*26
    for col in range(4):c.rect(48+col*125,y-22,125,26);c.drawString(53+col*125,y-12,f'R{row+1} C{col+1}: {row*col+17}')
  elif n==4:
   c.drawImage(ImageReader(image),48,450,width=240,height=120);c.drawString(48,420,'Original image and URL link must survive.');c.linkURL('https://example.org/complex-review',(48,410,320,435),relative=0);c.setStrokeColorRGB(.3,.5,.7);c.circle(430,510,55,fill=0)
   for row in range(12):c.drawString(48,380-row*21,f'Image report row {row+1}: ordinary paragraph text.')
  elif n==5:
   c.drawString(48,630,'Customer name (interactive field):');c.acroForm.textfield(name=f'customer{p}',value=f'Original customer {p+1}',x=48,y=590,width=240,height=25,borderWidth=1);c.acroForm.checkbox(name=f'approved{p}',x=350,y=590,checked=True)
   for row in range(15):c.drawString(48,540-row*22,f'Form supporting detail {row+1}: preserve widget and value.')
  else:
   for row in range(29 if n==9 else 24):
    c.setFont('Helvetica-Bold' if row%7==0 else 'Helvetica',11 if n==9 else 10);c.drawString(48,652-row*(20 if n==9 else 22),f'Record {row+1:02d}: alpha beta gamma, retained narrative content.')
  c.showPage()
 c.save();data=buf.getvalue()
 if n in (8,10):
  reader=PdfReader(io.BytesIO(data));writer=PdfWriter();writer.clone_document_from_reader(reader)
  if n==8:
   writer.pages[1].rotate(90);writer.pages[2].cropbox.lower_left=(24,24);writer.pages[2].cropbox.upper_right=(588,768)
  else:writer.encrypt('ForestQA2026',algorithm='AES-256')
  temp=io.BytesIO();writer.write(temp);data=temp.getvalue()
 path.write_bytes(data);manifest.append({'id':f'PDF{n:02d}','file':path.name,'pages':pages,'password':'ForestQA2026' if n==10 else None,'nativeSentinel':n!=6,'sha256':hashlib.sha256(data).hexdigest(),'features':name})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps({'fixtures':len(manifest),'pages':sum(x['pages']for x in manifest)}))
