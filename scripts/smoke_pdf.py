"""Real Docling smoke test: generated digital and raster-only German PDF fixtures.
Run from repository root: .venv/bin/python scripts/smoke_pdf.py (Windows: .venv/Scripts/python.exe)
Downloads processing models on first use. No clinical data used.
"""
import io, pathlib, sys, tempfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from app.main import extract_pdf
from PIL import Image, ImageDraw, ImageFont

def digital_pdf():
 content=b'BT /F1 16 Tf 50 750 Td (Berichtsdatum: 2024-03-12) Tj 0 -30 Td (Links besteht eine Hydronephrose.) Tj ET'
 objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(content)).encode()+b' >>\nstream\n'+content+b'\nendstream']
 pdf=b'%PDF-1.4\n';offsets=[0]
 for i,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
 xref=len(pdf);pdf+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{x:010} 00000 n \n'.encode() for x in offsets[1:])
 return pdf+b'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'

with tempfile.TemporaryDirectory() as folder:
 folder=pathlib.Path(folder);digital=folder/'digital.pdf';digital.write_bytes(digital_pdf())
 text,segments,engine=extract_pdf(digital)
 assert 'Hydronephrose' in text and segments
 assert all(text[s['start']:s['end']]==s['text'] for s in segments)
 assert any(s['provenance'] and s['provenance'][0]['page']==1 for s in segments)
 print('PASS digital PDF: text, offsets and page provenance',flush=True)
 image=Image.new('RGB',(1654,2339),'white');draw=ImageDraw.Draw(image)
 # Pillow's bundled scalable font works on every OS.
 font=ImageFont.load_default(size=36)
 draw.text((100,120),'Berichtsdatum: 2024-03-12',fill='black',font=font)
 draw.text((100,190),'Links besteht eine Hydronephrose.',fill='black',font=font)
 scan=folder/'scan.pdf';image.save(scan,'PDF',resolution=200)
 text,segments,engine=extract_pdf(scan)
 assert 'Hydronephrose' in text and segments
 assert any(s['provenance'] and s['provenance'][0]['page']==1 for s in segments)
 print('PASS scanned PDF: OCR text and page provenance',flush=True)
