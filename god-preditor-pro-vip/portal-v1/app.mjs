import {CONFIG} from './config.mjs';

const $=id=>document.getElementById(id),SESSION_KEY='god_portal_v1_session';
const state={session:null,user:null,catalog:null,section:'popular',adminMode:false,busy:false,users:[],counts:{},cursor:null,hasMore:false,images:{},loadGeneration:0};
const titles={popular:['Популярное','Выбирай свою версию Lucky Jet.'],casino:['Казино','Две версии GOD PREDITOR · Lucky Jet.'],admin:['Заявки','Управляй доступом к GOD PREDITOR.']};
const statusNames={pending:'На проверке',approved:'Одобрен',rejected:'Отклонён',revoked:'Доступ отозван'};
const errors={invalid_credentials:'Неверный логин или пароль.',invalid_access_code:'Проверь код доступа, полученный от администратора.',pending:'Заявка ещё находится на проверке.',rejected:'Заявка отклонена. Свяжись с администратором.',revoked:'Доступ отозван. Свяжись с администратором.',rate_limited:'Слишком много попыток. Попробуй немного позже.',invalid_session:'Сеанс завершён. Войди снова.',session_expired:'Сеанс завершён. Войди снова.',unauthorized:'Войди в аккаунт.',forbidden:'У тебя нет доступа к этому разделу.',invalid_request:'Проверь введённые данные.',username_taken:'Этот логин уже занят.',email_taken:'Эта почта уже зарегистрирована.'};
class PortalError extends Error {constructor(code,status,message){super(message||errors[code]||'Не удалось выполнить запрос. Попробуй ещё раз.');this.code=code;this.status=status;}}
function element(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);svg.append(use);return svg;}
function message(id,text,success=false){const n=$(id);n.textContent=text||'';n.classList.toggle('success',success);n.hidden=!text;}
function setBusy(value,form){state.busy=value;for(const b of form.querySelectorAll('button[type=submit]')){b.disabled=value;b.classList.toggle('busy',value);b.querySelector('span').textContent=value?'Подождите…':form.id==='registerForm'?'Отправить заявку':'Войти';}}
function saveSession(){try{if(state.session)sessionStorage.setItem(SESSION_KEY,JSON.stringify({session:state.session,user:state.user}));else sessionStorage.removeItem(SESSION_KEY);}catch{}}
function restoreSession(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(value?.session?.token&&typeof value.session.token==='string'){const expires=Date.parse(value.session.expiresAt);if(!Number.isFinite(expires)||expires>Date.now()){state.session=value.session;state.user=value.user||null;}}}catch{}}
function clearSession(){state.session=null;state.user=null;state.catalog=null;state.users=[];state.cursor=null;state.hasMore=false;saveSession();}
async function api(action,payload={},authenticated=true){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 const headers={'Content-Type':'application/json',apikey:CONFIG.SUPABASE_KEY,Authorization:'Bearer '+CONFIG.EDGE_TOKEN};
 if(authenticated&&state.session?.token)headers['x-portal-session']=state.session.token;
 try{
  const response=await fetch(CONFIG.API_URL,{method:'POST',headers,body:JSON.stringify({action,...payload}),signal:controller.signal,cache:'no-store'});
  let data;try{data=await response.json();}catch{throw new PortalError('unavailable',response.status,'Сервис временно недоступен. Попробуй ещё раз.');}
  if(!response.ok||data.ok===false){const code=String(data.error||'unavailable');throw new PortalError(code,response.status,errors[code]||data.message);}
  return data;
 }catch(error){if(error instanceof PortalError)throw error;throw new PortalError('network',0,'Не удалось соединиться с сервером. Проверь интернет и повтори.');}
 finally{clearTimeout(timeout);}
}
function showAuth(mode='login',text=''){
 $('appView').hidden=true;$('authView').hidden=false;state.adminMode=mode==='admin';
 $('authTabs').hidden=state.adminMode;$('codeField').hidden=state.adminMode;$('adminLogin').hidden=state.adminMode;$('userLogin').hidden=!state.adminMode;
 $('loginForm').hidden=mode==='register';$('registerForm').hidden=mode!=='register';$('pendingPanel').hidden=true;
 $('loginTab').classList.toggle('selected',mode!=='register');$('loginTab').setAttribute('aria-selected',String(mode!=='register'));
 $('registerTab').classList.toggle('selected',mode==='register');$('registerTab').setAttribute('aria-selected',String(mode==='register'));
 $('authKicker').textContent=state.adminMode?'УПРАВЛЕНИЕ ДОСТУПОМ':mode==='register'?'НОВЫЙ АККАУНТ':'ДОБРО ПОЖАЛОВАТЬ';
 $('authTitle').textContent=state.adminMode?'Вход администратора':mode==='register'?'Заявка на доступ':'Вход в GOD PREDITOR';
 $('authDescription').textContent=state.adminMode?'Используй отдельный логин и пароль администратора.':mode==='register'?'Создай аккаунт GOD PREDITOR. Заявку проверит администратор.':'Введи свой логин, пароль и полученный код доступа.';
 message('authMessage',text);document.title='GOD PREDITOR · '+(state.adminMode?'Администратор':mode==='register'?'Заявка':'Личный доступ');
}
function showPending(username,text){showAuth('login');$('loginForm').hidden=true;$('authTabs').hidden=true;$('pendingPanel').hidden=false;$('authKicker').textContent='ЗАЯВКА ПОЛУЧЕНА';$('authTitle').textContent='Спасибо за регистрацию';$('authDescription').textContent='Следующий шаг — одобрение администратора.';$('pendingText').textContent=text||`Заявка ${username} принята. После одобрения администратор передаст код доступа.`;$('loginUsername').value=username;}
function authorized(){return state.session&&state.user&&(state.user.role==='admin'||state.user.status==='approved');}
function setProfile(){const name=state.user?.username||'GOD PREDITOR';$('profileName').textContent=name;$('menuUsername').textContent=name;const admin=state.user?.role==='admin';for(const id of ['adminNav','adminCategory','adminMenu'])$(id).hidden=!admin;}
function showApp(){if(!authorized()){clearSession();showAuth('login');return;}$('authView').hidden=true;$('appView').hidden=false;setProfile();document.title='GOD PREDITOR · Версии Lucky Jet';}
function safeExternal(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function imagePath(item){const key=item.imageKey||item.id,entry=state.images[key];const value=(entry&&typeof entry==='object'?entry.path||entry.file||entry.url:entry)||item.image;
 if(typeof value!=='string')return null;
 try{const url=new URL(value,location.href);if(url.origin!==location.origin||!url.pathname.includes('/assets/'))return null;return url.href;}catch{return null;}}
function renderCatalog(){
 const items=state.catalog?.[state.section]||[];$('catalogGrid').replaceChildren();$('collectionCount').replaceChildren(document.createTextNode(String(items.length).padStart(2,'0')),element('small','',items.length===1?'ВЕРСИЯ':'ВЕРСИИ'));
 if(!items.length){$('catalogGrid').append(element('div','empty-state','Здесь пока нет доступных версий.'));return;}
 items.forEach((item,index)=>{
  if(!safeExternal(item.url))return;
  const a=element('a','game-card');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.dataset.cardId=String(item.id);
  const cover=element('div','card-cover'),fallback=element('div','card-fallback');const brand=element('strong','', 'GOD ');brand.append(element('span','','PREDITOR'));fallback.append(icon('casino'),brand,element('small','','LUCKY JET'));cover.append(fallback);
  const path=imagePath(item);if(path){const img=element('img');img.src=path;img.alt=String(item.title||'Lucky Jet');img.loading=index===0?'eager':'lazy';img.addEventListener('load',()=>fallback.hidden=true,{once:true});img.addEventListener('error',()=>{img.remove();fallback.hidden=false;},{once:true});cover.append(img);}
  cover.append(element('span','card-tag',state.section==='casino'?'CASINO · LUCKY JET':'POPULAR · LUCKY JET'),element('span','card-index',String(index+1).padStart(2,'0')));
  const info=element('div','card-info');info.append(element('span','card-subtitle','GOD PREDITOR'),element('h2','',item.title||'Lucky Jet'));const open=element('div','card-open'),label=element('span','','Открыть версию');label.prepend(element('i'));open.append(label);info.append(open);a.append(cover,info);
  a.addEventListener('click',event=>openVersion(event,item));$('catalogGrid').append(a);
 });
}
async function openVersion(event,item){
 event.preventDefault();let popup=null;try{popup=window.open('about:blank','_blank');if(popup){popup.opener=null;popup.document.title='GOD PREDITOR';popup.document.body.textContent='Открываем версию…';}}catch{}
 try{
  const data=await api('catalog');state.catalog=data.catalog;const all=[...(data.catalog?.popular||[]),...(data.catalog?.casino||[])],current=all.find(x=>x.id===item.id),url=safeExternal(current?.url);
  if(!url)throw new PortalError('unavailable',0,'Эта версия временно недоступна.');
  if(popup)popup.location.replace(url);else location.assign(url);
 }catch(error){try{popup?.close();}catch{};handleAppError(error);}
}
async function loadCatalog(){const data=await api('catalog');if(!data.catalog||!Array.isArray(data.catalog.popular)||!Array.isArray(data.catalog.casino))throw new PortalError('unavailable',0,'Не удалось загрузить версии.');state.catalog=data.catalog;if(state.section!=='admin')renderCatalog();}
function setSection(section){
 if(!authorized())return;
 if(section==='admin'&&state.user.role!=='admin')return;
 state.section=section;for(const b of document.querySelectorAll('[data-section]'))b.classList.toggle('selected',b.dataset.section===section);
 const [title,description]=titles[section]||titles.popular;$('sectionTitle').replaceChildren(document.createTextNode(title),element('span','','✦'));$('sectionDescription').textContent=description;$('collectionCount').hidden=section==='admin';$('adminPanel').hidden=section!=='admin';$('catalogGrid').hidden=section==='admin';$('catalogNote').hidden=section==='admin';
 if($('menuDialog').open)$('menuDialog').close();message('appMessage','');
 if(section==='admin')loadUsers(false).catch(handleAppError);else{if(state.catalog)renderCatalog();else loadCatalog().catch(handleAppError);}
}
function handleAppError(error){
 if(['invalid_session','session_expired','unauthorized','revoked','rejected'].includes(error.code)||error.status===401){clearSession();showAuth('login',error.message);if($('menuDialog').open)$('menuDialog').close();}
 else message('appMessage',error.message||'Не удалось выполнить запрос.');
}
function renderAdminStats(){const labels=[['pending','На проверке'],['approved','Одобрены'],['rejected','Отклонены'],['revoked','Отозваны']];$('adminStats').replaceChildren(...labels.map(([k,label])=>{const box=element('div','admin-stat');box.append(element('span','',label),element('strong','',Number(state.counts[k]||0).toLocaleString('ru-RU')));return box;}));$('pendingBadge').textContent=Number(state.counts.pending||0);}
function renderUsers(){
 $('usersList').replaceChildren();if(!state.users.length){$('usersList').append(element('div','empty-state',$('adminFilter').value==='pending'?'Новых заявок пока нет.':'В этом разделе пока нет пользователей.'));return;}
 for(const user of state.users){
  const row=element('article','user-row');row.dataset.userId=user.id;const avatar=element('span','user-avatar',String(user.username||'?').slice(0,1).toUpperCase()),details=element('div','user-details');details.append(element('h3','',user.username),element('p','',user.email||'Почта не указана'));
  const at=Date.parse(user.createdAt||user.created_at||'');if(Number.isFinite(at)){const date=element('time','',new Date(at).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}));date.dateTime=new Date(at).toISOString();details.append(date);}
  row.append(avatar,details,element('span','status-badge status-'+user.status,statusNames[user.status]||user.status));
  if(user.role!=='admin'){
   const actions=element('div','user-actions');const choices=user.status==='pending'?[['approved','Одобрить','approve'],['rejected','Отклонить','']]:user.status==='approved'?[['revoked','Отозвать доступ','revoke']]:[['approved','Одобрить','approve']];
   for(const[status,label,cls]of choices){const button=element('button',cls,label);button.type='button';button.dataset.action=status;button.addEventListener('click',()=>updateUser(user,status,row));actions.append(button);}row.append(actions);
  }
  $('usersList').append(row);
 }
 if(state.hasMore){const more=element('button','secondary load-more','Загрузить ещё');more.type='button';more.addEventListener('click',()=>loadUsers(true).catch(handleAppError));$('usersList').append(more);}
}
async function loadUsers(append=false){
 if(state.user?.role!=='admin')return;
 const generation=++state.loadGeneration;$('refreshUsers').disabled=true;
 try{
  const payload={status:$('adminFilter').value,limit:50};if(append&&state.cursor)payload.cursor=state.cursor;
  const data=await api('admin_list',payload);if(generation!==state.loadGeneration)return;
  state.users=append?[...state.users,...(data.users||[])]:data.users||[];state.counts=data.counts||{};state.cursor=data.nextCursor||null;state.hasMore=data.hasMore===true;renderAdminStats();renderUsers();
 }finally{if(generation===state.loadGeneration)$('refreshUsers').disabled=false;}
}
async function updateUser(user,status,row){for(const button of row.querySelectorAll('button'))button.disabled=true;message('appMessage','');try{await api('admin_update',{userId:user.id,status});await loadUsers(false);}catch(error){handleAppError(error);for(const button of row.querySelectorAll('button'))button.disabled=false;}}
async function activate(result){
 if(!result.session?.token||!result.user)throw new PortalError('unavailable',0,'Сервис не создал сеанс. Попробуй войти снова.');
 state.session=result.session;state.user=result.user;saveSession();showApp();
 try{await loadCatalog();setSection(state.user.role==='admin'?'admin':'popular');}
 catch(error){handleAppError(error);}
}
async function logout(){try{await api('logout');}catch{}clearSession();if($('menuDialog').open)$('menuDialog').close();showAuth('login');}

$('loginTab').addEventListener('click',()=>showAuth('login'));$('registerTab').addEventListener('click',()=>showAuth('register'));$('adminLogin').addEventListener('click',()=>showAuth('admin'));$('userLogin').addEventListener('click',()=>showAuth('login'));$('backToLogin').addEventListener('click',()=>showAuth('login'));
for(const button of document.querySelectorAll('[data-toggle]'))button.addEventListener('click',()=>{const input=$(button.dataset.toggle),visible=input.type==='password';input.type=visible?'text':'password';button.setAttribute('aria-label',visible?'Скрыть':'Показать');button.setAttribute('aria-pressed',String(visible));});
$('loginForm').addEventListener('submit',async event=>{
 event.preventDefault();if(state.busy)return;message('authMessage','');const username=$('loginUsername').value.trim(),password=$('loginPassword').value;
 if(!username||!password){message('authMessage','Введи логин и пароль GOD PREDITOR.');return;}
 const payload={username,password};if(!state.adminMode)payload.accessCode=$('accessCode').value;
 setBusy(true,event.target);
 try{const result=await api('login',payload,false);$('loginPassword').value='';$('accessCode').value='';await activate(result);}
 catch(error){if(error.code==='pending'){ $('loginPassword').value='';$('accessCode').value='';showPending(username,error.message);}else message('authMessage',error.message);}
 finally{setBusy(false,event.target);}
});
$('registerForm').addEventListener('submit',async event=>{
 event.preventDefault();if(state.busy)return;message('authMessage','');const username=$('registerUsername').value.trim(),email=$('registerEmail').value.trim(),password=$('registerPassword').value;
 if(username.length<3||username.length>64){message('authMessage','Логин должен содержать от 3 до 64 символов.');return;}
 if(!email||!$('registerEmail').validity.valid){message('authMessage','Введи корректный адрес почты.');return;}
 if(password.length<10||password.length>128){message('authMessage','Пароль должен содержать от 10 до 128 символов.');return;}
 if(password!==$('registerConfirm').value){message('authMessage','Пароли не совпадают.');return;}
 setBusy(true,event.target);
 try{const result=await api('register',{username,email,password},false);$('registerPassword').value='';$('registerConfirm').value='';showPending(username,result.message);}
 catch(error){message('authMessage',error.message);}
 finally{setBusy(false,event.target);}
});
document.addEventListener('click',event=>{const section=event.target.closest('[data-section]');if(section)setSection(section.dataset.section);const out=event.target.closest('[data-logout]');if(out)logout();});
for(const id of ['openMenu','bottomAccount'])$(id).addEventListener('click',()=>$('menuDialog').showModal());$('closeMenu').addEventListener('click',()=>$('menuDialog').close());
$('menuDialog').addEventListener('click',event=>{if(event.target===$('menuDialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('menuDialog').close();}});
$('adminFilter').addEventListener('change',()=>loadUsers(false).catch(handleAppError));$('refreshUsers').addEventListener('click',()=>loadUsers(false).catch(handleAppError));
$('refreshApp').addEventListener('click',async()=>{const b=$('refreshApp');b.disabled=true;b.classList.add('spinning');try{const me=await api('me');state.user=me.user;saveSession();setProfile();if(state.section==='admin')await loadUsers(false);else await loadCatalog();message('appMessage','');}catch(error){handleAppError(error);}finally{b.disabled=false;b.classList.remove('spinning');}});
async function refreshMembership(){if(document.hidden||!state.session)return;try{const data=await api('me');state.user=data.user;saveSession();if(!authorized())throw new PortalError('revoked',403,errors.revoked);setProfile();}catch(error){if(error.status===401||['invalid_session','session_expired','revoked','rejected','unauthorized'].includes(error.code))handleAppError(error);}}
document.addEventListener('visibilitychange',refreshMembership);setInterval(refreshMembership,60000);
$('year').textContent=$('appYear').textContent=new Date().getFullYear();
async function start(){
 try{const response=await fetch('./assets/manifest.json',{cache:'no-store'});if(response.ok){const data=await response.json();state.images=data.images||data;}}catch{}
 restoreSession();if(!state.session){showAuth('login');return;}
 try{const me=await api('me');state.user=me.user;saveSession();showApp();await loadCatalog();setSection(state.user.role==='admin'?'admin':'popular');}
 catch(error){clearSession();showAuth('login',error.code==='network'?'Не удалось проверить сеанс. Войди после восстановления связи.':error.message);}
}
start();
