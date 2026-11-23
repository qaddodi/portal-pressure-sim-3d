// "Add shunt" (the card button, 2D: startShunt in stage-hover.js): from the selected vessel, the vessels it can be joined to light up, and a tap on one makes it
// (TIPS, DIPS, portocaval, distal splenorenal, mesocaval or a custom shunt between the two stations), says "<name> created." and selects the new vessel. A tap on nothing, Esc or Cancel calls it off
// ("Shunt canceled."). The card is put away while it waits (2D: a card is not shown while shunting) and comes back when it is called off. No hint card says what to tap (no tutorial popups, owner 22 Nov): the lit vessels are the cue. Registered as the 'shunt' feature by startShunting().
import { create } from 'zustand';
import { clock } from '../../clock/frame.ts';
import { D_FLIP, EASE_ARRIVE } from '../motion.ts';
import { registerFeature } from '../shell/features.ts';
import { useShell } from '../shell/store.ts';
import { sceneApi } from '../../scene/api.ts';
import { useSelection, selectStructure, holdScenePicks } from './selection.ts';
import { currentParams, updateParams } from './params.ts';
import { setLayer, clearLayer } from '../../scene/intent.ts';
import { figurePlaces, shuntChange, shuntTargets } from './shunt-model.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { SHUNT_WORDS, SHUNT_CREATED } from './shunt-words.copied.ts';
import type { ShuntRule } from './shunt-rules.copied.ts';

export interface Shunting { src: string; only: string | null; targets: ReadonlyMap<string, ShuntRule> }
/** The shunt waiting for its target (null when none). */
export const useShunting = create<{ now: Shunting | null }>(() => ({ now: null }));

let release: (() => void)[] = [];
function end(): void { for (const f of release) f(); release = []; useShunting.setState({ now: null }); clearLayer('tool'); sceneApi.shunt.guide(null, 0, 0, ''); sceneApi.shunt.hover(null); }

/** Call the shunt off (Esc, Cancel, a tap on nothing): the vessel it started from is selected again, as 2D leaves it. */
export function cancelShunt(silent = false): void {
  const s = useShunting.getState().now;
  if (!s) return;
  end();
  selectStructure({ type: 'edge', id: s.src });
  if (!silent) useShell.getState().say(SHUNT_WORDS.canceled);
}

/** A tap landed on target `id`: make the shunt, select it. */
function drop(id: string): void {
  const s = useShunting.getState().now, r = s?.targets.get(id);
  if (!s || !r) return;
  end();
  const c = shuntChange(r, currentParams());
  updateParams(c.edit, { label: c.label });
  useShell.getState().say(SHUNT_CREATED(r.label));
  selectStructure({ type: 'edge', id: c.select });
}

/** While a shunt waits (2D stage-hover.js shuntMove): a dashed line from the vessel it starts at follows the pointer, in the accent colour and in the danger colour over a vessel it cannot join; the target under the pointer
 *  stands out and its name for the shunt it would make ("Distal splenorenal shunt") follows the pointer. Written once a frame by the clock, in transforms and opacity only (the line is drawn by the scene). */
function aim(src: string, targets: ReadonlyMap<string, ShuntRule>): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const tip = document.createElement('div');
  tip.className = 'shunt-aim';
  tip.setAttribute('aria-hidden', 'true');
  tip.style.cssText = `position:fixed;left:0;top:0;z-index:60;pointer-events:none;opacity:0;white-space:nowrap;padding:3px 9px;border-radius:9px;font:600 var(--t-lab)/1.3 var(--ui);color:var(--accent);background:var(--surface, #fff);box-shadow:0 1px 6px rgba(0,0,0,.25);will-change:transform,opacity;transition:opacity ${D_FLIP}ms ${EASE_ARRIVE};`;
  document.body.append(tip);
  const cs = getComputedStyle(document.documentElement), look = LOOKS[(document.documentElement.dataset.look as LookId) in LOOKS ? (document.documentElement.dataset.look as LookId) : 'light'],   // (a token the page has not set yet falls back to the look's own, never a fixed blue or red)
    accent = cs.getPropertyValue('--accent').trim() || look.accent, danger = cs.getPropertyValue('--danger').trim() || look.danger;
  let at: { x: number; y: number } | null = null, hover: string | null = null, word = '', done = '';
  const move = (e: PointerEvent) => { if (e.pointerType === 'touch') return; at = { x: e.clientX, y: e.clientY }; clock.invalidate('shunt-aim'); };
  const leave = () => { at = null; clock.invalidate('shunt-aim'); };
  window.addEventListener('pointermove', move, true);
  document.documentElement.addEventListener('pointerleave', leave);
  const off = clock.on('tween', () => {
    const key = at ? `${Math.round(at.x)}|${Math.round(at.y)}` : '';
    if (key === done) return;   // (nothing moved: nothing is asked for, so the figure rests)
    done = key;
    if (!at) { sceneApi.shunt.guide(null, 0, 0, ''); if (hover) { hover = null; sceneApi.shunt.hover(null); } tip.style.opacity = '0'; return; }
    const over = sceneApi.shunt.vesselAt(at.x, at.y), ok = over != null && targets.has(over), bad = over != null && !ok && over !== src;
    if ((ok ? over : null) !== hover) { hover = ok ? over : null; sceneApi.shunt.hover(hover); }
    sceneApi.shunt.guide(src, at.x, at.y, bad ? danger : accent);
    if (ok) { const l = targets.get(over!)!.label; if (l !== word) { word = l; tip.textContent = l; } tip.style.opacity = '1'; } else tip.style.opacity = '0';
    tip.style.transform = `translate3d(${Math.round(at.x + 14)}px, ${Math.round(at.y - 30)}px, 0)`;
  }, 6);
  return () => { window.removeEventListener('pointermove', move, true); document.documentElement.removeEventListener('pointerleave', leave); off(); tip.remove(); };
}

/** Start a shunt from vessel `src` (the selected one by default); false when there is nowhere to connect it. `only` limits it to one kind ('tips'). */
export function startShunt(src?: string, o: { only?: string | null } = {}): boolean {
  const sel = useSelection.getState().sel;
  const from = src ?? (sel?.type === 'edge' ? sel.id : null);
  if (!from) return false;
  cancelShunt(true);
  const targets = shuntTargets(from, figurePlaces(), o.only ?? null);
  if (!targets.size) { useShell.getState().say(SHUNT_WORDS.none); return false; }
  // the card goes while the shunt waits; the targets glow; the scene's taps are the shunt's now
  selectStructure(null);
  setLayer('tool', { marked: [...targets.keys()] });
  useShunting.setState({ now: { src: from, only: o.only ?? null, targets } });
  release.push(holdScenePicks((id) => {
    if (id && targets.has(id)) drop(id);
    else if (!id) cancelShunt();
    else setLayer('tool', { marked: [...targets.keys()] });   // (another vessel: nothing happens, the targets stay lit)
  }));
  release.push(aim(from, targets));
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancelShunt(); } };
  window.addEventListener('keydown', esc, true);
  release.push(() => window.removeEventListener('keydown', esc, true));
  return true;
}

/** Registers the Add shunt button's work; returns the remover. */
export function startShunting(): () => void {
  const off = registerFeature('shunt', () => { startShunt(); });
  return () => { off(); end(); };
}
