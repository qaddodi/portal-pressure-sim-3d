// Edit shapes: the state of the mode and how an edit is laid over the scene. Off (the default) nothing here touches the scene; on, the saved edits are applied, and turning it off puts every
// course, depth and organ back as the source shapes have them. The edits live on the device (localStorage) until the owner copies them out.
import { create } from 'zustand';
import { Box3, Group, Vector3 } from 'three';
import { clock } from '../../clock/frame.ts';
import { cel } from '../api.ts';
import { useSettings } from '../../state/settings.ts';
import { organsReady } from '../organs/meshes.ts';
import { NETWORK, NETWORK_BY_ID } from '../vessels/network.ts';
import { forgetBase } from '../vessels/shape.ts';
import { editDz } from './dz.ts';
import { type Edits, type P2, emptyEdits, exportEdits, handleIndices, moveHandle, parseEdits } from './model.ts';

const KEY = 'pps3d.edit-shapes.v1';
export type Target = { kind: 'vessel' | 'organ'; id: string } | null;

/** The vessels that have a course of their own to edit (a fan of tributaries has none). */
export const EDITABLE_VESSELS = NETWORK.filter((v) => v.plan?.kind === 'coil');

const baseOf = (id: string): P2[] => (NETWORK_BY_ID.get(id)!.plan as unknown as { base: P2[] }).base;
const setBase = (id: string, pts: P2[]): void => { ((NETWORK_BY_ID.get(id)!.plan) as unknown as { base: P2[] }).base = pts; forgetBase(id); };
/** The source course of each vessel, kept the first time it is edited. */
const source = new Map<string, P2[]>();
export const sourceOf = (id: string): P2[] => source.get(id) ?? baseOf(id);

const wraps = new Map<string, Group>();
function wrapOf(id: string): Group | null {
  let w = wraps.get(id);
  if (w) return w;
  const o = cel.disease.organs.byId.get(id), parent = o?.group.parent;
  if (!o || !parent) return null;
  w = new Group();
  parent.add(w);
  w.add(o.group);   // (the organ's own group keeps every position the layer writes; the wrapper only adds the edit)
  wraps.set(id, w);
  return w;
}

interface Store {
  edits: Edits;
  target: Target;
  setTarget(t: Target): void;
  /** Handle `h` of vessel `id` goes to (x, y) in 2D units. */
  moveVessel(id: string, h: number, x: number, y: number): void;
  setVesselDz(id: string, dz: number): void;
  moveOrgan(id: string, dx: number, dy: number): void;
  setOrganDz(id: string, dz: number): void;
  resetTarget(): void;
  resetAll(): void;
  copy(): Promise<boolean>;
}

const load = (): Edits => { try { return parseEdits(localStorage.getItem(KEY)); } catch { return emptyEdits(); } };
const save = (e: Edits): void => { try { localStorage.setItem(KEY, JSON.stringify(JSON.parse(exportEdits(e)))); } catch { /* storage unavailable: the edits last for this visit */ } };

function applyVessel(id: string, e: Store['edits']['vessels'][string] | undefined): void {
  if (!NETWORK_BY_ID.get(id)?.plan) return;
  cel.freezeTubular(id);
  if (e) { if (!source.has(id)) source.set(id, baseOf(id)); setBase(id, e.pts); if (e.dz) editDz.set(id, e.dz); else editDz.delete(id); }
  else { const src = source.get(id); if (src) setBase(id, src); editDz.delete(id); source.delete(id); }
  cel.reshapeVessel(id);
}
function applyOrgan(id: string, e: { dx: number; dy: number; dz: number } | undefined): void {
  const w = e ? wrapOf(id) : wraps.get(id);
  if (!w) return;
  if (e) w.position.set(e.dx, e.dy, e.dz); else w.position.set(0, 0, 0);
  cel.invalidateScene();
}

export const useEdit = create<Store>((set, get) => {
  const commit = (edits: Edits) => { set({ edits }); save(edits); };
  return {
    edits: load(),
    target: null,
    setTarget: (target) => set({ target }),
    moveVessel: (id, h, x, y) => {
      const cur = get().edits.vessels[id] ?? { pts: sourceOf(id).map((p): P2 => [p[0], p[1]]), dz: 0 };
      const idx = handleIndices(sourceOf(id));
      const next = { pts: moveHandle(cur.pts, idx, h, x, y), dz: cur.dz };
      applyVessel(id, next);
      commit({ ...get().edits, vessels: { ...get().edits.vessels, [id]: next } });
    },
    setVesselDz: (id, dz) => {
      const cur = get().edits.vessels[id] ?? { pts: sourceOf(id).map((p): P2 => [p[0], p[1]]), dz: 0 };
      const next = { pts: cur.pts, dz };
      applyVessel(id, next);
      commit({ ...get().edits, vessels: { ...get().edits.vessels, [id]: next } });
    },
    moveOrgan: (id, dx, dy) => {
      const cur = get().edits.organs[id] ?? { dx: 0, dy: 0, dz: 0 };
      const next = { ...cur, dx, dy };
      applyOrgan(id, next);
      commit({ ...get().edits, organs: { ...get().edits.organs, [id]: next } });
    },
    setOrganDz: (id, dz) => {
      const cur = get().edits.organs[id] ?? { dx: 0, dy: 0, dz: 0 };
      const next = { ...cur, dz };
      applyOrgan(id, next);
      commit({ ...get().edits, organs: { ...get().edits.organs, [id]: next } });
    },
    resetTarget: () => {
      const t = get().target;
      if (!t) return;
      const e = get().edits, vessels = { ...e.vessels }, organs = { ...e.organs };
      if (t.kind === 'vessel') { delete vessels[t.id]; applyVessel(t.id, undefined); } else { delete organs[t.id]; applyOrgan(t.id, undefined); }
      commit({ vessels, organs });
    },
    resetAll: () => {
      const e = get().edits;
      for (const id of Object.keys(e.vessels)) applyVessel(id, undefined);
      for (const id of Object.keys(e.organs)) applyOrgan(id, undefined);
      commit(emptyEdits());
    },
    copy: async () => {
      const text = exportEdits(get().edits);
      try { await navigator.clipboard.writeText(text); return true; } catch { /* a touch browser without the clipboard API: the old way */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch { return false; }
    },
  };
});

/** The centre of an organ now, in scene units (its box, with the edit). */
export function organCentre(id: string, out = new Vector3()): Vector3 | null {
  const o = cel.disease.organs.byId.get(id);
  return o ? new Box3().setFromObject(o.group).getCenter(out) : null;
}

/** Edit shapes on: the saved edits go over the scene. Off: everything goes back to the source shapes. */
let applied = false;
export function bindEditMode(): () => void {
  const sync = () => {
    const on = useSettings.getState().editShapes;
    if (on === applied) return;
    applied = on;
    const e = useEdit.getState().edits;
    for (const id of Object.keys(e.vessels)) applyVessel(id, on ? e.vessels[id] : undefined);
    const organReady = () => Object.keys(e.organs).forEach((id) => applyOrgan(id, on ? e.organs[id] : undefined));
    organReady();
    if (!on) useEdit.getState().setTarget(null);
    clock.invalidate('edit-shapes');
  };
  sync();
  // (an organ edit saved earlier waits for the organs file)
  void organsReady.then(() => { if (applied) { const e = useEdit.getState().edits; for (const id of Object.keys(e.organs)) applyOrgan(id, e.organs[id]); } });
  return useSettings.subscribe(sync);
}
