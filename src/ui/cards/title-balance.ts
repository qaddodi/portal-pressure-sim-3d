// The DOM half of the title rule (title-breaks.ts holds the judgement): measure a title's words in its own font, hold it to the width of its best breaks.
import { readBox, readMetric, readStyle } from '../layout-snap.ts';
import { planTitle } from './title-breaks.ts';

/** Every title a card can show: the slide's words title and the opening slide's deck title. */
export const TITLE_SELECTOR = '.pz-h, .pz-dtitle';

/** Let go of the width a title was held to, so it is measured at the room its card gives it. */
export function releaseTitle(ttl: HTMLElement): void {
  ttl.style.removeProperty('max-width');
  ttl.style.removeProperty('text-wrap');
  delete ttl.dataset.tb;
}
export function releaseTitles(root: HTMLElement | null): void {
  root?.querySelectorAll<HTMLElement>(TITLE_SELECTOR).forEach(releaseTitle);
}

/** Hold one title to the width that sets its fewest lines with the best breaks. Judged at the size the title now has (so after the card's long-title step) and in the font it now has. */
export function balanceTitle(ttl: HTMLElement): boolean {
  releaseTitle(ttl);
  // (a title with markup of its own, a page number or a coloured name, keeps the browser's wrap)
  if (ttl.children.length > 0 || !ttl.textContent) return false;
  const cs = readStyle(ttl);
  const layoutW = readMetric(ttl, 'offsetWidth');
  const avail = readMetric(ttl, 'clientWidth') - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  if (!(layoutW > 0) || !(avail > 0)) return false;
  // (a card zoom is a transform: the box's rect is that many times its layout width)
  const k = readBox(ttl).width / layoutW || 1;
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap';
  const text = ttl.textContent, before = readMetric(ttl, 'offsetHeight');
  ttl.appendChild(probe);
  let width = 0;
  try {
    const cache = new Map<string, number>();
    const measure = (s: string): number => {
      let w = cache.get(s);
      if (w === undefined) { probe.textContent = s; w = readBox(probe).width / k; cache.set(s, w); }
      return w;
    };
    width = planTitle(text, measure, avail)?.width ?? 0;
  } finally {
    probe.remove();
  }
  if (!width) return false;
  ttl.style.maxWidth = `${width}px`;
  ttl.style.textWrap = 'wrap';
  ttl.dataset.tb = '1';
  // the browser's own wrap at the held width must not set a line more than the title had (a hyphen or a measure a hair off): then the title is left as it was
  if (readMetric(ttl, 'offsetHeight') > before + 1) { releaseTitle(ttl); return false; }
  return true;
}

export function balanceTitles(root: HTMLElement | null): void {
  root?.querySelectorAll<HTMLElement>(TITLE_SELECTOR).forEach(balanceTitle);
}
