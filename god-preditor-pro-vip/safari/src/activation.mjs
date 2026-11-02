// iOS may suppress compatibility click after a captured drag. Activate on
// trusted pointer-up, suppress its later click, keep keyboard activation.
export function activate(button, action) {
  let pointer = null, suppressUntil = 0;
  button.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.button !== 0 || button.disabled) return;
    event.preventDefault();
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointerup', event => {
    if (!event.isTrusted || !pointer || pointer.id !== event.pointerId) return;
    const start = pointer; pointer = null; suppressUntil = Date.now() + 700;
    const rect = button.getBoundingClientRect();
    if (!button.disabled && Math.hypot(event.clientX-start.x, event.clientY-start.y) < 12 &&
        event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) action(event);
  });
  button.addEventListener('pointercancel', () => {pointer = null;});
  button.addEventListener('lostpointercapture', () => {pointer = null;});
  button.addEventListener('click', event => {
    if (Date.now() < suppressUntil) {event.preventDefault(); event.stopImmediatePropagation(); return;}
    if (event.isTrusted && !button.disabled && event.detail === 0) action(event);
  });
}
