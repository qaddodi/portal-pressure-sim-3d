// Whether background downloads should wait: the person asked the browser to save data (Save-Data, Chrome's Data Saver) or the link is 2g. Read from the Network Information API where it exists;
// Safari has none (an iPhone's Low Data Mode is not visible to a page), and there nothing is skipped. Used by the offline fill (src/pwa/register.ts; the worker has the same test, scripts/pwa.mjs `lowData`)
// and the preload ladder (src/boot/warm.ts).
export interface Connection { saveData?: boolean; effectiveType?: string }
declare global { interface Navigator { connection?: Connection } }   // (not in the DOM types: Chrome and Android browsers have it, Safari does not)
export const lowData = (c: Connection | undefined = typeof navigator === 'undefined' ? undefined : navigator.connection): boolean =>
  !!c && (c.saveData === true || /^(slow-)?2g$/.test(c.effectiveType ?? ''));
