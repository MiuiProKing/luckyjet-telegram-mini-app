"""Continuous Astronaut collection trigger. Python standard library only."""
import json, os, time, urllib.request, urllib.error

URL=os.getenv('ASTRO_COLLECTOR_URL','https://xrniwkvfrtchtxjrwwgd.supabase.co/functions/v1/astronaut-live').strip()
TOKEN=os.getenv('ASTRO_COLLECTOR_TOKEN','').strip()
INTERVAL=max(1.0,float(os.getenv('ASTRO_POLL_SECONDS','2')))
def main():
    if not TOKEN: raise SystemExit('Set ASTRO_COLLECTOR_TOKEN in worker environment. No credentials are built into this file.')
    failures=0
    while True:
        try:
            req=urllib.request.Request(URL,data=b'{}',method='POST',headers={'Content-Type':'application/json','x-collector-token':TOKEN})
            with urllib.request.urlopen(req,timeout=20) as response: data=json.load(response)
            if not data.get('ok'): raise RuntimeError('collector rejected response')
            failures=0
            print(time.strftime('%Y-%m-%d %H:%M:%S'),'Astronaut', 'received=',data.get('received'), 'accepted=',data.get('accepted'),'rejected=',data.get('rejected'),flush=True)
        except urllib.error.HTTPError as e:
            failures+=1
            print('Astronaut collector HTTP',e.code,'Check source authorization and Supabase status.',flush=True)
        except Exception as e:
            failures+=1; print('Astronaut collector error',type(e).__name__,flush=True)
        time.sleep(min(60,INTERVAL*(2**min(failures,5))))
if __name__=='__main__':
    try: main()
    except KeyboardInterrupt: print('Stopped')
