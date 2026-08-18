const LJ_API_STATE='https://crash-gateway-grm-cr.100hp.app/state';
const LJ_CUSTOMER_ID='077dee8d-c923-4c02-9bee-757573662e69';
window.LJ={
 session(){let s=localStorage.getItem('LJ_SESSION_ID')||'';if(!s){s=(prompt('Введите LuckyJet session-id:')||'').trim();if(s)localStorage.setItem('LJ_SESSION_ID',s)}return s},
 reset(){localStorage.removeItem('LJ_SESSION_ID');location.reload()},
 coef(v){v=Number(v);if(!Number.isFinite(v)||v<=0)return null;if(v===1)v=1.01;return Math.round(v*100)/100},
 async state(){const sid=this.session();if(!sid)throw new Error('session-id не указан');const r=await fetch(LJ_API_STATE,{headers:{'customer-id':LJ_CUSTOMER_ID,'session-id':sid,'accept':'application/json'},cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()},
 setStatus(text,ok){const b=document.getElementById('apiBox'),t=document.getElementById('apiText');if(b)b.className='status '+(ok?'ok':'bad');if(t)t.textContent=text},
 async latest(){const d=await this.state();const a=Array.isArray(d.stopCoefficients)?d.stopCoefficients:[];return a.length?this.coef(a[0]):null}
};