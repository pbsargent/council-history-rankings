#!/usr/bin/env python3
"""Verify the exact historical dashboard commit on GitHub Pages (credentials never logged)."""
import argparse,json,os,subprocess,time,ssl,hashlib
from pathlib import Path
from urllib.request import Request,urlopen
import certifi
ROOT=Path(__file__).resolve().parents[1];SITE='https://pbsargent.github.io/council-history-rankings/';API='https://api.github.com/repos/pbsargent/council-history-rankings/'
FILES=['councils.html','compare.html','programs.html','trends.html','assets/workspace.js','assets/workspace.css','assets/navigation.js','membership-history.html','assets/membership-history.css','assets/membership-history.js','index.html','overview.html','rankings.html','cst.html','unit-health.html','about.html','assets/dashboard.css','assets/dashboard.js','assets/history.css','assets/history.js','assets/scouting-america-signature.png','data/latest.json','data/history.json']
def main():
 p=argparse.ArgumentParser();p.add_argument('--commit',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 result=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True,env=dict(os.environ,GIT_TERMINAL_PROMPT='0'),check=True);creds=dict(x.split('=',1) for x in result.stdout.splitlines() if '=' in x);token=creds['password'];context=ssl.create_default_context(cafile=certifi.where())
 def get(url,auth=False):
  headers={'User-Agent':'Council-History-Verification','Cache-Control':'no-cache'}
  if auth:headers.update({'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
  with urlopen(Request(url,headers=headers),context=context,timeout=40) as r:assert r.status==200;return r.read()
 b=json.loads(get(API+'pages/builds/latest',True));assert b['commit']==a.commit and b['status']=='built',f"Pages build not ready: {b.get('status')}"
 receipts=[]
 for f in FILES:
  expected=subprocess.check_output(['git','show',a.commit+':'+f],cwd=ROOT);actual=get(SITE+f+'?commit='+a.commit+'&t='+str(time.time_ns()));assert actual==expected,'Live mismatch: '+f
  receipts.append({'file':f,'sha256':hashlib.sha256(actual).hexdigest(),'bytes':len(actual)})
 report={'status':'verified','commit':a.commit,'live_url':SITE,'files':receipts,'verification':'Exact pushed commit build and byte-for-byte live assets'};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':'verified','commit':a.commit,'live_url':SITE,'files':len(receipts)}))
if __name__=='__main__':main()
