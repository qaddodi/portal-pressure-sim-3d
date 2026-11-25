// The browser's own page zoom is allowed everywhere except on the figure (WCAG 1.4.4, F14 of the independent review). The viewport no longer forbids scaling (index.html),
// a pinch on a card, a sheet or the bars zooms the page as the person asked, and Ctrl/⌘ + / − / 0 is the browser's accessibility zoom, left to the person.
// On the figure a pinch, a double tap and a trackpad pinch zoom the FIGURE (scene/gesture/controller.ts), never Safari's page, so the document says no itself, there only
// (iOS Safari ignores `user-scalable` anyway, so this was always the real lock):
//  - gesturestart/change/end (Safari's pinch events, on iOS and on a Mac trackpad) are cancelled when the pinch is on the figure;
//  - a touch with two fingers on the figure is not given to the browser to zoom (touchmove cancelled; a one-finger touch is left alone, so taps, scrolls and sliders keep working);
//  - Ctrl/⌘ + wheel (a Mac trackpad pinch in Chrome and Firefox, and Ctrl + scroll) over the figure is cancelled; the figure's own wheel handler still sees it;
//  - a double tap does not zoom the page anywhere: `touch-action: manipulation` on the body (global.css), and the figure's canvas takes no touch gesture at all
//    (`touch-action: none` on it, global.css), which keeps the double-tap-and-slide zoom, the hold-then-drag tilt and the absence of iOS's magnifier;
//  - selectstart is cancelled except in a field made for typing (SELECTABLE): no loupe or callout on the figure, the bars or a card.
// SELECTABLE is the selector list of global.css, written once more here for `closest`; tests/ui-no-select.test.ts fails when the two differ.
/** The figure's stage (scene/Stage.tsx): what a gesture on it is the figure's. */
export const FIGURE = '.stage-root';
export const SELECTABLE = 'input, textarea, [contenteditable=""], [contenteditable="true"], .selectable';

export function installNoPageZoom(doc: Document = document): () => void {
  const off: (() => void)[] = [];
  const on = <E extends Event>(type: string, fn: (e: E) => void) => {
    doc.addEventListener(type, fn as EventListener, { capture: true, passive: false });
    off.push(() => doc.removeEventListener(type, fn as EventListener, { capture: true } as EventListenerOptions));
  };
  const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  const hostOf = (target: EventTarget | null): Element | null => { const t = target as Node | null; return t && 'closest' in t ? (t as Element) : (t?.parentElement ?? null); };
  const onFigure = (e: Event) => !!hostOf(e.target)?.closest?.(FIGURE);
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) on(t, (e) => { if (onFigure(e)) stop(e); });
  on<TouchEvent>('touchmove', (e) => { if (e.touches.length > 1 && onFigure(e)) stop(e); });
  on<WheelEvent>('wheel', (e) => { if (e.ctrlKey && onFigure(e)) stop(e); });
  // Text is selectable only where a person types (owner, rule 12): iOS's selection loupe and callout come from a double tap and hold on a label or a card, so a selection never starts anywhere else.
  on<Event>('selectstart', (e) => {
    const host = hostOf(e.target);
    if (!host?.closest?.(SELECTABLE)) stop(e);
  });
  return () => { off.forEach((f) => f()); };
}
