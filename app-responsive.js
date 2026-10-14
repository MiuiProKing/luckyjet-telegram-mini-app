/* Layout only: no changes to feeds, models, licensing, or button actions. */
(() => {
  'use strict';
  const asset = document.currentScript?.src || new URL('app-responsive.js',location.href).href;
  function stylesheet() {
    document.documentElement.classList.add('ap-layout');
    if (document.querySelector('link[data-app-responsive]')) return;
    const link=document.createElement('link');link.rel='stylesheet';link.dataset.appResponsive='';
    link.href=new URL('app-responsive.css?v=20261014-mobile-1',asset).href;document.head.appendChild(link);
  }
  if (window.AppResponsive) {
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',window.AppResponsive.mount,{once:true});else window.AppResponsive.mount();
    return;
  }
  const controls='[data-codex-home-controls],.pro-app-back,#backToCatalog,#globalLanguageSwitcher,.global-theme-host,#allPredictorAdminButton,#appCenterOpen,#ljBeeAiFab,.voice-toggle';
  let observer=null,queued=false;
  function refresh() {
    stylesheet();if(!document.body)return;
    let toolbar=document.getElementById('appResponsiveToolbar');
    const nodes=[...document.querySelectorAll(controls)];
    if(!toolbar&&nodes.length){toolbar=document.createElement('nav');toolbar.id='appResponsiveToolbar';toolbar.setAttribute('aria-label','Управление приложением');document.body.prepend(toolbar)}
    if(toolbar){
      for(const node of nodes)if(node.parentElement!==toolbar&&!nodes.some(parent=>parent!==node&&parent.contains(node)))toolbar.appendChild(node);
      if(document.body.firstElementChild!==toolbar)document.body.prepend(toolbar);
    }
    // Wide archives scroll within their own container, never widen the page.
    for(const table of document.querySelectorAll('table'))if(!table.closest('.ap-table-scroll')){
      const wrapper=document.createElement('div');wrapper.className='ap-table-scroll';wrapper.tabIndex=0;
      wrapper.setAttribute('aria-label','Таблица с горизонтальной прокруткой');table.parentNode.insertBefore(wrapper,table);wrapper.appendChild(table);
    }
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;refresh()})}}
  function start(){refresh();if(!document.body)return;if(observer)observer.disconnect();observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true})}
  window.AppResponsive=Object.freeze({refresh,mount:start});
  stylesheet();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('load',start);
  window.addEventListener('pageshow',refresh);
})();
