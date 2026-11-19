// The keyboard walk over the figure: one real button per drawn vessel, out of sight, in flow order. Tab steps through them (the focused
// vessel is the one highlighted on the figure, so the focus is always seen); the arrows follow the flow (Right downstream, Left upstream, as in
// the 2D app); Enter or Space picks the vessel. The words a screen reader hears are made by walk.ts.
import { useEffect, useRef } from 'react';
import { latest, indexOf } from '../../engine/index.ts';
import { NODES } from '../../engine/hales/portal/topology.js';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { sceneApi, usePick } from '../api.ts';
import { WALK, describe, step } from './walk.ts';
import { WALK_ORGANS } from '../../ui/action/walk-organs.ts';
import { selectStructure, useSelection } from '../../ui/action/selection.ts';

const NODE_AT = new Map<string, number>((NODES as unknown as ({ id: string } | [string])[]).map((n, i) => [Array.isArray(n) ? n[0] : n.id, i]));

const isOrgan = (id: string) => id.startsWith('organ:');

export function VesselWalk() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const button = (id: string) => el.querySelector<HTMLButtonElement>(`button[data-id="${id}"]`);
    const flowOf = (id: string): number => latest.frame?.Qf[indexOf(id)] ?? 0;
    const tell = (id: string) => {
      const v = WALK.find((x) => x.id === id)!, def = NETWORK_BY_ID.get(id)!;
      const f = latest.frame, n = NODE_AT.get(def.from);
      button(id)?.setAttribute('aria-label', describe(v, f && n !== undefined ? (f.Pf[n] ?? null) : null, f ? flowOf(id) : null));
    };
    const onFocusIn = (e: FocusEvent) => { const id = (e.target as HTMLElement).dataset?.id; if (id && !isOrgan(id)) { tell(id); sceneApi.pick(id); } };
    const onFocusOut = (e: FocusEvent) => {
      const id = (e.target as HTMLElement).dataset?.id;
      // focus moving to another vessel of the walk keeps the highlight moving with it; leaving the walk clears it
      if (id && !isOrgan(id) && !(e.relatedTarget instanceof HTMLElement && el.contains(e.relatedTarget)) && usePick.getState().picked === id) sceneApi.pick(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const id = (e.target as HTMLElement).dataset?.id;
      if (!id || e.altKey || e.metaKey || e.ctrlKey) return;
      if (isOrgan(id)) {   // (an organ is a stop at the end of the walk: Enter or Space opens its card, as in 2D)
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = WALK_ORGANS.find((x) => x.id === id)!.sel, cur = useSelection.getState().sel; selectStructure(cur && cur.type === 'organ' && cur.id === o.id ? null : o); }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const to = step(id, e.key === 'ArrowRight' ? 'down' : 'up', flowOf(id));
        if (to) { e.preventDefault(); button(to)?.focus(); }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sceneApi.pick(usePick.getState().picked === id ? null : id);
      }
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('focusin', onFocusIn); el.removeEventListener('focusout', onFocusOut); el.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div ref={root} className="lb-walk" role="group" aria-label="Figure: vessels in the order of the flow. Left and right arrows follow the blood.">
      {WALK.map((v) => <button key={v.id} type="button" data-id={v.id} aria-label={v.name}>{v.name}</button>)}
      {WALK_ORGANS.map((o) => <button key={o.id} type="button" data-id={o.id} aria-label={`${o.name}. Press Enter for its card.`}>{o.name}</button>)}
    </div>
  );
}
