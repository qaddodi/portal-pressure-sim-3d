// The keyboard walk over the figure: one real button per drawn vessel, out of sight, in flow order. Tab steps through them (the focused
// vessel is the one highlighted on the figure, so the focus is always seen); the arrows step through the stations, gut to heart (Right on, Left back),
// Shift + arrow follows the flow (as in the 2D app); Enter or Space picks the vessel. The words a screen reader hears are made by walk.ts.
import { useEffect, useRef } from 'react';
import { latest, indexOf } from '../../engine/index.ts';
import { NODES } from '../../engine/hales/portal/topology.js';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { sceneApi, usePick } from '../api.ts';
import { WALK, describe, step, stationStep } from './walk.ts';
import { WALK_ORGANS } from '../../ui/action/walk-organs.ts';
import { selectStructure, useSelection } from '../../ui/action/selection.ts';
import { useShell } from '../../ui/shell/store.ts';
import { enterOn, rovingNext } from './walk-focus.ts';
import { announce } from '../../ui/a11y/announce.ts';
import { useTalkOn } from '../../state/deck.ts';

const NODE_AT = new Map<string, number>((NODES as unknown as ({ id: string } | [string])[]).map((n, i) => [Array.isArray(n) ? n[0] : n.id, i]));

const isOrgan = (id: string) => id.startsWith('organ:');

export function VesselWalk() {
  const root = useRef<HTMLDivElement>(null);
  const talk = useTalkOn();   // (a talk hides the free-play figure's controls from the keyboard and the reader: inert, while its words stay)

  useEffect(() => {
    const el = root.current!;
    const button = (id: string) => el.querySelector<HTMLButtonElement>(`button[data-id="${id}"]`);
    const flowOf = (id: string): number => latest.frame?.Qf[indexOf(id)] ?? 0;
    const tell = (id: string) => {
      const v = WALK.find((x) => x.id === id)!, def = NETWORK_BY_ID.get(id)!;
      const f = latest.frame, n = NODE_AT.get(def.from);
      button(id)?.setAttribute('aria-label', describe(v, f && n !== undefined ? (f.Pf[n] ?? null) : null, f ? flowOf(id) : null));
    };
    const all = () => [...el.querySelectorAll<HTMLButtonElement>('button[data-id]')];
    let focusOnly: string | null = null;   // the vessel the focus lit (a highlight only); Enter turns it into a pick, and only a pick is toggled off
    const onFocusIn = (e: FocusEvent) => {
      const b = e.target as HTMLElement, id = b.dataset?.id;
      if (!id) return;
      for (const x of all()) x.tabIndex = x === b ? 0 : -1;   // (one tab stop into the walk, the arrows move inside it)
      if (!isOrgan(id)) { tell(id); if (usePick.getState().picked !== id) { focusOnly = id; sceneApi.pick(id); } }
    };
    const onFocusOut = (e: FocusEvent) => {
      const id = (e.target as HTMLElement).dataset?.id;
      // focus moving to another vessel of the walk keeps the highlight moving with it; leaving the walk clears it
      if (id && !isOrgan(id) && !(e.relatedTarget instanceof HTMLElement && el.contains(e.relatedTarget)) && usePick.getState().picked === id && focusOnly === id) { focusOnly = null; sceneApi.pick(null); }
    };
    const onKey = (e: KeyboardEvent) => {
      const id = (e.target as HTMLElement).dataset?.id;
      if (!id || e.altKey || e.metaKey || e.ctrlKey) return;
      if (isOrgan(id)) {   // (an organ is a stop at the end of the walk: Enter or Space opens its card, as in 2D)
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = WALK_ORGANS.find((x) => x.id === id)!.sel, cur = useSelection.getState().sel; selectStructure(cur && cur.type === 'organ' && cur.id === o.id ? null : o); }
        return;
      }
      const lin = rovingNext(e.key, all().indexOf(e.target as HTMLButtonElement), all().length);
      if (lin !== null) { e.preventDefault(); all()[lin]?.focus(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) { const to = step(id, e.key === 'ArrowRight' ? 'down' : 'up', flowOf(id)); if (to) button(to)?.focus(); }   // Shift: along the vessel's own flow (2D's older step)
        else { const st = stationStep(all().map((b) => b.dataset.id!), id, e.key === 'ArrowRight' ? 1 : -1); if (st) { const b = button(st.item); b?.focus(); announce(`Station ${st.n} of ${st.of}, ${st.name}.`); } }   // the arrows: the stations, gut to heart
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const next = enterOn(usePick.getState().picked, id, focusOnly === id);
        focusOnly = null; sceneApi.pick(next);
      }
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('focusin', onFocusIn); el.removeEventListener('focusout', onFocusOut); el.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div ref={root} className="lb-walk" inert={talk} role="group" aria-label="Figure: vessels in the order of the flow. Left and right arrows step through the stations; shift with an arrow follows the blood.">
      {WALK.map((v, i) => <button key={v.id} type="button" tabIndex={i === 0 ? 0 : -1} data-id={v.id} aria-label={v.name}>{v.name}</button>)}
      {WALK_ORGANS.map((o) => <button key={o.id} type="button" tabIndex={-1} data-id={o.id} aria-label={`${o.name}. Press Enter for its card.`}>{o.name}</button>)}
    </div>
  );
}
