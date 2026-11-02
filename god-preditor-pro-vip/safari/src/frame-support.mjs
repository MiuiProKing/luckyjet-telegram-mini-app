export const GAME_ORIGIN = 'https://1play.gamedev-tech.cc';
export const CASINO_ORIGIN = 'https://one-vv3016.com';
const READY = 'gp-frame-ready-v1', STATE = 'gp-parent-state-v1';
// State-only bridge. It never carries a button selector, command or wager.
export function installFrameSupport(win, onReady = () => {}, getProbes = () => []) {
  let parentSeenAt = 0, parentReady = false;
  const framed = win !== win.top;
  if (framed && win.location.origin !== GAME_ORIGIN) return {invalidate() {parentReady = false;}, ready: () => false};
  function message(event) {
    if (framed) {
      if (event.source !== win.top || event.origin !== CASINO_ORIGIN || event.data?.type !== STATE) return;
      parentSeenAt = Date.now(); parentReady = event.data.ready === true;
    } else {
      if (event.origin !== GAME_ORIGIN || event.data?.type !== READY) return;
      const frame = [...win.document.querySelectorAll('iframe')].find(f => f.contentWindow === event.source && new URL(f.src, win.location.href).origin === GAME_ORIGIN);
      if (!frame) return;
      const rect = frame.getBoundingClientRect(), x = rect.left + rect.width/2, y = rect.top + rect.height/2;
      const probes = Array.isArray(event.data.probes) ? event.data.probes.slice(0,2) : [];
      const pointsVisible = probes.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= frame.clientWidth && p.y <= frame.clientHeight && win.document.elementFromPoint(rect.left + (p.x+frame.clientLeft)*rect.width/frame.offsetWidth, rect.top + (p.y+frame.clientTop)*rect.height/frame.offsetHeight) === frame);
      const ready = !win.document.hidden && rect.width > 0 && rect.height > 0 && win.document.elementFromPoint(x,y) === frame && pointsVisible;
      event.source.postMessage({type: STATE, ready}, GAME_ORIGIN);
      onReady();
    }
  }
  win.addEventListener('message', message);
  const timer = framed ? win.setInterval(() => win.top.postMessage({type: READY, probes: getProbes()}, CASINO_ORIGIN), 500) : null;
  return {invalidate() {parentReady = false;}, ready: () => !framed || (parentReady && Date.now()-parentSeenAt < 1600),
    stop() {win.removeEventListener('message', message); if (timer) win.clearInterval(timer);}};
}
