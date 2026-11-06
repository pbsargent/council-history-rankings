#!/usr/bin/env python3
import json,re,math,hashlib,subprocess
from pathlib import Path
R=Path(__file__).resolve().parents[1]
d=json.loads((R/'data/history.json').read_text());assert len(d['councils'])==223 and len(d['periods'])==61 and len(d['source_reports'])==122
assert d['periods']==sorted(set(d['periods'])) and d['metadata']['default_period']=='2026-10'
assert d['metadata']['partial_periods']==['2026-11']
assert d['periods'][:3]==['2020-12','2021-12','2022-01']
assert all(re.fullmatch('[0-9]{3}',n) for n in d['councils'])
assert set(d)=={'metadata','periods','programs','councils','changes','source_reports','program_derivation'}
for n,c in d['councils'].items():
 assert set(c)<={'name','months','context'}
 for month,programs in c['months'].items():
  assert month in d['periods'] and programs
  for p,v in programs.items():
   assert p in d['programs'] and len(v)==6
   assert all(x is None or type(x)==int and x>=0 for x in v)
for e in d['changes']:
 assert set(e)=={'event_id','event_type','effective_date','date_precision','predecessors','successors','evidence_status','source_url','additional_source_url','notes'}
 assert e['source_url'].startswith('https://')
for s in d['source_reports']:
 assert set(s)=={'kind','period','source_sha256','detail_sum'}
 assert re.fullmatch('[a-f0-9]{64}',s['source_sha256'])
# Snapshot data must match the original clone, without an upstream refresh.
original=subprocess.check_output(['git','show','832c5b65f33dcb8280e9ed762930c8fd288fcfba:data/latest.json'],cwd=R)
assert original==(R/'data/latest.json').read_bytes()
for p in [R/'index.html',R/'assets/history.js',R/'data/history.json']:
 s=p.read_text();assert '/Users/' not in s and '/Volumes/' not in s and 'file://' not in s
print(json.dumps({'status':'pass','councils':223,'periods':61,'aggregate_only_schema':True,'original_snapshot_unchanged':True,'history_sha256':hashlib.sha256((R/'data/history.json').read_bytes()).hexdigest()},indent=2))
