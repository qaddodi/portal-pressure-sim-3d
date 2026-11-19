// A line for a screen reader only (2D util.js announce): written into one visually hidden live region.
let el: HTMLElement | null = null;
export function announce(text: string): void {
  if (typeof document === 'undefined') return;
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    document.body.append(el);
  }
  el.textContent = '';
  el.textContent = text;
}
