import importlib, os, time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

@pytest.fixture(scope='module')
def client(tmp_path_factory):
 os.environ['CLINGRAPH_DATA_DIR']=str(tmp_path_factory.mktemp('documents'))
 from app import main
 with TestClient(main.app) as c:yield c

def upload(client,name,text):return client.post('/api/documents',files={'file':(name,text,'application/octet-stream')})
def wait(client,id):
 for _ in range(200):
  d=client.get('/api/documents/'+id).json()
  if d['status'] in ['ready','failed']:return d
  time.sleep(.03)
 raise AssertionError('Processing did not finish')

def test_text_offsets_dates_original_and_duplicate(client):
 text='Berichtsdatum: 12.03.2024\r\nLinks besteht eine Hydronephrose.\r\n'
 response=upload(client,'bericht.txt',text.encode());assert response.status_code==202
 d=wait(client,response.json()['id']);assert d['status']=='ready' and d['report_date']=='2024-03-12'
 for s in d['segments']:assert d['text'][s['start']:s['end']]==s['text']
 assert client.get('/api/documents/'+d['id']+'/original').content==text.encode()
 duplicate=upload(client,'renamed.txt',text.encode());assert duplicate.status_code==409
 assert duplicate.json()['detail']['document_id']==d['id']
 corrected=client.patch('/api/documents/'+d['id']+'/date',json={'report_date':'2024-03-14'}).json()
 assert corrected['date_source']=='manual' and corrected['date_history'][0]['previous']=='2024-03-12'
 assert client.get('/api/documents/'+d['id']).json()['report_date']=='2024-03-14'
 assert client.patch('/api/documents/'+d['id']+'/date',json={'report_date':'bad-date'}).status_code==422

def test_missing_and_conflicting_dates(client):
 for text in ['Punktion am 01.02.2024.','Berichtsdatum: 2024-01-01\nDatum: 02.01.2024']:
  d=wait(client,upload(client,'missing.txt',text.encode()).json()['id'])
  assert d['report_date'] is None and d['date_warning']
  assert d['event_date'] is None

def test_rejections_and_failed_processing(client):
 assert upload(client,'empty.txt',b'').status_code==400
 assert upload(client,'image.exe',b'bad').status_code==415
 assert upload(client,'fake.pdf',b'not PDF').status_code==400
 for content in [b'  ',b'\xff\xfe',b'hello\x00world']:
  d=wait(client,upload(client,'unreadable.txt',content).json()['id'])
  assert d['status']=='failed' and d['error']
  assert client.post('/api/documents/'+d['id']+'/retry').status_code==202
  assert wait(client,d['id'])['status']=='failed'
 assert client.get('/api/documents/not-found/original').status_code==404

def test_date_order_unknown_last_and_storage(client):
 from app import main
 items=client.get('/api/documents').json();keys=[(x['report_date'] is None,x['report_date'] or '',x['created_at']) for x in items]
 assert keys==sorted(keys)
 assert (main.STORE/'documents.sqlite3').is_file()
 assert len(main.documents())==len(items)

def test_pdf_path_preserves_page_provenance(client,monkeypatch):
 from app import main
 def extract(path):
  assert path.read_bytes().startswith(b'%PDF-')
  return 'PDF passage',[{'id':'s1','start':0,'end':11,'text':'PDF passage','provenance':[{'page':2,'bbox':{'l':10,'t':20,'r':50,'b':40},'charspan':[0,11]}]}],'Docling test adapter'
 monkeypatch.setattr(main,'extract_pdf',extract)
 d=wait(client,upload(client,'source.pdf',b'%PDF-1.4 test-adapter').json()['id'])
 assert d['status']=='ready' and d['segments'][0]['provenance'][0]['page']==2
 assert client.get('/api/documents/'+d['id']+'/original').headers['content-type']=='application/pdf'


def test_manual_date_during_processing_is_preserved(client,monkeypatch):
 import threading
 from app import main
 entered=threading.Event();release=threading.Event()
 def extract(path):
  entered.set();assert release.wait(5)
  return 'Berichtsdatum: 2024-01-01',[], 'test adapter'
 monkeypatch.setattr(main,'extract_pdf',extract)
 response=upload(client,'slow.pdf',b'%PDF-1.4 slow-date-test');id=response.json()['id']
 try:
  assert entered.wait(5)
  assert client.patch('/api/documents/'+id+'/date',json={'report_date':'2024-02-02'}).status_code==200
 finally:release.set()
 d=wait(client,id);assert d['report_date']=='2024-02-02' and d['date_source']=='manual'

def test_oversized_file_is_rejected(client):
 assert upload(client,'large.txt',b'x'*(20*1024*1024+1)).status_code==413


def test_native_pdf_worker_failure_keeps_server_and_original(client,monkeypatch):
 from app import main
 import subprocess
 monkeypatch.setattr(main.subprocess,'run',lambda *a,**k:subprocess.CompletedProcess(a[0],-9,stdout='',stderr='native allocation failed'))
 id=upload(client,'native-error.pdf',b'%PDF-1.4 native-error').json()['id']
 d=wait(client,id);assert d['status']=='failed' and 'Original file is preserved' in d['error']
 assert client.get('/api/documents').status_code==200
 assert client.get('/api/documents/'+id+'/original').content==b'%PDF-1.4 native-error'
