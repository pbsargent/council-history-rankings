#!/usr/bin/env python3
"""Build council/program aggregates only from verified historical program CSVs."""
import argparse,csv,json,re,hashlib,collections
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def build(source,output):
 files=sorted(source.glob('* Council */20*/*_Detail.csv'))
 def read(p):
  kind,period=p.name.split('_')[:2];num=p.parent.parent.name[-3:];values={}
  with p.open(encoding='utf-8-sig',newline='') as f:
   reader=csv.DictReader(f);assert len(reader.fieldnames)==13,str(p)
   for r in reader:
    prog=r['Order'];unit=r['Unit'].strip()
    if prog=='3 - Crews':
     if re.match(r'^Ship\s',unit,re.I):prog='3 - Ships (Sea Scouts)'
     elif re.match(r'^Crew\s',unit,re.I):prog='3 - Crews (Venturing)'
     else:prog='3 - Crews (unit type unspecified)'
    v=values.setdefault(prog,[0,0,0])
    for j,raw in enumerate(list(r.values())[8:11]):
     n=float(raw or 0);assert n>=0 and n.is_integer(),str(p);v[j]+=int(n)
  assert values,str(p)
  return num,p.parent.parent.name,kind,period,values
 data={};seen=set();programs=set();totals=collections.defaultdict(lambda:[0,0,0]);counts=collections.Counter()
 with ThreadPoolExecutor(max_workers=24) as pool:
  for i,(num,name,kind,period,vals) in enumerate(pool.map(read,files),1):
   assert (num,kind,period) not in seen;seen.add((num,kind,period));counts[kind]+=1
   council=data.setdefault(num,{'name':name,'months':{}});month=council['months'].setdefault(period,{})
   for prog,v in vals.items():
    programs.add(prog);record=month.setdefault(prog,[None]*6);offset=0 if kind=='Membership' else 3;record[offset:offset+3]=v
    for j,n in enumerate(v):
     if n is not None:totals[(kind,period)][j]+=n
   if i%5000==0:print('Read',i,'detail CSVs (published as aggregates only)',flush=True)
 inventory=list(csv.DictReader((source/'Report Inventory.csv').open(encoding='utf-8-sig')))
 print('Inventory columns:',list(inventory[0]),flush=True)
 # Source report receipts supply independent accepted detail totals.
 receipts=source/'_Runs/2026-11-06_1512/Evidence'
 checks=[]
 for p in sorted(receipts.glob('*.json')):
  d=json.loads(p.read_text())
  if not isinstance(d,dict) or not {'kind','period','outputs','total'}.issubset(d):continue
  assert totals[(d['kind'],d['period'])][0]==d['total'],p.name
  checks.append({'kind':d['kind'],'period':d['period'],'source_sha256':d['source_sha256'],'detail_sum':d['total']})
 assert len(checks)==122 and len(data)==223 and len(seen)==27108
 latest=json.loads((ROOT/'data/latest.json').read_text())
 for c in latest['councils']:
  if c['council_number'] in data:
   data[c['council_number']]['context']={k:c[k] for k in ['units','current_youth','tay','cst']}
 changes=list(csv.DictReader((source/'Merger Research/2026-11-06/Council Changes 2020-2026.csv').open(encoding='utf-8-sig')))
 public_changes=[{k:e[k] for k in ['event_id','event_type','effective_date','date_precision','predecessors','successors','evidence_status','source_url','additional_source_url','notes']} for e in changes]
 obj={'metadata':{'title':'Council History Rankings','acquired':'2026-11-06','default_period':'2026-10','partial_periods':['2026-11'],'context_date':'2026-11-06','privacy':'Council and program aggregates only','unit_basis':'Sum of exported detail; not distinct-unit counts','historical_boundaries':'Unverified; no merger adjustments'},'periods':sorted({k[2] for k in seen}),'programs':sorted(programs),'councils':dict(sorted(data.items())),'changes':public_changes,'source_reports':checks,'program_derivation':'Source Order 3 - Crews is split by explicit Unit prefix: Ship = Sea Scouts, Crew = Venturing, otherwise unit type unspecified. Other source Order categories unchanged. Unit identifiers are not published.'}
 output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(obj,separators=(',',':'))+'\n')
 assert json.loads(output.read_text())==obj
 print(json.dumps({'councils':len(data),'periods':len(obj['periods']),'reports':len(checks),'detail_csvs':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,default=ROOT/'data/history.json');a=p.parse_args();build(a.source,a.output)
