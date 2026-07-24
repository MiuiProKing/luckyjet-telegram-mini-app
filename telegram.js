(() => {
  "use strict";
  const webApp = window.Telegram && window.Telegram.WebApp;
  const creatorUrl = "https://t.me/V0xFF3";

  function addInterfaceFixes(){
    if(document.getElementById("miniAppInterfaceFixes")) return;
    const style=document.createElement("style");
    style.id="miniAppInterfaceFixes";
    style.textContent=`
      #appCreatorCredit{display:flex;align-items:center;justify-content:center;gap:6px;width:fit-content;max-width:calc(100% - 24px);margin:18px auto 4px;padding:10px 15px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.78);text-decoration:none;font-size:13px;font-weight:700;box-shadow:0 8px 22px rgba(0,0,0,.24)}
      #appCreatorCredit strong{color:#7aa7ff;font-weight:900}.app-tabs{overflow:hidden!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
      .app-tabs .app-tab{position:relative!important;width:100%!important;min-width:0!important;max-width:none!important;height:100%!important;padding:0 10px!important;margin:0!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;white-space:nowrap!important;font-size:13px!important;letter-spacing:1.3px!important}
      .app-tabs .app-tab[data-app-tab="pro"]{color:#ffe27a!important;border:1px solid rgba(250,204,21,.72)!important;background:linear-gradient(135deg,rgba(250,204,21,.16),rgba(249,115,22,.12))!important;text-shadow:0 0 10px rgba(250,204,21,.8)!important;box-shadow:inset 0 0 18px rgba(250,204,21,.08),0 0 16px rgba(250,204,21,.16)!important;animation:proAttention 1.8s ease-in-out infinite!important}
      .app-tabs .app-tab[data-app-tab="pro"].active{color:#1d1200!important;border-color:#fff0a6!important;background:linear-gradient(135deg,#fde047,#fb923c)!important;text-shadow:none!important;box-shadow:0 7px 20px rgba(250,204,21,.48)!important;animation:none!important}
      .beta-classic-card{position:relative!important;border:1px solid rgba(251,146,60,.72)!important;background:linear-gradient(145deg,#231033,#3b173c 48%,#592517)!important;box-shadow:0 14px 35px rgba(249,115,22,.22),inset 0 0 25px rgba(168,85,247,.13)!important;overflow:hidden!important}
      .beta-ai-card{position:relative!important;border:1px solid rgba(34,211,238,.8)!important;background:linear-gradient(145deg,#071725,#11143d 48%,#2e1065)!important;box-shadow:0 16px 42px rgba(34,211,238,.24),inset 0 0 32px rgba(139,92,246,.18)!important;overflow:hidden!important}
      .beta-ai-card::after{content:"24/7";position:absolute;right:10px;bottom:9px;z-index:5;padding:4px 8px;border-radius:999px;background:rgba(6,182,212,.2);border:1px solid rgba(103,232,249,.48);color:#a5f3fc;font-size:10px;font-weight:900;letter-spacing:.12em}
      .beta-ai-card .card-art{filter:saturate(1.35) hue-rotate(145deg) brightness(.58)!important}.beta-ai-card .pro-badge{background:linear-gradient(135deg,#22d3ee,#8b5cf6)!important;color:#fff!important}.beta-ai-card .card-name{color:#ecfeff!important}.beta-ai-card .card-studio{color:#a5f3fc!important}
      @keyframes proAttention{0%,100%{filter:brightness(1);transform:scale(1)}50%{filter:brightness(1.25);transform:scale(1.015)}}
      @media(prefers-reduced-motion:reduce){.app-tabs .app-tab[data-app-tab="pro"]{animation:none!important}}
    `;
    document.head.appendChild(style);
  }

  function addCreatorCredit(){
    if(document.getElementById("appCreatorCredit")) return;
    const host=document.querySelector(".catalog-shell"); if(!host) return;
    const credit=document.createElement("a"); credit.id="appCreatorCredit"; credit.href=creatorUrl; credit.target="_blank"; credit.rel="noopener noreferrer";
    credit.innerHTML="<span>Создатель приложения:</span><strong>@V0xFF3</strong>";
    credit.addEventListener("click",e=>{e.preventDefault();try{if(webApp&&typeof webApp.openTelegramLink==="function"){webApp.openTelegramLink(creatorUrl);return}}catch{}window.open(creatorUrl,"_blank")});
    host.appendChild(credit);
  }

  function improveProButton(){const b=document.querySelector('.app-tab[data-app-tab="pro"]');if(b){b.textContent="⚡ PRO";b.setAttribute("aria-label","Открыть PRO режим")}}

  function makeCard({key,cls,badge,name,studio,file,aria}){
    if(document.querySelector(`[data-open-pro="${key}"]`)) return;
    const grid=document.querySelector(".pro-grid"); if(!grid) return;
    const card=document.createElement("button"); card.className=`game-card has-art ${cls}`; card.type="button"; card.dataset.openPro=key; card.setAttribute("aria-label",aria);
    card.innerHTML=`<img class="card-art" src="pro-luckyjet.jpg" alt="${name}"><span class="pro-badge">${badge}</span><span class="card-copy"><span class="card-name">${name}</span><span class="card-studio">${studio}</span></span>`;
    card.addEventListener("click",()=>{window.location.href=file}); grid.appendChild(card);
  }

  function addProCards(){
    makeCard({key:"luckyjet-beta-classic",cls:"beta-classic-card",badge:"CLASSIC",name:"LUCKY JET BETA",studio:"CLASSIC LOGIC • ORIGINAL API",file:"beta-classic.html",aria:"Open Lucky Jet Beta Classic"});
    makeCard({key:"luckyjet-beta-ai",cls:"beta-ai-card",badge:"AI 🤖",name:"BETA AI",studio:"24/7 SERVER ANALYSIS • HISTORY",file:"beta-ai.html",aria:"Open Lucky Jet Beta AI"});
    const subtitle=document.querySelector(".pro-subtitle"); if(subtitle) subtitle.textContent="LIVE-анализаторы и BETA AI 24/7. Выберите нужную версию.";
  }

  function prepare(){addInterfaceFixes();addCreatorCredit();improveProButton();addProCards()}
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",prepare,{once:true}); else prepare();
  if(!webApp) return;
  document.documentElement.classList.add("telegram-mini-app");
  try{webApp.ready();webApp.expand();if(typeof webApp.disableVerticalSwipes==="function")webApp.disableVerticalSwipes()}catch{}
  const nativeOpen=window.open.bind(window);
  window.open=(url,target,features)=>{if(typeof url==="string"&&/^https?:\/\//i.test(url)&&typeof webApp.openLink==="function"){try{webApp.openLink(url);return{closed:false,close(){}}}catch{}}return nativeOpen(url,target,features)};
})();
