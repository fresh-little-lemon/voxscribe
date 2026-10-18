"""Compare model output coverage, not ground truth. Inputs stay private."""
import argparse,json
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--nemotron-dir',required=True);p.add_argument('--fsmn-dir',required=True);p.add_argument('--output',required=True);a=p.parse_args()
rows=[]
for i in [1,2]:
 n=json.loads((Path(a.nemotron_dir)/f'clip_{i}_segments.json').read_text())
 f=json.loads((Path(a.fsmn_dir)/f'clip_{i}_segments.json').read_text())[0]['value']
 nm=np.zeros(6500,dtype=bool);fm=nm.copy()
 for s in n:nm[round(s['Start']*100):round(s['End']*100)]=True
 for start,end in f:fm[round(start/10):round(end/10)]=True
 rows.append({'clip':i,'duration_seconds':65,'grid_seconds':.01,'nemotron_union_seconds':round(nm.sum()/100,2),'fsmn_union_seconds':round(fm.sum()/100,2),'nemotron_only_seconds':round((nm&~fm).sum()/100,2),'fsmn_only_seconds':round((fm&~nm).sum()/100,2),'both_seconds':round((nm&fm).sum()/100,2)})
Path(a.output).write_text(json.dumps({'interpretation':'Model disagreement only. No human reference; not false-negative or false-positive measurements. Different default smoothing/padding can cause disagreement.','clips':rows},indent=2))
