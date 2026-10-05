"""Publish only a new ref using Git Data API; never mutate an old ref or Pages deployment."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
GH=r'C:\Program Files\GitHub CLI\gh.exe'
REPO='MiuiProKing/luckyjet-telegram-mini-app'
BASE='52944e4d2ce7595217afba850289fd66619bd6bf'
TREE='91d6d482be24a4cea7bf86275615d93d5f6e016b'
BRANCH='bog-hishchnik-ml-20261005'
REQUESTS=ROOT/'publish-requests'

def api(route,data=None):
    args=[GH,'api',f'repos/{REPO}/{route}']
    if data is not None:
        REQUESTS.mkdir(exist_ok=True);path=REQUESTS/'request.json';path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
        args += ['--method','POST','--input',str(path)]
    result=subprocess.run(args,capture_output=True,check=True,encoding='utf-8')
    return json.loads(result.stdout)

def paths():
    files=[]
    for directory in ['bog-hishchnik-alert','local-server','ml-training','tests','.github/workflows']:
        for path in (ROOT/directory).rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts and path.suffix not in ['.pyc','.png']:
                files.append(path)
    files += [ROOT/'README-RU.md',ROOT/'requirements-training.txt',ROOT/'.gitignore']
    return sorted(files)

def preflight():
    entries=api(f'git/trees/{TREE}?recursive=1')['tree']
    for entry in entries:
        if entry['path'].startswith('.github/workflows/') and entry['path'].endswith('.yml'):
            content=base64.b64decode(api('contents/'+entry['path']+'?ref='+BASE)['content']).decode('utf-8')
            lines=content.splitlines();out=[];capturing=False
            for line in lines:
                if line.startswith('on:'):capturing=True
                elif capturing and line and not line[0].isspace():break
                if capturing:out.append(line)
            print(entry['path']+'\n'+'\n'.join(out),flush=True)
    print('Read-only preflight complete',flush=True)

def main():
    if '--preflight' in sys.argv:preflight();return
    # Ref must not already exist. Existing branches are never force updated.
    result=subprocess.run([GH,'api',f'repos/{REPO}/git/ref/heads/{BRANCH}'],capture_output=True)
    if result.returncode==0:raise SystemExit('New branch name already exists; refusing to overwrite')
    if b'404' not in result.stderr:raise SystemExit('Cannot verify new ref availability')
    entries=[];manifest=[]
    for path in paths():
        rel=path.relative_to(ROOT).as_posix();content=path.read_bytes()
        sha=api('git/blobs',{'content':base64.b64encode(content).decode(),'encoding':'base64'})['sha']
        entries.append(dict(path=rel,mode='100644',type='blob',sha=sha))
        manifest.append(dict(path=rel,sha256=hashlib.sha256(content).hexdigest(),bytes=len(content)))
        print('Uploaded '+rel,flush=True)
    tree=api('git/trees',{'base_tree':TREE,'tree':entries})['sha']
    commit=api('git/commits',{'message':'Add isolated Lucky Jet probability lab, SQLite collector and chronological model checks without Telegram','tree':tree,'parents':[BASE]})['sha']
    api('git/refs',{'ref':'refs/heads/'+BRANCH,'sha':commit})
    result=dict(branch=BRANCH,commit=commit,base_commit=BASE,preview=f'https://rawcdn.githack.com/{REPO}/{commit}/bog-hishchnik-alert/index.html',files=manifest)
    (ROOT/'publication.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='files'},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
