// The 2D app's "thumb" layout (main.js `thumbMQ`): a screen up to 1100 px wide and held upright keeps two corner chips on top and Treat, Tests, Search, Layers and Settings in a tab row
// at the foot of the dock. A phone held sideways is wider than that and has the laptop's bar, compacted by the 2D stylesheet's own breakpoints.
import { useSyncExternalStore } from 'react';

export const THUMB_MQ = '(max-width: 1100px) and (orientation: portrait)';
export const isThumb = (): boolean => typeof matchMedia === 'function' && matchMedia(THUMB_MQ).matches;
function subscribe(cb: () => void) {
  const m = matchMedia(THUMB_MQ);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
export const useThumb = (): boolean => useSyncExternalStore(subscribe, isThumb, () => false);
