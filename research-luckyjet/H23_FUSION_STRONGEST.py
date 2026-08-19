#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os,statistics,requests,telebot
from datetime import datetime
from zoneinfo import ZoneInfo

TOKEN=os.getenv("TELEGRAM_TOKEN","")
GROUP_CHAT_ID=int(os.getenv("GROUP_CHAT_ID","-1004441634645"))
ADMIN_ID=int(os.getenv("ADMIN_ID","8016237913"))
API="https://crash-gateway-grm-cr.100hp.app/history"
CUSTOMER="077dee8d-c923-4c02-9bee-757573662e69"
SESSION=os.getenv("LUCKYJET_SESSION_ID","")
ENGINE="h23-fusion"
NAME="🏆 H23 FUSION"
TZ=ZoneInfo("Europe/Kyiv")
if not TOKEN: raise RuntimeError("Set TELEGRAM_TOKEN environment variable")
if not SESSION: raise RuntimeError("Set LUCKYJET_SESSION_ID environment variable")
bot=telebot.TeleBot(TOKEN,parse_mode="HTML")

def clamp(x,a,b):return max(a,min(b,x))
def mean(a):return statistics.mean(a) if a else 0
def med(a):return statistics.median(a) if a else 0
def sd(a):return statistics.pstdev(a) if len(a)>1 else 0
def slope(a):
    if len(a)<2:return 0
    y=list(reversed(a));n=len(y);sx=sy=sxy=sxx=0
    for i,v in enumerate(y,1):sx+=i;sy+=v;sxy+=i*v;sxx+=i*i
    d=n*sxx-sx*sx
    return (n*sxy-sx*sy)/d if d else 0
def ema(a,k=.22):
    if not a:return 0
    e=a[-1]
    for v in reversed(a[:-1]):e=v*k+e*(1-k)
    return e
def fetch(limit=200):
    r=requests.get(API,headers={"customer-id":CUSTOMER,"session-id":SESSION,"accept":"application/json"},timeout=15)
    r.raise_for_status();data=r.json();out=[];seen=set()
    for x in data:
        try:c=float(x.get("topCoefficient"))
        except:c=0
        if c<=0:
            vals=x.get("finalValues") if isinstance(x,dict) else None
            if isinstance(vals,list):
                vv=[]
                for v in vals:
                    try:
                        z=float(v)
                        if z>0:vv.append(z)
                    except:pass
                if vv:c=vv[-1]
        if c<=0:continue
        rid=str(x.get("id") or x.get("roundId") or x.get("round_id") or x.get("hash") or c)
        if rid in seen:continue
        seen.add(rid);out.append(round(c if c!=1 else 1.01,2))
        if len(out)>=limit:break
    return out
def feat(a):
    c=[min(x,20) for x in a[:20]];v=sd(c)/max(mean(c),1);sl=slope(a[:10])
    p=[i for i,x in enumerate(a) if x>=10];g=[p[i]-p[i-1] for i in range(1,len(p))]
    return{"mean":mean(c),"ema":ema(c),"vol":v,"slope":sl,"gap":p[0] if p else len(a),"medgap":med(g) or 12,"low":sum(1 for x in a[:10] if x<2)}
def predict(a):
    if len(a)<20:return None
    f=feat(a);raw=f["ema"]*.6+f["mean"]*.3+a[0]*.1
    if f["slope"]>.12:raw*=1.04
    if f["slope"]<-.12:raw*=.97
    margin=.15 if raw<2 else .25 if raw<3 else .35
    base=clamp(raw*(1-margin),1.2,8)
    score=clamp(round(48+min(1.7,f["gap"]/f["medgap"])*14+(1-min(f["vol"],1))*18+f["low"]*1.5),10,96);target=clamp(base*.86,1.35,4.5)
    return round(target,2),int(score),f
@bot.message_handler(commands=["start","signal"])
def signal(m):
    try:
        a=fetch();p=predict(a)
        if not p:return bot.reply_to(m,"⏳ Недостаточно LIVE истории.")
        t,s,f=p
        if s<55:return bot.reply_to(m,f"⏸ <b>{NAME}</b> · ПРОПУСК\nScore {s}/100")
        bot.reply_to(m,f"🎯 <b>{NAME}</b>\nЦель: <b>{t:.2f}X</b>\nScore: <b>{s}/100</b>\nGap 10X: {f['gap']}/{f['medgap']:.1f}\nVol: {f['vol']:.2f}\n📡 LIVE /history\n⚠️ Статистическая оценка, не гарантия.")
    except Exception as e:bot.reply_to(m,f"❌ <code>{e}</code>")
@bot.message_handler(commands=["ping"])
def ping(m):bot.reply_to(m,"✅ "+datetime.now(TZ).strftime("%H:%M:%S"))
if __name__=="__main__":
    try:bot.remove_webhook()
    except:pass
    try:bot.send_message(GROUP_CHAT_ID,f"✅ <b>{NAME}</b> запущен\nНапиши /signal")
    except Exception as e:print(e)
    bot.infinity_polling(skip_pending=True,timeout=30,long_polling_timeout=30)
