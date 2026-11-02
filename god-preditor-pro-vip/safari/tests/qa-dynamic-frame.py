from playwright.sync_api import sync_playwright
from datetime import datetime,timezone
from pathlib import Path
import json,time
ROOT=Path(__file__).resolve().parents[2];CODE=(ROOT/'safari/god-preditor.user.js').read_text()
NOW=int(time.time()*1000)
def iso(t):return datetime.fromtimestamp(t/1000,timezone.utc).isoformat()
raw=[{'id':'q'+str(i),'source_seq':i+1,'coefficient':1.1,'round_timestamp':iso(NOW-(42-i)*20000),'estimated':False,'origin':'QA'} for i in range(43)]
seed={'model':'supplied-dynamic-windows-v3','rows':[],'journal':[{'model':'supplied-dynamic-windows-v3','key':'qa-'+str(t),'channel':'primary','target':t,'estimatedCoef':t,'generatedAt':NOW-60000,'acceptedAt':NOW-60000,'start':NOW+30000,'end':NOW+150000,'windowMs':120000,'score':75,'pattern':'Серия ниже цели','status':'pending','avgRoundSeconds':20} for t in [3.68]],'selected':'primary','ui':{}}
HTML='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#141020;color:white;font:16px sans-serif;height:1000px}.bet{position:fixed;top:620px;width:145px;height:60px;border:1px solid #67c383;background:#194735;color:white;border-radius:12px}#bet0{left:15px}#bet1{right:15px}</style><h1>Isolated no-money fixture</h1><button class="bet" id="bet0">Ставка 1</button><button class="bet" id="bet1">Ставка 2</button><script>window.counts=[0,0];for(let i=0;i<2;i++)document.querySelector('#bet'+i).onclick=e=>{counts[i]++;e.target.textContent='Отменить';};</script>'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox'])
 def make():
  context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  page=context.new_page();page.route('https://one-vv3016.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body='<meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:844px;border:0}</style><iframe src="https://1play.gamedev-tech.cc/mock"></iframe>'));page.route('https://1play.gamedev-tech.cc/**',lambda r:r.fulfill(status=200,content_type='text/html',body=HTML))
  page.clock.install(time=datetime.fromtimestamp(NOW/1000,timezone.utc))
  js='window.__rows='+json.dumps(raw)+';window.__store={"god-preditor-safari-v1":'+json.dumps(seed)+'};'
  js+='''window.GM={getValue:async(k,f)=>structuredClone(__store[k]??f),setValue:async(k,v)=>{__store[k]=structuredClone(v)},xmlHttpRequest:d=>{const response={status:200,responseText:JSON.stringify(__rows)};const task=Promise.resolve(response).then(r=>{d.onload?.(r);return r});task.abort=()=>d.onabort?.();return task;}};'''
  page.add_init_script(js);page.goto('https://one-vv3016.com/casino/play/v_1wingames:luckyjet?p=tmgj',wait_until='domcontentloaded');page.add_script_tag(content=CODE)
  frame=page.frames[1];frame.add_script_tag(content=CODE)
  page.wait_for_timeout(650)
  assert page.locator('#god-preditor-safari-overlay').count()==0
  page=frame
  page.wait_for_function('document.querySelector("#god-preditor-safari-overlay")?.shadowRoot.querySelector("#signal").textContent==="3,68×"')
  return context,page,page.locator('#god-preditor-safari-overlay')
 def drag_to(page,locator,x,y):
  c=page.page.context.new_cdp_session(page.page);r=locator.bounding_box();sx=r['x']+r['width']/2;sy=r['y']+r['height']/2
  c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
  for i in range(1,5):c.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':sx+(x-sx)*i/4,'y':sy+(y-sy)*i/4}]})
  c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});c.detach()
 def configure(page,host):
  host.locator('#auto-open').tap()
  for i in range(2):
   host.locator('#pick-'+str(i)).tap();r=page.locator('#bet'+str(i)).bounding_box()
   drag_to(page,host.locator('.pick-cursor'),r['x']+r['width']/2,r['y']+r['height']/2)
   assert host.locator('.pick-confirm').is_enabled(),host.locator('.pick-info').inner_text()
   host.locator('.pick-confirm').tap();assert page.evaluate('counts')==[0,0]
  host.locator('#auto-check').tap();assert page.evaluate('counts')==[0,0]
 # A trusted native selection and explicit live toggle are required.
 context,page,host=make();drag_to(page,host.locator('.handle'),155,175);configure(page,host)
 host.locator('#auto-mode').evaluate('(s)=>{s.value="live";s.dispatchEvent(new Event("change",{bubbles:true}))}')
 assert host.locator('#auto-mode').input_value()=='test'
 host.locator('#auto-mode').focus();page.page.keyboard.press('ArrowDown');page.page.keyboard.press('Enter')
 assert host.locator('#auto-mode').input_value()=='live'
 host.locator('#auto-toggle').evaluate('(b)=>b.click()');assert host.locator('#auto-title').inner_text()=='Авто выключено'
 host.locator('#auto-toggle').tap();page.wait_for_function('document.querySelector("#god-preditor-safari-overlay").shadowRoot.querySelector("#auto-title").textContent==="Автонажатия включены"');assert host.locator('#auto-title').inner_text()=='Автонажатия включены',host.locator('#auto-message').inner_text()
 page.page.clock.run_for(32000)
 assert page.evaluate('counts')==[1,1],(page.evaluate('counts'),host.locator('#auto-message').inner_text())
 page.page.clock.run_for(2500);assert page.evaluate('counts')==[1,1]
 assert page.evaluate('__store["god-preditor-autobet-receipts-v1"].length')==2
 # Both origins were fulfilled by local no-money HTML, never the casino.
 page.page.evaluate('document.body.insertAdjacentHTML("beforeend","<div style=position:fixed;inset:0;background:black;z-index:999999>Covered fixture</div>")')
 page.page.clock.run_for(2000)
 assert host.locator('#auto-title').inner_text()=='Авто выключено'

 context.close();b.close()
 print(json.dumps({'pickerCausesNoClicks':True,'dryRunNoClicks':True,'syntheticArmRejected':True,'syntheticModeChangeRejected':True,'explicitLiveTwoFixtureClicksOnly':True,'noRetries':True,'durableReservations':True,'offSwitch':True,'realMoneyActions':0}))
