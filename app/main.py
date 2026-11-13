from __future__ import annotations
import hashlib, json, logging, os, re, sqlite3, threading, time, uuid, subprocess, sys, tempfile, urllib.error
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ValidationError
from app.extraction.prompt import PROMPT_VERSION, SETTINGS
from app.extraction.service import MAX_CHARS, report_input, verify
from app.linking import build, observation

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
  # Phase 5 tables are derived: rebuilt from current extractions and report dates, never edited directly.
  c.execute("CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, finding_id TEXT, report_id TEXT, report_date TEXT, payload TEXT NOT NULL)")
  c.execute("CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
  c.execute("CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, from_observation TEXT, to_observation TEXT, relationship TEXT, review_required INTEGER, payload TEXT NOT NULL)")
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

def text_segments(text):
 # One segment per non-empty line; shared with scripts/evaluate_pipeline.py.
 segments=[];offset=0
 for line in text.splitlines(keepends=True):
  value=line.rstrip('\r\n')
  if value.strip():segments.append({'id':f's{len(segments)+1}','start':offset,'end':offset+len(value),'text':value,'provenance':[]})
  offset+=len(line)
 return segments

def make_extractor():
 # Replaced in tests; raises RuntimeError when no API key is configured.
 from app.extraction.deutschlandgpt import DeutschlandGPTExtractor
 return DeutschlandGPTExtractor()

def extraction_error(exc):
 # User-facing and logged messages never include report text.
 if isinstance(exc,urllib.error.HTTPError):
  hint='Check the API key.' if exc.code in (401,403) else 'Check credits or rate limits, then retry.' if exc.code in (402,429) else 'Retry later.'
  return f'DeutschlandGPT rejected the request (HTTP {exc.code}). {hint}'
 if isinstance(exc,(urllib.error.URLError,TimeoutError,OSError)):return 'DeutschlandGPT could not be reached. Check the internet connection, then retry.'
 if isinstance(exc,(ValidationError,ValueError,KeyError,IndexError)):return 'DeutschlandGPT returned output that does not match the event schema. Retry; the document is unchanged.'
 return 'Extraction failed unexpectedly. Retry; the document is unchanged.'

def extract(id,extractor):
 with LOCK:d=get(id);d['extraction']['status']='running';save(d)
 started=time.perf_counter()
 try:
  if len(d['text'])>MAX_CHARS:result=dict(status='failed',error=f'This report has {len(d["text"]):,} characters; extraction supports up to {MAX_CHARS:,} in one request. Nothing was sent.')
  else:
   events,rejected=verify(d,extractor.extract(report_input(d)))
   result=dict(status='ready',events=events,rejected=rejected,error=None)
 except Exception as exc:
  logger.error('Extraction failed for %s: %s',id,type(exc).__name__)
  result=dict(status='failed',error=extraction_error(exc))
 with LOCK:
  d=get(id);d['extraction'].update(result,latency_s=round(time.perf_counter()-started,2),finished_at=now());save(d)
  if result['status']=='ready':rebuild_links()

def rebuild_links():
 # One workspace holds one patient; observations get the same patient id.
 with LOCK:
  ready=[d for d in documents() if d['status']=='ready' and (d.get('extraction') or {}).get('status')=='ready']
  result=build([observation(d,e) for d in ready for e in d['extraction']['events']])
  finding_of={o:f['id'] for f in result['findings'] for o in f['observations']}
  unresolved={}
  for u in result['unresolved']:unresolved.setdefault(u['observation'],[]).append(u)
  with connect() as c:
   for table in ['observations','findings','links']:c.execute(f'DELETE FROM {table}')
   c.executemany('INSERT INTO observations VALUES(?,?,?,?,?)',[(o['id'],finding_of[o['id']],o['report_id'],o['report_date'],json.dumps({**o,'unresolved':unresolved.get(o['id'],[])},ensure_ascii=False)) for o in result['observations']])
   c.executemany('INSERT INTO findings VALUES(?,?)',[(f['id'],json.dumps(f,ensure_ascii=False)) for f in result['findings']])
   c.executemany('INSERT OR REPLACE INTO links VALUES(?,?,?,?,?,?)',[(x['id'],x['from_observation'],x['to_observation'],x['relationship'],int(x['review_required']),json.dumps(x,ensure_ascii=False)) for x in result['links']])

def interrupt_extractions():
 # Do not resume automatically: each request sends report text to DeutschlandGPT and uses credits.
 for d in documents():
  x=d.get('extraction')
  if x and x['status'] in ['queued','running']:x.update(status='failed',error='Interrupted by a restart. Retry to extract again.');save(d)

def process(id):
 d=get(id);d.update(status='processing',error=None);save(d)
 try:
  path=STORE/(id+d['extension'])
  if d['extension']=='.txt':
   raw=path.read_bytes()
   try:text=raw.decode('utf-8-sig')
   except UnicodeDecodeError:raise ValueError('Text must use UTF-8 encoding. Save it as UTF-8 and upload again.')
   if '\x00' in text:raise ValueError('This file contains binary data rather than readable text.')
   segments=text_segments(text);engine='UTF-8 text'
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
 init();interrupt_extractions();rebuild_links()
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
  rebuild_links()
 return d
@app.post('/api/documents/{id}/retry',status_code=202)
def retry(id:str):
 with LOCK:
  d=get(id)
  if d['status']!='failed':raise HTTPException(409,'Only failed documents can be retried.')
  d.update(status='queued',error=None);save(d)
 POOL.submit(process,id);return d
@app.post('/api/documents/{id}/extract')
def start_extraction(id:str):
 with LOCK:
  d=get(id)
  if d['status']!='ready':raise HTTPException(409,'Only processed documents can be extracted.')
  x=d.get('extraction') or {}
  if x.get('status') in ['queued','running']:raise HTTPException(409,'Extraction is already in progress.')
  try:extractor=make_extractor()
  except RuntimeError:raise HTTPException(503,'DeutschlandGPT is not configured. Set DEUTSCHLANDGPT_API_KEY in .env or the environment, then restart.')
  key=dict(text_sha256=hashlib.sha256(d['text'].encode()).hexdigest(),model=extractor.model,prompt_version=PROMPT_VERSION)
  # Cached result for unchanged text, model and prompt: no new API call.
  if x.get('status')=='ready' and all(x.get(k)==v for k,v in key.items()):return d
  d['extraction']=dict(key,status='queued',settings=SETTINGS,endpoint=extractor.info()['endpoint'],created_at=now(),finished_at=None,latency_s=None,events=[],rejected=[],error=None)
  save(d)
 POOL.submit(extract,id,extractor)
 return JSONResponse(d,status_code=202)
@app.get('/api/findings')
def findings():
 # Observations in date order (undated last); links and unresolved comparisons keep their evidence.
 with connect() as c:
  observations={x['id']:json.loads(x['payload']) for x in c.execute('SELECT id,payload FROM observations')}
  result=[json.loads(x['payload']) for x in c.execute('SELECT payload FROM findings')]
  links=[json.loads(x['payload']) for x in c.execute('SELECT payload FROM links')]
 for f in result:f['observations']=[observations[o] for o in f['observations']]
 result.sort(key=lambda f:(f['first_documented'] is None,f['first_documented'] or '',f['concept']))
 return {'findings':result,'links':links,'unresolved':[u for o in observations.values() for u in o['unresolved']]}
