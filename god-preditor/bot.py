#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os,time,math,threading,requests
from datetime import datetime
from zoneinfo import ZoneInfo
import telebot
from telebot import types

TOKEN=os.getenv('TELEGRAM_TOKEN','').strip()
CHAT_ID=int(os.getenv('GROUP_CHAT_ID','0'))
API_URL=os.getenv('LUCKYJET_API_URL','https://crash-gateway-grm-cr.100hp.app/history').strip()
CUSTOMER_ID=os.getenv('LUCKYJET_CUSTOMER_ID','').strip()
SESSION_ID=os.getenv('LUCKYJET_SESSION_ID','').strip()
TZ=ZoneInfo('Europe/Kyiv')
POLL=max(3,int(os.getenv('POLL_SECONDS','5')))
if not TOKEN: raise SystemExit('Set TELEGRAM_TOKEN')
if not CHAT_ID: raise SystemExit('Set GROUP_CHAT_ID')
if not CUSTOMER_ID or not SESSION_ID: raise SystemExit('Set LUCKYJET_CUSTOMER_ID and LUCKYJET_SESSION_ID')

bot=telebot.TeleBot(TOKEN,parse_mode='HTML',threaded=True)
running=True
pending=[]
results=[]
last_fp=None
lock=threading.Lock()

def mean(a): return sum(a)/len(a) if a else 0
def median(a):
    if not a:return 0
    s=sorted(a);m=len(s)//2
    return s[m] if len(s)%2 else (s[m-1]+s[m])/2
def std(a):
    if len(a)<2:return 0
    m=mean(a);return math.sqrt(mean([(x-m)**2 for x in a]))
def mad(a):
    if len(a)<2:return 0
    m=median(a);return median([abs(x-m) for x in a])
def geo(a): return math.exp(mean([math.log(max(x,1.001)) for x in a])) if a else 0
def ema(a,alpha):
    if not a:return 0
    e=a[-1]
    for i in range(len(a)-2,-1,-1):e=alpha*a[i]+(1-alpha)*e
    return e
def clamp(x,a,b):return max(a,min(b,x))
def fmt(x):return f'{x:.2f}x'
def t(ms):return datetime.fromtimestamp(ms/1000,TZ).strftime('%H:%M:%S')

def parse_ts(v):
    if v is None:return None
    try:
        n=float(v);return int(n*1000 if n<1e10 else n)
    except:pass
    try:return int(datetime.fromisoformat(str(v).replace('Z','+00:00')).timestamp()*1000)
    except:return None

def unwrap(p):
    if isinstance(p,list):return p
    if isinstance(p,dict):
        for k in ('data','history','rounds','results','items'):
            v=p.get(k)
            if isinstance(v,list):return v
    raise RuntimeError('Unexpected API format')

def fetch_rounds():
    r=requests.get(API_URL,headers={'Accept':'application/json','customer-id':CUSTOMER_ID,'session-id':SESSION_ID},timeout=12)
    r.raise_for_status();items=unwrap(r.json());now=int(time.time()*1000);out=[];seen=set()
    for i,o in enumerate(items[:2000]):
        if not isinstance(o,dict):continue
        c=o.get('topCoefficient',o.get('top_coefficient',o.get('coefficient')))
        if c is None and isinstance(o.get('finalValues'),list) and o['finalValues']:c=o['finalValues'][-1]
        try:c=float(str(c).replace('x','').replace(',','.'))
        except:continue
        if c==1:c=1.01
        ts=parse_ts(o.get('played_at',o.get('playedAt',o.get('createdAt',o.get('timestamp',o.get('time')))))) or now-i*10000
        rid=str(o.get('id',o.get('roundId',o.get('hash',f'{ts}:{c}'))))
        if rid in seen:continue
        seen.add(rid);out.append({'id':rid,'coefficient':c,'timestamp':ts})
    if len(out)<20:raise RuntimeError('Need at least 20 rounds')
    return out

def gap(r,thr):
    e=sorted([x for x in r if x['coefficient']>=thr],key=lambda x:x['timestamp'])
    if len(e)<2:return {'count':len(e),'last':e[-1]['timestamp'] if e else None,'med':0,'mad':0}
    g=[e[i]['timestamp']-e[i-1]['timestamp'] for i in range(1,len(e))]
    return {'count':len(e),'last':e[-1]['timestamp'],'med':median(g),'mad':mad(g)}

def big_opp(r,now):
    g=gap(r,100);c=[]
    if g['count']>=5 and g['last'] and g['med']>0:
        exp=g['last']+g['med'];delta=exp-now;w=clamp(g['mad']*1.4826 if g['mad'] else g['med']*.35,120000,720000)
        stable=g['mad']>0 and g['mad']<g['med']*.5;near=abs(delta)<=w*.7;late=now-g['last']>=g['med']*.9
        if stable and (near or late):
            prox=clamp(1-abs(delta)/max(w,1),0,1);conf=round(clamp(55+min(10,g['count'])+prox*12,55,82))
            c.append({'coef':100,'conf':conf,'at':int(exp if delta>0 else now+max(120000,w*.4)),'window':int(clamp(w,180000,600000))})
    chron=sorted(r,key=lambda x:x['timestamp']);last80=chron[-80:];n20=sum(x['coefficient']>=20 for x in last80);n50=sum(x['coefficient']>=50 for x in last80)
    if n50>=3 and n20>=6:c.append({'coef':120,'conf':round(clamp(55+n50*5+n20,55,82)),'at':now+180000,'window':360000})
    if not c:return None
    c.sort(key=lambda x:x['conf'],reverse=True);b=c[0]
    if len(c)<2 and b['conf']<75:return None
    if len(c)>=2:b['conf']=min(92,b['conf']+5)
    return b

def predict(r):
    now=int(time.time()*1000);d=sorted(r,key=lambda x:x['timestamp'],reverse=True);a=[x['coefficient'] for x in d]
    allgeo=geo(a);med=median(a);l20=a[:20];l50=a[:50];avg50=mean(l50);e20=ema(l20,.25);e50=ema(l50,.12);sigma=std(l50);m50=mad(l50);recent20=[x for x in d[:30] if x['coefficient']>=20];low15=len(a[:15])==15 and all(x<2 for x in a[:15]);big=big_opp(r,now)
    if low15:
        est=clamp(allgeo*2.5+med,2.5,15);score=round(clamp(70+min(15,(now-d[14]['timestamp'])/60000),65,92));return {'coef':est,'conf':score,'at':now+90000,'window':120000,'big':big}
    if len(recent20)>=3:
        gg=geo([x['coefficient'] for x in recent20]);div=3 if len(recent20)>=5 else 4 if len(recent20)>=4 else 5;return {'coef':clamp(gg/div,2,12),'conf':min(78,60+len(recent20)*3),'at':now+120000,'window':150000,'big':big}
    l60=d[:60];z=[x for x in l60 if 5<=x['coefficient']<10];low=sum(x['coefficient']<2 for x in l60)/len(l60)
    if len(z)>=3:
        zg=geo([x['coefficient'] for x in z]);frag=low>.55 or sigma>avg50*1.4;est=clamp(zg*.45,2,4.5) if frag else clamp(zg*.7,3,7);score=round(clamp(64+len(z)*4+(-6 if frag else 6),58,90));return {'coef':est,'conf':score,'at':now+120000,'window':150000,'big':big}
    composite=e20*.5+e50*.3+avg50*.2;est=clamp(composite*.6+1.6,1.8,12);danger=low>.6 or sigma>avg50*1.6
    if danger:est=min(est,3.2)
    elif low>.45:est=min(est,5)
    score=round(clamp(52+clamp(len(r)/25,0,28)+(5 if m50>0 and m50<avg50*.6 else 0)+(-8 if danger else 0),50,92));return {'coef':est,'conf':score,'at':now+120000,'window':150000,'big':big}

def window_text(p):return f"{t(p['at'])}–{t(p['at']+p['window'])}"
def send_signal(p,r):
    c=[x['coefficient'] for x in r];recent='  '.join(fmt(x['coefficient']) for x in sorted(r,key=lambda x:x['timestamp'],reverse=True)[:8])
    b=p.get('big');bigcoef=fmt(b['coef']) if b else 'нет сильного сигнала';bigconf=f"{b['conf']}%" if b else '—';bigwin=window_text(b) if b else '—'
    text=(f"🚀 <b>СИГНАЛ LUCKY JET</b>\n\n🎯 Прогноз: <b>{fmt(p['coef'])}</b>\n📊 Уверенность: <b>{p['conf']}%</b>\n⏰ Окно: <b>{window_text(p)}</b>\n🔥 Возможный большой кеф: <b>{bigcoef}</b>\n🔥 Уверенность большого: <b>{bigconf}</b>\n🔥 Окно большого: <b>{bigwin}</b>\n\n📈 Средний: {mean(c):.2f}x\n🚀 Максимум: {max(c):.2f}x\n≥2X: {100*sum(x>=2 for x in c)/len(c):.1f}% · ≥10X: {100*sum(x>=10 for x in c)/len(c):.1f}%\nПоследние: <code>{recent}</code>\n\n<i>Статистический сигнал, не гарантия результата.</i>")
    bot.send_message(CHAT_ID,text)

def register(p):
    fp=f"{p['coef']:.2f}|{p['at']//30000}"
    with lock:
        if not any(x['fp']==fp for x in pending):pending.append({'fp':fp,'target':p['coef'],'start':p['at'],'end':p['at']+p['window'],'kind':'main'})
        b=p.get('big')
        if b:
            bfp=f"big|{b['at']//30000}"
            if not any(x['fp']==bfp for x in pending):pending.append({'fp':bfp,'target':b['coef'],'start':b['at'],'end':b['at']+b['window'],'kind':'big'})

def verify(r,send=True):
    now=int(time.time()*1000);done=[]
    with lock:items=list(pending)
    for x in items:
        if now<x['end']:continue
        m=sorted([q for q in r if x['start']<=q['timestamp']<=x['end']],key=lambda q:q['timestamp'])
        if not m and now<x['end']+90000:continue
        hit=next((i for i,q in enumerate(m) if q['coefficient']>=x['target']),None);mx=max([q['coefficient'] for q in m],default=0);ok=hit is not None
        rec={'ok':ok,'target':x['target'],'max':mx,'round':hit+1 if ok else None,'hitcoef':m[hit]['coefficient'] if ok else None,'time':m[hit]['timestamp'] if ok else None};results.insert(0,rec);del results[100:]
        with lock:
            if x in pending:pending.remove(x)
        if send:
            if ok:text=f"✅ <b>ПРОВЕРКА</b>\n\nРезультат: <b>✅ ЗАШЛО</b>\n🎯 Цель: <b>{fmt(x['target'])}</b>\n✅ Зашло в раунде: <b>№{hit+1}</b>\n🎯 Коэффициент: <b>{fmt(m[hit]['coefficient'])}</b>\n🕒 Время: <b>{t(m[hit]['timestamp'])}</b>"
            else:text=f"❌ <b>ПРОВЕРКА</b>\n\nРезультат: <b>❌ НЕ ЗАШЛО</b>\n🎯 Цель: <b>{fmt(x['target'])}</b>\n🚀 Максимум: <b>{fmt(mx)}</b>\n🧾 Раундов в окне: <b>{len(m)}</b>"
            bot.send_message(CHAT_ID,text)
        done.append(rec)
    return done

def kb():
    k=types.InlineKeyboardMarkup(row_width=2)
    k.add(types.InlineKeyboardButton('▶️ ВКЛЮЧИТЬ',callback_data='on'),types.InlineKeyboardButton('⏹ ОСТАНОВИТЬ',callback_data='off'))
    k.add(types.InlineKeyboardButton('🧠 СИГНАЛ СЕЙЧАС',callback_data='signal'),types.InlineKeyboardButton('✅ ПРОВЕРИТЬ',callback_data='verify'))
    k.add(types.InlineKeyboardButton('📊 СТАТИСТИКА',callback_data='stats'),types.InlineKeyboardButton('🔌 API',callback_data='api'))
    return k

def stat_text():
    w=sum(x['ok'] for x in results);n=len(results);return f"📊 <b>СТАТИСТИКА</b>\n\n✅ Зашло: <b>{w}</b>\n❌ Не зашло: <b>{n-w}</b>\n📈 Проходимость: <b>{(100*w/n if n else 0):.1f}%</b>\n⏳ На проверке: <b>{len(pending)}</b>"

@bot.message_handler(commands=['start','menu','status'])
def start_cmd(m):bot.send_message(m.chat.id,'🤖 <b>GOD PREDITOR — Lucky Jet</b>',reply_markup=kb())

@bot.callback_query_handler(func=lambda c:True)
def cb(c):
    global running,last_fp
    try:
        if c.data=='on':running=True;bot.answer_callback_query(c.id,'Включено')
        elif c.data=='off':running=False;bot.answer_callback_query(c.id,'Остановлено')
        elif c.data=='signal':
            r=fetch_rounds();p=predict(r);send_signal(p,r);register(p);bot.answer_callback_query(c.id,'Сигнал отправлен')
        elif c.data=='verify':
            r=fetch_rounds();d=verify(r,True);bot.answer_callback_query(c.id,f'Проверено: {len(d)}')
        elif c.data=='stats':bot.send_message(c.message.chat.id,stat_text());bot.answer_callback_query(c.id)
        elif c.data=='api':
            r=fetch_rounds();last='  '.join(fmt(x['coefficient']) for x in sorted(r,key=lambda x:x['timestamp'],reverse=True)[:8]);bot.send_message(c.message.chat.id,f'✅ API работает\nРаундов: <b>{len(r)}</b>\n<code>{last}</code>');bot.answer_callback_query(c.id)
    except Exception as e:bot.answer_callback_query(c.id,'Ошибка');bot.send_message(c.message.chat.id,f'❌ <code>{type(e).__name__}: {e}</code>')

def worker():
    global last_fp
    while True:
        try:
            if running:
                r=fetch_rounds();verify(r,True);p=predict(r);fp=f"{p['coef']:.2f}|{p['at']//30000}"
                if fp!=last_fp:send_signal(p,r);register(p);last_fp=fp
        except Exception as e:print(type(e).__name__,e)
        time.sleep(POLL)

threading.Thread(target=worker,daemon=True).start()
bot.infinity_polling(skip_pending=True,timeout=30,long_polling_timeout=30)
