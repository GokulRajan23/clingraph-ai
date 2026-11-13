import hashlib, json, os, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.extraction.models import ExtractedEvent
from app.linking import build, comparison_dates, label_key, laterality, measurements

ROOT=Path(__file__).resolve().parents[1]

def obs(id,report,date,concept,quote,assertion='present',change='unknown',patient='P1'):
 from app.linking import observation
 event={'id':id,'concept':concept,'category':'finding','assertion':assertion,'change':change,'event_date':None,'evidence':{'quote':quote,'start':0,'end':len(quote)}}
 o=observation({'id':report,'report_date':date},event,patient);o['id']=id;return o

def pairs(result):return {(x['from_observation'],x['to_observation']):x for x in result['links']}

def test_quote_features():
 assert laterality('Im rechten Oberlappen')=='right' and laterality('Rechts kein Harnstau.')=='right'
 assert laterality('linksseitige Hydronephrose')=='left' and laterality('Pleuraergüsse beidseits')=='bilateral'
 assert laterality('rechts und links')is None and laterality('Kein Aszites.')is None
 assert comparison_dates('gegenüber dem CT vom 10.01.2024 von 6 auf 9 mm')==['2024-01-10']
 assert comparison_dates('Im Vergleich zur Voruntersuchung vom 2024-03-12 stabil')==['2024-03-12']
 assert comparison_dates('Am 08.04.2024 erfolgte eine Punktion.')==[]
 assert measurements('von 6 auf 9 mm, Entnahme von 300 ml')==['6 auf 9 mm','300 ml']
 assert label_key('Right-sided pleural effusion')==label_key('Right pleural effusion')==('pleural','effusion')
 assert label_key('New pulmonary nodules')!=label_key('Right upper-lobe pulmonary nodule')

def test_explicit_comparison_skips_more_recent_report_and_records_missing_study():
 r=build([obs('a','R1','2024-01-01','Right liver lesion','Im rechten Leberlappen eine Läsion.'),
  obs('b','R2','2024-02-01','Right liver lesion','Die Läsion im rechten Leberlappen misst 15 mm.'),
  obs('c','R3','2024-03-01','Right liver lesion','Die Läsion rechts ist gegenüber dem CT vom 01.01.2024 größenprogredient.',change='progressed'),
  obs('d','R3','2024-03-01','Left liver cyst','Die Zyste links ist gegenüber dem MRT vom 10.01.2023 unverändert.',change='stable')])
 links=pairs(r)
 assert links[('a','c')]['relationship']=='progressed' and links[('a','c')]['comparison_date']=='2024-01-01' and not links[('a','c')]['review_required']
 assert links[('a','b')]['review_required'] and ('b','c') not in links
 assert r['unresolved']==[{'observation':'d','comparison_date':'2023-01-10','reason':'study_not_in_collection','message':'Compared with a study dated 2023-01-10 that is not in this collection.'}]

def test_no_links_across_sides_patients_same_report_or_from_undated():
 r=build([obs('a','R1','2024-01-01','Right hydronephrosis','Rechts Hydronephrose.'),
  obs('b','R2','2024-02-01','Left hydronephrosis','Links Hydronephrose.'),
  obs('c','R2','2024-02-01','Right hydronephrosis','Rechts Hydronephrose.',patient='P2'),
  obs('d','R3',None,'Pleural effusion','Pleuraerguss.'),
  obs('e','R4','2024-03-01','Pleural effusion','Pleuraerguss.'),
  obs('f','R4','2024-03-01','Pleural effusion','Kein Pleuraerguss.',assertion='absent')])
 # Only the undated observation receives links (from the latest dated report); it is never the earlier end.
 assert set(pairs(r))=={('e','d'),('f','d')}
 assert len(r['findings'])==4

def test_undated_and_historical_candidates_need_review():
 r=build([obs('a','R1','2024-04-09','Right pleural puncture','Rechtsseitige Pleurapunktion am 08.04.2024.',change='performed'),
  obs('b','R2',None,'Pleural puncture','Eine Pleurapunktion wurde laut Vorbericht durchgeführt.',assertion='historical'),
  obs('c','R3','2024-05-01','Stent','Stent in situ.'),obs('d','R4',None,'Stent','Stent in situ.')])
 links=pairs(r)
 assert links[('a','b')]['relationship']=='historical_reference' and links[('a','b')]['review_required']
 assert 'undated' in links[('c','d')]['basis']
 stent=next(f for f in r['findings'] if 'c' in f['observations'])
 assert stent['first_documented']=='2024-05-01' and stent['first_documented_uncertain'] and stent['review_required']

def test_linking_fixture_is_consistent():
 data=ROOT/'data'/'linking-v1';manifest=json.loads((data/'manifest.json').read_text(encoding='utf-8'))
 for name,digest in manifest['sha256'].items():assert hashlib.sha256((data/name).read_bytes()).hexdigest()==digest
 reports={r['id']:r for r in json.loads((data/'reports.json').read_text(encoding='utf-8'))}
 events={e['id']:e for e in json.loads((data/'events.json').read_text(encoding='utf-8'))}
 for e in events.values():
  v=e['evidence'];assert reports[e['report_id']]['text'][v['start']:v['end']]==v['quote']
 links=json.loads((data/'links.json').read_text(encoding='utf-8'))
 for x in links['links']:assert events[x['from_event']]['chain_id']==events[x['to_event']]['chain_id']
 v1=json.loads((ROOT/'data'/'v1.0.0'/'manifest.json').read_text(encoding='utf-8'))['splits']
 assert not set(manifest['splits']['linking_check'])&{p for split in v1.values() for p in split}

class Fake:
 model='fake-model'
 def extract(self,report):
  out=[]
  for s in report['sentences']:
   if 'Rundherd' in s['text']:out.append(ExtractedEvent(concept='Right upper-lobe pulmonary nodule',category='finding',assertion='present',change='progressed' if 'gegenüber' in s['text'] else 'first_documented',event_date=None,sentence_id=s['id'],quote=s['text']))
  return out
 def info(self):return {'endpoint':'fake.test'}

@pytest.fixture(scope='module')
def client(tmp_path_factory):
 os.environ.setdefault('CLINGRAPH_DATA_DIR',str(tmp_path_factory.mktemp('import')))
 from app import main
 with pytest.MonkeyPatch.context() as patch:
  patch.setattr(main,'STORE',tmp_path_factory.mktemp('linking'));patch.setattr(main,'POOL',ThreadPoolExecutor(max_workers=1))
  patch.setattr(main,'make_extractor',lambda:Fake())
  main.init()
  yield TestClient(main.app)
  main.POOL.shutdown(wait=True)

def until(client,path,done):
 for _ in range(200):
  d=client.get(path).json()
  if done(d):return d
  time.sleep(.03)
 raise AssertionError('Did not finish')

def test_findings_api_follows_extraction_and_date_correction(client):
 ids=[]
 for text in ['Berichtsdatum: 2024-01-10\nIm rechten Oberlappen zeigt sich ein 6 mm großer Rundherd.\n','Berichtsdatum: 2024-03-12\nDer Rundherd im rechten Oberlappen ist gegenüber dem CT vom 10.01.2024 von 6 auf 9 mm größenprogredient.\n']:
  id=client.post('/api/documents',files={'file':('r.txt',text.encode(),'text/plain')}).json()['id'];ids.append(id)
  until(client,'/api/documents/'+id,lambda d:d['status']=='ready')
  client.post(f'/api/documents/{id}/extract');until(client,'/api/documents/'+id,lambda d:d['extraction']['status']=='ready')
 f=client.get('/api/findings').json()
 assert len(f['findings'])==1 and [o['report_date'] for o in f['findings'][0]['observations']]==['2024-01-10','2024-03-12']
 link=f['links'][0];assert link['relationship']=='progressed' and not link['review_required']
 assert f['findings'][0]['observations'][1]['measurements']==['6 auf 9 mm'] and f['findings'][0]['first_documented']=='2024-01-10'
 client.patch(f'/api/documents/{ids[0]}/date',json={'report_date':'2024-01-11'})
 f=client.get('/api/findings').json()
 # The stated comparison no longer resolves, so only a review-flagged candidate link remains.
 assert f['unresolved'][0]['comparison_date']=='2024-01-10'
 assert [(x['relationship'],x['review_required'],x['comparison_date']) for x in f['links']]==[('same_finding',True,None)]
