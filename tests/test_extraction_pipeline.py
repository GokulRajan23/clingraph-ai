import os, threading, time, urllib.error
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.extraction.models import ExtractedEvent
from app.extraction.service import verify

TEXT='Berichtsdatum: 2024-04-10\nAm 08.04.2024 erfolgte eine Pleurapunktion rechts.\nKein Pneumothorax.\n'

def proposal(**k):
 base=dict(concept='Right pleural puncture',category='procedure',assertion='present',change='performed',event_date='2024-04-08',sentence_id='s2',quote='Am 08.04.2024 erfolgte eine Pleurapunktion rechts.')
 return ExtractedEvent(**{**base,**k})

class Fake:
 model='fake-model'
 def __init__(self,result=None,error=None):self.calls=0;self.result=result;self.error=error
 def extract(self,report):
  self.calls+=1
  if self.error:raise self.error
  return self.result if self.result is not None else [proposal(),proposal(concept='Pneumothorax',category='complication',assertion='absent',change='unknown',event_date=None,sentence_id='s3',quote='Kein Pneumothorax.')]
 def info(self):return {'endpoint':'fake.test'}

@pytest.fixture(scope='module')
def client(tmp_path_factory):
 # app.main is imported once per session; use a separate store and worker pool, then restore them.
 os.environ.setdefault('CLINGRAPH_DATA_DIR',str(tmp_path_factory.mktemp('import')))
 from app import main
 with pytest.MonkeyPatch.context() as patch:
  patch.setattr(main,'STORE',tmp_path_factory.mktemp('extraction'));patch.setattr(main,'POOL',ThreadPoolExecutor(max_workers=1))
  main.init()
  yield TestClient(main.app)
  main.POOL.shutdown(wait=True)

def ready(client,text):
 id=client.post('/api/documents',files={'file':('r.txt',text.encode(),'text/plain')}).json()['id']
 return wait(client,id,lambda d:d['status'] in ['ready','failed'])

def wait(client,id,done):
 for _ in range(200):
  d=client.get('/api/documents/'+id).json()
  if done(d):return d
  time.sleep(.03)
 raise AssertionError('Did not finish')

def extracted(client,id):return wait(client,id,lambda d:d.get('extraction',{}).get('status') in ['ready','failed'])

def test_verify_offsets_provenance_and_rejections():
 seg={'id':'s1','start':100,'end':150,'text':'Links Erguss. Am 1.2.2024 Drainage.','provenance':[{'page':3,'bbox':{'l':1},'charspan':[0,35]}]}
 doc={'id':'doc','segments':[seg]}
 events,rejected=verify(doc,[
  proposal(sentence_id='s1',quote='Am 1.2.2024 Drainage.',event_date='2024-02-01'),
  proposal(sentence_id='s1',quote='Links Erguss.',event_date='2024-03-05'),
  proposal(sentence_id='s9'),proposal(sentence_id='s1',quote='Rechts Erguss.'),proposal(sentence_id='s1',quote='')])
 assert [e['evidence']['start'] for e in events]==[114,100] and events[0]['evidence']['end']==135
 assert events[0]['evidence']['provenance'][0]['page']==3 and events[0]['review_status']=='unreviewed'
 assert events[0]['flags']==[] and events[1]['flags']==['event_date_not_in_evidence']
 assert [r['reason'] for r in rejected]==["cited segment 's9' does not exist"]+['quote is not an exact passage of the cited segment']*2

def test_extraction_cache_and_report_date_from_document(client,monkeypatch):
 from app import main
 fake=Fake();monkeypatch.setattr(main,'make_extractor',lambda:fake)
 d=ready(client,TEXT);assert client.post(f'/api/documents/{d["id"]}/extract').status_code==202
 x=extracted(client,d['id'])['extraction']
 assert x['status']=='ready' and x['model']=='fake-model' and x['prompt_version']=='v2' and x['endpoint']=='fake.test'
 event=x['events'][0];assert TEXT[event['evidence']['start']:event['evidence']['end']]==event['evidence']['quote']
 assert 'report_date' not in event and x['rejected']==[]
 again=client.post(f'/api/documents/{d["id"]}/extract');assert again.status_code==200 and fake.calls==1
 client.patch(f'/api/documents/{d["id"]}/date',json={'report_date':'2024-04-11'})
 d=client.get('/api/documents/'+d['id']).json();assert d['report_date']=='2024-04-11' and d['extraction']['events']==x['events']

def test_failure_is_visible_and_retry_works(client,monkeypatch):
 from app import main
 d=ready(client,TEXT+'Variante.\n')
 monkeypatch.setattr(main,'make_extractor',lambda:Fake(error=urllib.error.HTTPError('u',402,'Payment Required',None,None)))
 client.post(f'/api/documents/{d["id"]}/extract');x=extracted(client,d['id'])['extraction']
 assert x['status']=='failed' and 'HTTP 402' in x['error'] and 'Pleurapunktion' not in x['error']
 monkeypatch.setattr(main,'make_extractor',lambda:Fake(error=ValueError('Pleurapunktion leaked')))
 client.post(f'/api/documents/{d["id"]}/extract');x=extracted(client,d['id'])['extraction']
 assert 'event schema' in x['error'] and 'Pleurapunktion' not in x['error']
 monkeypatch.setattr(main,'make_extractor',lambda:Fake())
 assert client.post(f'/api/documents/{d["id"]}/extract').status_code==202
 assert extracted(client,d['id'])['extraction']['status']=='ready'
 assert client.get(f'/api/documents/{d["id"]}/original').content==(TEXT+'Variante.\n').encode()

def test_missing_key_not_ready_and_too_long(client,monkeypatch):
 from app import main
 def missing():raise RuntimeError('Set DEUTSCHLANDGPT_API_KEY')
 monkeypatch.setattr(main,'make_extractor',missing)
 d=ready(client,TEXT+'Schlüssel.\n');r=client.post(f'/api/documents/{d["id"]}/extract')
 assert r.status_code==503 and 'DEUTSCHLANDGPT_API_KEY' in r.json()['detail']
 bad=ready(client,'  ');assert bad['status']=='failed'
 assert client.post(f'/api/documents/{bad["id"]}/extract').status_code==409
 fake=Fake();monkeypatch.setattr(main,'make_extractor',lambda:fake)
 long=ready(client,'Befund.\n'*6000);client.post(f'/api/documents/{long["id"]}/extract')
 x=extracted(client,long['id'])['extraction'];assert x['status']=='failed' and 'Nothing was sent' in x['error'] and fake.calls==0

def test_running_extraction_conflicts_and_restart_interrupts(client,monkeypatch):
 from app import main
 entered=threading.Event();release=threading.Event()
 class Slow(Fake):
  def extract(self,report):entered.set();assert release.wait(5);return []
 monkeypatch.setattr(main,'make_extractor',lambda:Slow())
 d=ready(client,TEXT+'Langsam.\n')
 try:
  client.post(f'/api/documents/{d["id"]}/extract');assert entered.wait(5)
  assert client.post(f'/api/documents/{d["id"]}/extract').status_code==409
  main.interrupt_extractions()
  x=client.get('/api/documents/'+d['id']).json()['extraction'];assert x['status']=='failed' and 'restart' in x['error']
 finally:release.set()
 assert extracted(client,d['id'])['extraction']['status']=='ready'
