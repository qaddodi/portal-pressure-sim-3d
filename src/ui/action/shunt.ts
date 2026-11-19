// "Add shunt" (the card button, 2D: startShunt in stage-hover.js): from the selected vessel, the vessels it can be joined to light up, a hint card says what each makes, and a tap on one makes it
// (TIPS, DIPS, portocaval, distal splenorenal, mesocaval or a custom shunt between the two stations), says "<name> created." and selects the new vessel. A tap on nothing, Esc or Cancel calls it off
// ("Shunt canceled."). The card is put away while it waits (2D: a card is not shown while shunting) and comes back when it is called off. Registered as the 'shunt' feature by startShunting().
import { create } from 'zustand';
import { registerFeature } from '../shell/features.ts';
import { useShell } from '../shell/store.ts';
import { sceneApi } from '../../scene/api.ts';
import { useSelection, selectStructure, holdScenePicks } from './selection.ts';
import { currentParams, updateParams } from './params.ts';
import { figurePlaces, shuntChange, shuntTargets } from './shunt-model.ts';
import { SHUNT_WORDS, SHUNT_CREATED } from './shunt-words.copied.ts';
import type { ShuntRule } from './shunt-rules.copied.ts';

export interface Shunting { src: string; only: string | null; targets: ReadonlyMap<string, ShuntRule> }
/** The shunt waiting for its target (null when none): the hint card reads it. */
export const useShunting = create<{ now: Shunting | null }>(() => ({ now: null }));

let release: (() => void)[] = [];
function end(): void { for (const f of release) f(); release = []; useShunting.setState({ now: null }); sceneApi.markVessels([]); }

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
  sceneApi.markVessels([...targets.keys()]);
  useShunting.setState({ now: { src: from, only: o.only ?? null, targets } });
  release.push(holdScenePicks((id) => {
    if (id && targets.has(id)) drop(id);
    else if (!id) cancelShunt();
    else sceneApi.markVessels([...targets.keys()]);   // (another vessel: nothing happens, the targets stay lit)
  }));
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancelShunt(); } };
  window.addEventListener('keydown', esc, true);
  release.push(() => window.removeEventListener('keydown', esc, true));
  return true;
}

/** Registers the Add shunt button's work; returns the remover. */
export function startShunting(): () => void {
  const off = registerFeature('shunt', () => { startShunt(); });
  // the hint card: its own small root (the shell has no slot for it), made once the first shunt asks for it
  let root: { unmount(): void } | null = null, host: HTMLElement | null = null;
  const unsub = useShunting.subscribe((s, prev) => {
    if (!s.now || prev.now || root || typeof document === 'undefined') return;
    void Promise.all([import('react-dom/client'), import('./ShuntHint.tsx'), import('react')]).then(([{ createRoot }, { ShuntHint }, { createElement }]) => {
      if (root) return;
      host = document.createElement('div'); document.body.append(host);
      const r = createRoot(host); r.render(createElement(ShuntHint)); root = r;
    });
  });
  return () => { off(); unsub(); end(); root?.unmount(); host?.remove(); root = null; };
}
