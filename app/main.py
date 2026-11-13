from __future__ import annotations
import hashlib, json, logging, os, re, sqlite3, threading, uuid, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Stream model downloads over HTTP to reduce peak download memory on laptops.
os.environ.setdefault('HF_HUB_DISABLE_XET','1')
ROOT=Path(__file__).resolve().parents[1]
STORE=Path(os.environ.get('CLINGRAPH_DATA_DIR',ROOT/'runtime'))
STORE.mkdir(parents=True,exist_ok=True)
POOL=ThreadPoolExecutor(max_workers=1)
LOCK=threading.RLock()
CONVERTER=None
MAX_BYTES=20*1024*1024
logger=logging.getLogger(__name__)
def connect():
 c=sqlite3.connect(STORE/'documents.sqlite3',timeout=30);c.row_factory=sqlite3.Row;return c
def init():
 with connect() as c:
  c.execute("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, digest TEXT UNIQUE, payload TEXT NOT NULL)")
def save(d):
 with connect() as c:c.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?)',(d['id'],d['digest'],json.dumps(d,ensure_ascii=False)))
def documents():
 with connect() as c:return [json.loads(x['payload']) for x in c.execute('SELECT payload FROM documents')]
def get(id):
 with connect() as c:row=c.execute('SELECT payload FROM documents WHERE id=?',(id,)).fetchone()
 if not row:raise HTTPException(404,'Document not found')
 return json.loads(row['payload'])
def now():return datetime.now(timezone.utc).isoformat()
def dates(text):
 # Only explicitly labelled report dates; clinical event dates stay separate.
 candidates=[]
 pattern=r'(?im)^\s*(Berichtsdatum|Befunddatum|Report date|Datum)\s*:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})'
 for m in re.finditer(pattern,text):
  try:
   value=date.fromisoformat(m[2]) if '-' in m[2] else datetime.strptime(m[2],'%d.%m.%Y').date()
   candidates.append({'value':value.isoformat(),'label':m[1],'start':m.start(2),'end':m.end(2),'quote':m[0].strip()})
  except ValueError:pass
 return candidates

def extract_pdf(path):
 # Native PDF/OCR failures must not terminate the web server.
 with tempfile.TemporaryDirectory(prefix='clingraph-conversion-') as folder:
  output=Path(folder)/'result.json'
  result=subprocess.run([sys.executable,'-m','app.pdf_worker',str(path.resolve()),str(output)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=600)
  if result.returncode!=0 or not output.exists():
   logger.error('PDF worker exited %s: %s',result.returncode,result.stderr[-3000:])
   raise ValueError('PDF processing could not finish. Check available memory, model download connectivity, scan quality or encryption, then retry. Original file is preserved.')
  data=json.loads(output.read_text(encoding='utf-8'))
  return data['text'],data['segments'],data['engine']

def extract_pdf_in_process(path):
 global CONVERTER
 from docling.document_converter import DocumentConverter, PdfFormatOption
 from docling.datamodel.base_models import InputFormat
 from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice
 from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
 if CONVERTER is None:
  options=PdfPipelineOptions();options.accelerator_options=AcceleratorOptions(num_threads=2,device=AcceleratorDevice.CPU);options.do_ocr=True;options.ocr_options=RapidOcrOptions(lang=["iso:de"], backend="onnxruntime")
  CONVERTER=DocumentConverter(format_options={InputFormat.PDF:PdfFormatOption(pipeline_options=options)})
 result=CONVERTER.convert(path, max_num_pages=100, max_file_size=MAX_BYTES)
 if str(result.status.value)!='success':raise ValueError('PDF conversion did not complete successfully. Check the original document or retry.')
 segments=[];parts=[];offset=0
 for item,_ in result.document.iterate_items():
  text=getattr(item,'text',None)
  if not text and getattr(item,'label',None)=='table':
   text=item.export_to_markdown(doc=result.document)
  if not text:continue
  provenance=[{'page':p.page_no,'bbox':p.bbox.model_dump(mode='json') if p.bbox else None,'charspan':list(p.charspan)} for p in item.prov]
  segments.append({'id':f's{len(segments)+1}','start':offset,'end':offset+len(text),'text':text,'provenance':provenance})
  parts.append(text);offset+=len(text)+1
 return '\n'.join(parts),segments,'Docling + automatic OCR'

def process(id):
 d=get(id);d.update(status='processing',error=None);save(d)
 try:
  path=STORE/(id+d['extension'])
  if d['extension']=='.txt':
   raw=path.read_bytes()
   try:text=raw.decode('utf-8-sig')
   except UnicodeDecodeError:raise ValueError('Text must use UTF-8 encoding. Save it as UTF-8 and upload again.')
   if '\x00' in text:raise ValueError('This file contains binary data rather than readable text.')
   segments=[];offset=0
   for line in text.splitlines(keepends=True):
    value=line.rstrip('\r\n')
    if value.strip():segments.append({'id':f's{len(segments)+1}','start':offset,'end':offset+len(value),'text':value,'provenance':[]})
    offset+=len(line)
   engine='UTF-8 text'
  else:text,segments,engine=extract_pdf(path)
  if not text.strip():raise ValueError('No readable text found. Check scan quality, encryption or OCR support.')
  with LOCK:
   d=get(id); candidates=dates(text);values={x['value'] for x in candidates}
   if d['date_source']!='manual':
    d['report_date']=next(iter(values)) if len(values)==1 else None
    d['date_source']='detected' if len(values)==1 else 'unknown'
   d.update(status='ready',text=text,segments=segments,engine=engine,date_candidates=candidates,error=None,processed_at=now())
   d['date_warning']='Conflicting labelled dates; confirm the report date.' if len(values)>1 else ('Report date missing; please confirm.' if not values else None)
   save(d)
 except Exception as exc:
  logger.exception('Document processing failed: %s',id)
  d=get(id);d.update(status='failed',error=str(exc)[:700]);save(d)

@asynccontextmanager
async def lifespan(app):
 init()
 for d in documents():
  if d['status'] in ['queued','processing']:POOL.submit(process,d['id'])
 yield
 POOL.shutdown(wait=True)
app=FastAPI(title='ClinGraph document workspace',lifespan=lifespan)
init()
@app.get('/')
def home():return FileResponse(ROOT/'index.html')
@app.get('/reference.html')
def reference():return FileResponse(ROOT/'reference.html')
@app.get('/api/documents')
def listing():return sorted(documents(),key=lambda d:(d['report_date'] is None,d['report_date'] or '',d['created_at']))
@app.post('/api/documents',status_code=202)
async def upload(file:UploadFile=File(...)):
 name=Path((file.filename or '').replace('\\','/')).name;ext=Path(name).suffix.lower()
 if ext not in ['.txt','.pdf']:raise HTTPException(415,'Choose a PDF or UTF-8 .txt report.')
 data=await file.read(MAX_BYTES+1)
 if not data:raise HTTPException(400,'The file is empty.')
 if len(data)>MAX_BYTES:raise HTTPException(413,'Maximum file size is 20 MB.')
 if ext=='.pdf' and not data.startswith(b'%PDF-'):raise HTTPException(400,'This file does not have a valid PDF signature.')
 digest=hashlib.sha256(data).hexdigest()
 with LOCK:
  duplicate=next((d for d in documents() if d['digest']==digest),None)
  if duplicate:raise HTTPException(409,{'message':'This exact document is already uploaded.','document_id':duplicate['id']})
  id=uuid.uuid4().hex
  (STORE/(id+ext)).write_bytes(data)
  d=dict(id=id,digest=digest,filename=name,extension=ext,status='queued',created_at=now(),report_date=None,date_source='unknown',date_type='report_date',event_date=None,text='',segments=[],date_candidates=[],date_warning=None,date_history=[],error=None,engine=None)
  save(d)
 POOL.submit(process,id)
 return d
@app.get('/api/documents/{id}')
def detail(id:str):return get(id)
@app.get('/api/documents/{id}/original')
def original(id:str):
 d=get(id);return FileResponse(STORE/(id+d['extension']),media_type='application/pdf' if d['extension']=='.pdf' else 'text/plain; charset=utf-8',headers={'Content-Disposition':'inline','X-Content-Type-Options':'nosniff'})
class DateCorrection(BaseModel):
 report_date:date|None
@app.patch('/api/documents/{id}/date')
def correct_date(id:str,body:DateCorrection):
 with LOCK:
  d=get(id);d['date_history'].append({'previous':d['report_date'],'value':body.report_date.isoformat() if body.report_date else None,'at':now()})
  d.update(report_date=body.report_date.isoformat() if body.report_date else None,date_source='manual');save(d)
 return d
@app.post('/api/documents/{id}/retry',status_code=202)
def retry(id:str):
 with LOCK:
  d=get(id)
  if d['status']!='failed':raise HTTPException(409,'Only failed documents can be retried.')
  d.update(status='queued',error=None);save(d)
 POOL.submit(process,id);return d
