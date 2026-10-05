"""Correct only legacy-score bin coverage; no model fitting or selection."""
import json
import math
from pathlib import Path
from train import old_2x
ROOT=Path(__file__).resolve().parents[1]
values=[r['coefficient'] for r in reversed(json.loads((ROOT/'.data/history.json').read_text()))]
n=len(values)-200-5+1
anchors=list(range(200+int(n*.85),len(values)-5+1))
p=[old_2x(values[:i]) for i in anchors]
for filename in ['ml-models.json','ml-evaluation.json']:
    path=ROOT/'bog-hishchnik-alert'/filename;d=json.loads(path.read_text(encoding='utf-8'))
    for key,task in d['tasks'].items():
        if not task['old_2x']:continue
        h=task['horizon'];y=[int(max(values[i:i+h])>=2) for i in anchors];bins=[]
        for index in range(10):
            selected=[j for j,v in enumerate(p) if min(int(v*10),9)==index]
            if selected:bins.append(dict(count=len(selected),predicted=sum(p[j] for j in selected)/len(selected),observed=sum(y[j] for j in selected)/len(selected)))
        task['old_2x']['raw_score']['calibration']=bins
    path.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')) if filename=='ml-models.json' else json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
print('Legacy calibration bins cover all examples; weights and predictions unchanged')
