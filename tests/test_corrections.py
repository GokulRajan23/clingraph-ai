import os, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.corrections import apply
from app.extraction.models import ExtractedEvent
from app.linking import observation

ROOT=Path(__file__).resolve().parents[1]
R1='Berichtsdatum: 2024-01-10\nIm rechten Leberlappen eine 14 mm große Läsion.\nEin Gallengangsstent liegt in situ.\nKein Aszites.\n'
R2='Berichtsdatum: 2024-03-12\nDie bekannte Läsion im rechten Leberlappen misst 15 mm.\nDer Gallengangsstent liegt regelrecht.\nNeu wenig Aszites.\n'
# The same lesion and stent are worded differently in the two reports, so Phase 5 leaves them unlinked.
RULES={'14 mm große Läsion':('Right liver lesion','finding','present','first_documented'),
 'misst 15 mm':('Right hepatic lobe lesion','finding','present','unknown'),
 'Gallengangsstent liegt in situ':('Biliary stent','device','present','unknown'),
 'Gallengangsstent liegt regelrecht':('Bile duct stent','device','present','unknown'),
 'Kein Aszites':('Ascites','complication','absent','unknown'),
 'Neu wenig Aszites':('Ascites','complication','present','first_documented')}

class Fake:
 def __init__(self,model='fake-model',trim=False):self.model=model;self.trim=trim
 def extract(self,report):
  out=[]
  for s in report['sentences']:
   for needle,(concept,category,assertion,change) in RULES.items():
    if needle in s['text']:
     # trim=True quotes a shorter passage, as a re-extraction with another model might.
     out.append(ExtractedEvent(concept=concept,category=category,assertion=assertion,change=change,event_date=None,sentence_id=s['id'],quote=s['text'].rstrip('.') if self.trim else s['text']))
  return out
 def info(self):return {'endpoint':'fake.test'}

@pytest.fixture
def ws(tmp_path_factory,monkeypatch):
 os.environ.setdefault('CLINGRAPH_DATA_DIR',str(tmp_path_factory.mktemp('import')))
 from app import main
 holder={'extractor':Fake()}
 monkeypatch.setattr(main,'STORE',tmp_path_factory.mktemp('corrections'));monkeypatch.setattr(main,'POOL',ThreadPoolExecutor(max_workers=1))
 monkeypatch.setattr(main,'make_extractor',lambda:holder['extractor'])
 main.init()
 yield main,TestClient(main.app),holder
 main.POOL.shutdown(wait=True)

def until(client,path,done):
 for _ in range(300):
  d=client.get(path).json()
  if done(d):return d
  time.sleep(.03)
 raise AssertionError('Did not finish')

def extract(client,id):
 client.post(f'/api/documents/{id}/extract')
 return until(client,'/api/documents/'+id,lambda d:(d.get('extraction') or {}).get('status') in ['ready','failed'])

def workspace(client):
 ids=[]
 for text in [R1,R2]:
  id=client.post('/api/documents',files={'file':('r.txt',text.encode(),'text/plain')}).json()['id'];ids.append(id)
  until(client,'/api/documents/'+id,lambda d:d['status']=='ready');extract(client,id)
 return ids

def observations(client):
 f=client.get('/api/findings').json()
 return f,[o for x in f['findings'] for o in x['observations']]+f['rejected']

def find(client,concept,date):
 _,all=observations(client)
 return next(o for o in all if o['original']['concept']==concept and o['report_date']==date)

def finding_of(f,observation_id):return next(x for x in f['findings'] if observation_id in [o['id'] for o in x['observations']])

def post(client,id,action,changes=None,**extra):
 body={'observation_id':id,'action':action,**extra}
 if changes is not None:body['changes']=changes
 return client.post('/api/corrections',json=body)

def test_overlay_reviews_edits_and_rejections():
 def obs(id,concept,quote='Kein Aszites.',assertion='present'):
  return observation({'id':'R1','report_date':'2024-01-10'},{'id':id,'concept':concept,'category':'complication','assertion':assertion,'change':'unknown','event_date':None,'evidence':{'quote':quote,'start':0,'end':len(quote)}})|{'id':id}
 def entry(n,id,action,changes=None,quote='Kein Aszites.'):return {'id':f'c{n}','observation_id':id,'action':action,'changes':changes or {},'target':{'quote':quote}}
 base=[obs('a','Ascites'),obs('b','Bile duct stent'),obs('c','Effusion'),obs('d','Lesion')]
 log=[entry(1,'a','confirm'),entry(2,'b','edit',{'concept':'Biliary stent','event_date':'2024-01-09'}),entry(3,'c','edit',{'concept':'Pleural effusion'}),
  entry(4,'c','edit',{'concept':'Effusion'}),entry(5,'d','edit',{'assertion':'absent'}),entry(6,'d','reject'),entry(7,'d','restore'),entry(8,'a','edit',{'concept':'Ascites'}),
  entry(9,'x','reject'),entry(10,'b','confirm',quote='Other quote.')]
 active,rejected,entries=apply(base,log)
 by={o['id']:o for o in active+rejected}
 assert by['a']['review_status']=='confirmed' and by['a']['corrected_fields']==[]
 assert by['b']['review_status']=='corrected' and by['b']['concept']=='Biliary stent' and by['b']['label_key']==['biliary','stent']
 assert by['b']['corrected_fields']==['concept','event_date'] and by['b']['original']['concept']=='Bile duct stent'
 # An edit back to the extracted value removes the correction.
 assert by['c']['review_status']=='unreviewed' and by['c']['concept']=='Effusion' and by['c']['correction_ids']==['c3','c4']
 assert by['d']['review_status']=='corrected' and by['d']['assertion']=='absent' and not rejected
 assert [e['id'] for e in entries if e['stale']]==['c9','c10']
 active,rejected,_=apply(base,log+[entry(11,'b','reject')])
 assert [o['id'] for o in rejected]==['b'] and rejected[0]['concept']=='Biliary stent' and 'b' not in [o['id'] for o in active]

def test_confirm_reject_restore_through_the_api(ws):
 main,client,_=ws;workspace(client)
 f,_=observations(client)
 assert len(f['findings'])==5 and len(f['links'])==1 and f['rejected']==[] and f['corrections']==[]
 absent,present=find(client,'Ascites','2024-01-10'),find(client,'Ascites','2024-03-12')
 assert absent['review_status']=='unreviewed' and absent['finding_id']==present['finding_id']
 r=post(client,absent['id'],'confirm');assert r.status_code==201
 c=r.json()['correction'];assert (c['action'],c['status_before'],c['status_after'],c['stale'],c['changes'])==('confirm','unreviewed','confirmed',False,{})
 assert c['target']=={'quote':'Kein Aszites.','filename':'r.txt','report_date':'2024-01-10','concept':'Ascites'}
 assert r.json()['observation']['review_status']=='confirmed'
 assert post(client,absent['id'],'confirm').status_code==409
 r=post(client,present['id'],'reject');assert r.status_code==201 and r.json()['observation']['finding_id'] is None
 f,_=observations(client)
 # A rejected event is not linked and cannot anchor "first documented".
 assert f['links']==[] and [o['id'] for o in f['rejected']]==[present['id']] and f['rejected'][0]['review_status']=='rejected'
 assert finding_of(f,absent['id'])['first_documented'] is None
 assert post(client,present['id'],'reject').status_code==409
 assert post(client,present['id'],'edit',{'concept':'Aszites'}).json()['detail']=='Restore the event before editing it.'
 assert post(client,present['id'],'restore').json()['observation']['review_status']=='unreviewed'
 f,_=observations(client)
 assert len(f['links'])==1 and f['rejected']==[] and finding_of(f,absent['id'])['first_documented']=='2024-03-12'
 assert post(client,present['id'],'restore').status_code==409
 assert post(client,absent['id'],'restore').json()['correction']['status_after']=='unreviewed'

def test_concept_edit_repairs_split_chain_and_edit_back_removes_it(ws):
 main,client,_=ws;ids=workspace(client)
 earlier,later=find(client,'Right liver lesion','2024-01-10'),find(client,'Right hepatic lobe lesion','2024-03-12')
 assert earlier['finding_id']!=later['finding_id']
 r=post(client,later['id'],'edit',{'concept':'  Right liver lesion '},note='Same lesion as in January.')
 c=r.json()['correction'];o=r.json()['observation']
 assert (c['changes'],c['previous'],c['status_after'],c['note'])==({'concept':'Right liver lesion'},{'concept':'Right hepatic lobe lesion'},'corrected','Same lesion as in January.')
 assert o['review_status']=='corrected' and o['corrected_fields']==['concept'] and o['original']['concept']=='Right hepatic lobe lesion' and o['label_key']==['liver','lesion']
 f,_=observations(client)
 # The corrected label reaches the linker as a candidate link, which still needs review.
 link=next(x for x in f['links'] if x['to_observation']==later['id'])
 assert (link['from_observation'],link['relationship'],link['review_required'])==(earlier['id'],'same_finding',True)
 assert len(f['findings'])==4 and finding_of(f,later['id'])['review_required']
 # The original extraction is never modified.
 event=next(e for e in client.get('/api/documents/'+ids[1]).json()['extraction']['events'] if e['id']==later['event_id'])
 assert event['concept']=='Right hepatic lobe lesion' and event['review_status']=='unreviewed'
 assert post(client,later['id'],'edit',{'concept':'Right liver lesion'}).json()['detail']=='No change: the event already has these values.'
 o=post(client,later['id'],'edit',{'concept':'Right hepatic lobe lesion'}).json()['observation']
 assert o['review_status']=='unreviewed' and o['corrected_fields']==[] and len(o['correction_ids'])==2
 f,_=observations(client);assert len(f['findings'])==5 and not [x for x in f['links'] if x['to_observation']==later['id']]

def test_field_edits_change_first_documented_and_event_date(ws):
 main,client,_=ws;workspace(client)
 absent=find(client,'Ascites','2024-01-10')
 f,_=observations(client);assert finding_of(f,absent['id'])['first_documented']=='2024-03-12'
 o=post(client,absent['id'],'edit',{'assertion':'present','event_date':'2024-01-09'}).json()['observation']
 assert o['assertion']=='present' and o['event_date']=='2024-01-09' and o['corrected_fields']==['assertion','event_date']
 f,_=observations(client);assert finding_of(f,absent['id'])['first_documented']=='2024-01-10'
 o=post(client,absent['id'],'edit',{'event_date':None}).json()['observation']
 assert o['event_date'] is None and o['corrected_fields']==['assertion']

def test_corrections_survive_date_correction_rebuild_and_restart(ws):
 main,client,_=ws;ids=workspace(client)
 later=find(client,'Bile duct stent','2024-03-12');post(client,later['id'],'edit',{'concept':'Biliary stent'})
 post(client,find(client,'Ascites','2024-01-10')['id'],'confirm')
 before=client.get('/api/findings').json()
 client.patch(f'/api/documents/{ids[0]}/date',json={'report_date':'2024-01-11'})
 f=client.get('/api/findings').json()
 assert find(client,'Bile duct stent','2024-03-12')['concept']=='Biliary stent' and find(client,'Ascites','2024-01-11')['review_status']=='confirmed'
 assert next(x for x in f['links'] if x['to_observation']==later['id'])['review_required']
 client.patch(f'/api/documents/{ids[0]}/date',json={'report_date':'2024-01-10'})
 assert client.get('/api/findings').json()==before
 # A restart rebuilds every derived table from extractions and the corrections log.
 with main.connect() as c:
  for table in ['observations','findings','links']:c.execute(f'DELETE FROM {table}')
 with TestClient(main.app) as restarted:assert restarted.get('/api/findings').json()==before

def test_reextraction_makes_correction_stale_and_keeps_it(ws):
 main,client,holder=ws;ids=workspace(client)
 later=find(client,'Bile duct stent','2024-03-12');post(client,later['id'],'edit',{'concept':'Biliary stent'})
 holder['extractor']=Fake(model='other-model',trim=True)
 assert extract(client,ids[1])['extraction']['model']=='other-model'
 f=client.get('/api/findings').json()
 assert [(c['observation_id'],c['stale']) for c in f['corrections']]==[(later['id'],True)]
 assert client.get('/api/corrections').json()['corrections'][0]['stale']
 again=find(client,'Bile duct stent','2024-03-12')
 assert again['id']!=later['id'] and again['review_status']=='unreviewed' and again['concept']=='Bile duct stent'
 assert post(client,later['id'],'confirm').status_code==404
 # The stale correction applies again when its target returns.
 holder['extractor']=Fake()
 extract(client,ids[1])
 assert find(client,'Bile duct stent','2024-03-12')['concept']=='Biliary stent' and not client.get('/api/corrections').json()['corrections'][0]['stale']

def test_log_is_append_only(ws):
 main,client,_=ws;workspace(client)
 o=find(client,'Ascites','2024-01-10')
 seen=[]
 for action,changes in [('confirm',None),('edit',{'concept':'Aszites'}),('reject',None),('restore',None),('edit',{'concept':'Ascites'})]:
  assert post(client,o['id'],action,changes).status_code==201
  log=client.get('/api/corrections').json()['corrections']
  assert log[:len(seen)]==seen and len(log)==len(seen)+1
  seen=log
 assert [c['seq'] for c in seen]==sorted({c['seq'] for c in seen}) and [c['action'] for c in seen]==['confirm','edit','reject','restore','edit']
 main.rebuild_links()
 with main.connect() as c:assert c.execute('SELECT COUNT(*) FROM corrections').fetchone()[0]==5
 source=(ROOT/'app'/'main.py').read_text(encoding='utf-8')
 assert 'DELETE FROM corrections' not in source and 'UPDATE corrections' not in source

def test_correction_validation(ws):
 main,client,_=ws;workspace(client)
 id=find(client,'Ascites','2024-01-10')['id']
 assert post(client,'missing:0-1','confirm').status_code==404
 for changes in [{'category':'symptom'},{'concept':'   '},{'concept':None},{'quote':'Kein Aszites.'},{'event_date':'10.01.2024'},{'concept':'x'*201}]:
  assert post(client,id,'edit',changes).status_code==422,changes
 assert post(client,id,'merge').status_code==422 and post(client,id,'confirm',note='x'*501).status_code==422
 assert post(client,id,'confirm',{'concept':'Aszites'}).status_code==400
 assert post(client,id,'edit').status_code==400 and post(client,id,'edit',{}).status_code==400
 assert post(client,id,'edit',{'concept':'Ascites','category':'complication'}).status_code==409
 assert client.get('/api/corrections').json()['corrections']==[]

def test_interface_is_served_from_the_build_or_explains_how_to_build(ws,tmp_path,monkeypatch):
 main,client,_=ws
 monkeypatch.setattr(main,'FRONTEND',tmp_path/'missing')
 r=client.get('/');assert r.status_code==503 and 'npm ci' in r.text
 (tmp_path/'dist').mkdir();(tmp_path/'dist'/'index.html').write_text('<div id="root"></div>',encoding='utf-8')
 monkeypatch.setattr(main,'FRONTEND',tmp_path/'dist')
 r=client.get('/');assert r.status_code==200 and 'id="root"' in r.text
 assert client.get('/reference.html').status_code==200

def test_scripted_repair_restores_linking_check_chains():
 sys.path.insert(0,str(ROOT/'scripts'))
 from repair_linking_check import run
 result=run()
 assert (result['before']['matched_links'],result['before']['chains_rebuilt'])==(5,'1/4')
 after=result['after']
 assert (after['matched_links'],after['predicted_links'],after['wrong_merges'],after['chains_rebuilt'],after['unresolved_matched'])==(8,8,[],'4/4',1)
 assert result['stale_corrections']==0
