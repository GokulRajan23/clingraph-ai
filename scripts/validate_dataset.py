import json, pathlib, hashlib
p=pathlib.Path(__file__).resolve().parents[1]/'data'/'v1.0.0'
read=lambda n:json.loads((p/(n+'.json')).read_text(encoding='utf-8'))
r={x['id']:x for x in read('reports')}; e={x['id']:x for x in read('events')}; m=read('manifest')
assert len(r)==10 and len(e)==25 and len(read('questions'))==20
for x in e.values():
 report=r[x['report_id']]; v=x['evidence']
 assert report['patient_id']==x['patient_id']
 assert report['text'][v['start']:v['end']]==v['quote']
 assert any(s['id']==v['sentence_id'] and s['text']==v['quote'] for s in report['sentences'])
for x in read('links'):assert e[x['from_event']]['patient_id']==e[x['to_event']]['patient_id']
for x in read('questions'):
 for id in x['evidence_event_ids']:assert e[id]['patient_id']==x['patient_id']
patients=[v for split in m['splits'].values() for v in split]; assert len(patients)==len(set(patients))
for report in r.values():assert report['patient_id'] in m['splits'][report['split']]
for name,digest in m['sha256'].items():assert hashlib.sha256((p/name).read_bytes()).hexdigest()==digest
print('PASS: 10 reports, 25 observations, 9 links, 20 questions; evidence, splits and checksums valid.')
