// The browser's own page zoom is never wanted: a pinch, a double tap or a trackpad pinch zooms the figure (scene/gesture/controller.ts), never Safari's page.
// iOS Safari ignores `user-scalable=no` in the viewport, so the page says no itself, on the whole document (a card, a menu or the dock, not only the figure's canvas):
//  - gesturestart/change/end (Safari's pinch events, on iOS and on a Mac trackpad) are cancelled;
//  - a touch with two fingers is not given to the browser to zoom (touchmove cancelled; a one-finger touch is left alone, so taps, scrolls and sliders keep working);
//  - Ctrl/⌘ + wheel (a Mac trackpad pinch in Chrome and Firefox, and Ctrl + scroll) is cancelled. The figure's own wheel handler still sees it (nothing here stops it travelling);
//  - a double tap does not zoom: `touch-action: manipulation` on the body (global.css) and on the figure's canvas, which takes no double-tap zoom and leaves every tap a tap (no tap is ever swallowed).
// The keyboard's Ctrl/⌘ + / − / 0 is the browser's accessibility zoom and is left to the person.
export function installNoPageZoom(doc: Document = document): () => void {
  const off: (() => void)[] = [];
  const on = <E extends Event>(type: string, fn: (e: E) => void) => {
    doc.addEventListener(type, fn as EventListener, { capture: true, passive: false });
    off.push(() => doc.removeEventListener(type, fn as EventListener, { capture: true } as EventListenerOptions));
  };
  const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) on(t, stop);
  on<TouchEvent>('touchmove', (e) => { if (e.touches.length > 1) stop(e); });
  on<WheelEvent>('wheel', (e) => { if (e.ctrlKey) stop(e); });
  return () => { off.forEach((f) => f()); };
}
