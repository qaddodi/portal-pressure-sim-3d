// The ?geom=net corner badge: says which mesh the page is drawing, so a tester who sees no difference (the network meshes are meant to look like today's tubes at rest) can still tell. "Mesh: network" once the
// network figure is in, "Mesh: fallback (reason)" when it is not (files missing, baked from another skeleton, an error), "Mesh: loading network" meanwhile. Only ever made under ?geom=net (scene.ts mountNet), so
// the default page builds no element. It fades by a CSS animation on opacity (no timer, no script per frame); each new state is a new element, so the animation starts again.
export type NetBadgeState = 'loading' | 'network' | 'fallback';
export interface NetBadge { state: NetBadgeState; text: string }

const STYLE_ID = 'net-badge-style', BADGE_ID = 'net-badge';
const CSS = `@keyframes net-badge-fade{0%{opacity:0}5%{opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes net-badge-stay{0%{opacity:0}2%{opacity:1}92%{opacity:1}100%{opacity:0}}
#${BADGE_ID}{position:fixed;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));z-index:2147483000;pointer-events:none;max-width:min(92vw,40em);overflow-wrap:anywhere;
padding:5px 9px;border-radius:7px;font:600 12px/1.3 -apple-system,system-ui,sans-serif;color:#fff;background:rgba(24,24,28,.82);border-left:4px solid var(--nb,#888);opacity:0;animation:net-badge-fade 12s ease-in-out forwards}`;

let last: NetBadge | null = null;
/** What the badge last said (for the tests and the debug page). */
export const netBadge = (): NetBadge | null => last;

/** The words for a state: the fallback names its reason, trimmed so the badge stays a corner note. */
export function netBadgeText(state: NetBadgeState, why = ''): string {
  if (state === 'network') return 'Mesh: network';
  if (state === 'loading') return 'Mesh: loading network';
  const w = why.replace(/\s+/g, ' ').trim();
  return `Mesh: fallback${w ? ` (${w.length > 420 ? `${w.slice(0, 417)}...` : w})` : ''}`;
}

/** Shows the state in the corner (a no-op without a document: a test or a script reads `netBadge()` instead). */
export function showNetBadge(state: NetBadgeState, why = ''): void {
  last = { state, text: netBadgeText(state, why) };
  if (typeof document === 'undefined') return;
  if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); }
  document.getElementById(BADGE_ID)?.remove();
  const el = document.createElement('div');
  el.id = BADGE_ID; el.setAttribute('role', 'status'); el.textContent = last.text;
  if (state === 'fallback') el.style.animation = 'net-badge-stay 60s ease-in-out forwards';   // (a fallback stays up a minute: its reason is the point)
  el.style.setProperty('--nb', state === 'network' ? '#3fb27f' : state === 'loading' ? '#8a8f98' : '#e8913a');
  document.body.appendChild(el);
}
