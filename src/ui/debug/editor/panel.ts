// The anatomy editor (?editor on the preview copy or a local run; docs/editor-plan.md, WS-C). A panel and a pointer layer over the figure:
//   Orbit    the inspector's free orbit (the figure turns all the way round; the figure's own gestures work)
//   Vessels  node handles (a junction: every vessel end there follows) and, on a tapped vessel, three control points; drag on the plane facing the camera, depth by slider
//   Organs   tap an organ; Cage (default: drag a handle of the coarse lattice to bulge or morph a region), Move (drag), sliders for move / turn / scale, or Fine brush (drag over it: radius and strength)
// Undo / Redo, Save (keeps the draft in this browser and reloads: every consumer rebuilds from it), Export (clipboard + file), Clear draft.
// Nothing here runs per frame: the overlay is rewritten when an edit changes it, and a frame is asked for with frameFor. Layout reads go through layout-snap.
import { Box3, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { cel } from '../../../scene/api.ts';
import { frameFor } from '../../../clock/frame.ts';
import { readBox, readMetric } from '../../layout-snap.ts';
import { clearDraft, committedOverrides, overrides, saveDraft } from '../../../editor/store.ts';
import { CAGE_LIMIT, ORGAN_LIMITS, type Overrides, type Cage, type Grid, type Stroke, type V3 } from '../../../editor/types.ts';
import { bakeOverrides } from '../../../editor/organ-apply.ts';
import { cageBox, cageRest, organBox, organBoxes, organPointMap } from '../../../editor/organ-apply.ts';
import { liveTransform, throughTransform } from './live.ts';
import { organHints } from '../../../editor/overlap.ts';
import { previewVesselEdits, setVesselPreviewHost } from '../../../scene/vessels/edit-preview.ts';
import { LiveStrokes } from './strokes.ts';
import { clock } from '../../../clock/frame.ts';
import { buildCommit, VIEW_KEY, clearHistory, loadView, saveView, exportReminder, noteExported, persistHistory, restorableHistory, type StorageLike } from './session.ts';
import { knownIds, orphanCount, orphanText, orphansOf, withoutOrphans } from './orphans.ts';
import { Overlay } from './overlay.ts';
import { mirrorId, mirrorOffset } from './mirror.ts';
import { slidesTouching, stopOf, type Touch } from './slides.ts';
import { builtinDecks, lazyDecks } from '../../../decks/registry.ts';
import { loadDeck } from '../../deck/deck-of.ts';
import { startTalk } from '../../shell/talk.ts';
import { zoomPan, pinchView, type HandView, dotSize, hitRadius, dragDelta, ndcOf, nearest, nearestLine, nearestParam } from './picking.ts';
import { NETWORK_BY_ID } from '../../../scene/vessels/network.ts';
import { skeleton, organIds, pointAt, uAtIndex, centroidOf, type Skeleton } from './source.ts';
import { History, nodeVisible, snapOffsets, type System, diffList, resetItem, differs, core, fileOverrides, fileText, staleNote, PLAN_PER_SCENE, addControl, removeControl, knotsOf, dragToOffsets, type Lock, toReference, strokeToReference, addStroke, cageOffset, clearCage, clearStrokes, setCageHandle, CAGE_N, controlOf, exportText, parseOverrides, nodeOf, organOf, resetNode, resetOrgan, resetVessel, setControl, setNode, setOrgan } from './state.ts';

type Mode = 'orbit' | 'vessels' | 'organs';
type Target = { kind: 'node'; id: string } | { kind: 'ctrl'; vid: string; u: number };
const coarse = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const hitPx = (e: PointerEvent): number => hitRadius(e.pointerType === 'touch' || coarse());
const dotPx = (n: number): number => dotSize(n, coarse());
const loaded = overrides();   // the overrides this page was built with: handles and boxes show the shift from them

export function mountEditor(): void {
  if (document.getElementById('editor-panel')) return;
  const hist = new History(loaded);
  let snaps: NonNullable<Overrides['snapshots']> = { ...(loaded.snapshots ?? {}) };   // (named snapshots: kept with the draft and in the Export file, not in the undo history)
  const store = ((): StorageLike | null => { try { return localStorage; } catch { return null; } })();
  const session = ((): StorageLike | null => { try { return sessionStorage; } catch { return null; } })();
  const recovered = store ? restorableHistory(store, loaded) : null;
  if (recovered) hist.restore(recovered);
  const sk: Skeleton = skeleton();
  const nodeById = new Map(sk.nodes.map((n) => [n.id, { id: n.id, at: n.pos, arms: n.arms }])), vesselById = new Map(sk.vessels.map((v) => [v.id, v]));
  const overlay = new Overlay();
  let mode: Mode = 'orbit', tool: 'move' | 'cage' | 'liquify' = 'cage';
  let target: Target | null = null, selVessel: string | null = null, selOrgan: string | null = organIds()[0] ?? null;
  let radius = 0.08, strength = 0.5, lock: Lock = 'free', system: System = 'all', solo = false;
  let playing = false;
  let msg = recovered && exportText(recovered.now) !== exportText(loaded) ? 'Recovered your unsaved edits from this browser.' : '';

  const css = document.createElement('style');
  css.textContent = `
#editor-bar{position:fixed;left:8px;top:8px;right:8px;z-index:calc(var(--z-perf,100) + 1);display:flex;flex-wrap:wrap;gap:5px;align-items:center;pointer-events:none}
#editor-bar button{pointer-events:auto;font:600 12px ui-monospace,Menlo,monospace;color:#fff;background:#000b;border:1px solid #fff6;border-radius:8px;padding:8px 12px;min-height:36px;touch-action:manipulation;transition:background .25s,opacity .25s}
#editor-bar button.on{background:#e8a33dcc;border-color:#e8a33d}
#editor-bar button:disabled{opacity:.4}
#editor-bar .gap{flex:1}
#editor-label{position:fixed;left:0;top:0;z-index:calc(var(--z-perf,100) + 1);pointer-events:none;opacity:0;transition:opacity .25s;color:#fff;font:600 12px/1 ui-monospace,Menlo,monospace;white-space:nowrap;text-shadow:0 0 3px #000,0 0 3px #000,0 0 6px #000,0 1px 2px #000}
#editor-panel{position:fixed;left:8px;top:56px;z-index:var(--z-perf,100);width:min(340px,94vw);max-height:calc(100vh - 76px);overflow:auto;-webkit-overflow-scrolling:touch;padding:8px 10px;border-radius:12px;background:#000c;color:#fff;font:11px/1.5 ui-monospace,Menlo,monospace;display:none}
#editor-panel .row{display:flex;align-items:center;gap:8px;margin:3px 0}
#editor-panel .row>label{flex:1}
#editor-panel .row input[type=range]{flex:1.4;min-width:0;margin:0}
#editor-panel .val{min-width:48px;text-align:right;color:#cde}
#editor-panel select,#editor-panel button{font:11px ui-monospace,Menlo,monospace;color:#fff;background:#fff2;border:1px solid #fff6;border-radius:6px;padding:6px 10px;min-height:32px}
#editor-panel button.on{background:#e8a33d55;border-color:#e8a33d}
#editor-panel button:disabled{opacity:.4}
#editor-panel .bar{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0}
#editor-panel .hint{color:#9ab;margin:2px 0 4px}
#editor-panel .msg{min-height:14px;color:#ffd58a;margin-top:4px}
#editor-layer{position:fixed;inset:0;z-index:calc(var(--z-perf,100) - 1);touch-action:none;display:none}`;
  document.head.append(css);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, kids: (Node | string)[] = []): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
  const topbar = el('div', { id: 'editor-bar' });
  const labelEl = el('div', { id: 'editor-label' });
  const box = el('div', { id: 'editor-panel' });
  const layer = el('div', { id: 'editor-layer' });
  document.body.append(layer, topbar, labelEl, box);
  box.style.display = 'block';
  box.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ── the draft ──
  const body = (): Object3D => cel.editorBody;
  const toWorld = (v: V3): Vector3 => body().localToWorld(new Vector3(v[0], v[1], v[2]));
  const toLocal = (w: Vector3): Vector3 => body().worldToLocal(w.clone());
  const planToScene = (dx: number, dy: number, dz: number): V3 => [dx / PLAN_PER_SCENE, -dy / PLAN_PER_SCENE, dz];
  const shift = (a: { dx: number; dy: number; dz: number }, b: { dx: number; dy: number; dz: number }): V3 => planToScene(a.dx - b.dx, a.dy - b.dy, a.dz - b.dz);
  const add = (p: V3, d: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  const visNodes = (): typeof sk.nodes => sk.nodes.filter((n) => nodeVisible(system, solo ? selVessel ?? (target?.kind === 'ctrl' ? target.vid : null) : null, n.arms.map((a) => ({ id: a.id, tone: NETWORK_BY_ID.get(a.id)?.tone }))));
  const nodeShown = (id: string): V3 => add(nodeById.get(id)!.at, shift(nodeOf(hist.now, id), nodeOf(loaded, id)));
  const ctrlShown = (vid: string, u: number): V3 => add(pointAt(vesselById.get(vid)!.course, u), shift(controlOf(hist.now, vid, u), controlOf(loaded, vid, u)));

  // ── the stage (the figure's canvas) ──
  const stage = (): { x: number; y: number; w: number; h: number } => {
    let best: HTMLCanvasElement | null = null, bw = 0;
    for (const c of document.querySelectorAll('canvas')) { const w = readMetric(c, 'clientWidth'); if (w > bw) { bw = w; best = c; } }
    const r = best ? readBox(best) : readBox(document.documentElement);
    return { x: r.left, y: r.top, w: r.width || 1, h: r.height || 1 };
  };
  const screenOf = (v: V3): [number, number] | null => { const p = cel.rig.project(toWorld(v)); return Number.isFinite(p.x) ? [p.x, p.y] : null; };

  // ── the overlay ──
  const organBoxLocal = (id: string): { lo: V3; hi: V3 } | null => {
    const o = cel.disease.organs.byId.get(id); if (!o) return null;
    const b = new Box3().setFromObject(o.group); if (b.isEmpty()) return null;
    const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const p = toLocal(new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
      lo[0] = Math.min(lo[0]!, p.x); lo[1] = Math.min(lo[1]!, p.y); lo[2] = Math.min(lo[2]!, p.z); hi[0] = Math.max(hi[0]!, p.x); hi[1] = Math.max(hi[1]!, p.y); hi[2] = Math.max(hi[2]!, p.z);
    }
    return { lo, hi };
  };
  const shownOrgans = new Set<string>();
  /** The organs' meshes carry the draft over the loaded edit, live (live.ts): children of the organ's group, never the group (the layer owns that). */
  // Before / after: while the Before button is held the committed file's edits are shown in place of the draft's
  let before = false;
  const shown = (): Overrides => (before ? committedOverrides() : hist.now);
  const syncOrgans = (): void => {
    for (const id of [...Object.keys(shown().organs ?? {}), ...Object.keys(loaded.organs ?? {}), ...shownOrgans]) {
      const o = cel.disease.organs.byId.get(id); if (!o) continue;
      const t = liveTransform(loaded.organs?.[id], shown().organs?.[id], centroidOf(id));
      for (const m of o.group.children) { m.position.set(t.position[0], t.position[1], t.position[2]); m.rotation.y = t.rotY; m.scale.setScalar(t.scale); }
      shownOrgans.add(id);
      const list = shown().organs?.[id]?.strokes, cg = shown().organs?.[id]?.cage, gr = shown().organs?.[id]?.grid;
      if (list !== strokesShown.get(id) || cg !== cageSeen.get(id) || gr !== gridSeenBy.get(id)) { strokesShown.set(id, list); cageSeen.set(id, cg); gridSeenBy.set(id, gr); strokesDue.add(id); }
    }
    if (strokesDue.size && !strokesPending) { strokesPending = true; clock.after(flushStrokes, 0, 'editor-strokes'); }   // (one per frame, however many moves came in)
  };
  const strokesShown = new Map<string, readonly Stroke[] | undefined>(), strokesDue = new Set<string>(), liveStrokes = new Map<string, LiveStrokes>(), touched = new Set<string>();
  const cageSeen = new Map<string, Cage | undefined>(), gridSeenBy = new Map<string, Grid | undefined>();
  let strokesPending = false;
  const flushStrokes = (): void => {
    strokesPending = false;
    for (const id of strokesDue) {
      let ls = liveStrokes.get(id);
      if (!ls) {
        const g = cel.disease.organs.byId.get(id)?.toonMesh.geometry; if (!g) continue;
        ls = new LiveStrokes(g, loaded.organs?.[id], centroidOf(id), organBoxes[id] ?? organBox(g)); liveStrokes.set(id, ls);
      }
      ls.set(shown().organs?.[id]?.strokes, shown().organs?.[id]?.cage, shown().organs?.[id]?.grid); touched.add(id);
    }
    strokesDue.clear();
    cel.setEditorOverlay(overlay.object); frameFor('editor', 300);
  };
  const settleStrokes = (): void => { for (const id of touched) liveStrokes.get(id)?.settle(); touched.clear(); cel.setEditorOverlay(overlay.object); };
  setVesselPreviewHost(() => cel.editorVesselParts());
  // ── the cage (organs: the coarse lattice over the organ's box; a handle pulls a whole region) ──
  const cageN = (id: string): readonly [number, number, number] => hist.now.organs?.[id]?.cage?.n ?? CAGE_N;
  /** The padded box's size per axis, and so the most a handle may move on each. */
  const cageLim = (id: string): V3 => { const b = organBoxes[id]; if (!b) return [0, 0, 0]; const c = cageBox(b); return [(c.hi[0] - c.lo[0]) * CAGE_LIMIT, (c.hi[1] - c.lo[1]) * CAGE_LIMIT, (c.hi[2] - c.lo[2]) * CAGE_LIMIT]; };
  /** Where each handle shows (body frame): its rest place plus its offset, carried by the draft's move, turn and scale (the cage acts before them). */
  const cageHandles = (id: string): V3[] => {
    const b = organBoxes[id]; if (!b) return [];
    const e = hist.now.organs?.[id], rigid = organPointMap({ move: e?.move, rotY: e?.rotY, scale: e?.scale }, centroidOf(id));
    return cageRest(cageN(id), b).map((p, i): V3 => { const d = cageOffset(hist.now, id, i), q: V3 = [p[0] + d[0], p[1] + d[1], p[2] + d[2]]; return rigid ? rigid(q) : q; });
  };
  const cageLines = (n: readonly [number, number, number], h: readonly V3[]): V3[] => {
    const out: V3[] = [], at = (i: number, j: number, k: number): V3 => h[i + n[0] * (j + n[1] * k)]!;
    for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      if (i + 1 < n[0]) out.push(at(i, j, k), at(i + 1, j, k));
      if (j + 1 < n[1]) out.push(at(i, j, k), at(i, j + 1, k));
      if (k + 1 < n[2]) out.push(at(i, j, k), at(i, j, k + 1));
    }
    return out;
  };
  const refreshOverlay = (): void => {
    syncOrgans();
    previewVesselEdits(shown());   // (the real tubes and skins follow the draft in every mode, a vessel drag and an organ drag alike: vessels/edit-preview.ts; it does nothing while the draft is what the page was built with)
    const vessels = mode === 'vessels';
    overlay.dots('nodes', { pos: vessels ? visNodes().map((n) => nodeShown(n.id)) : [], size: dotPx(9), color: 0xffb347 });
    if (vessels && target?.kind === 'node') overlay.dots('pick', { pos: [nodeShown(target.id)], size: dotPx(16), color: 0xff3d71 });
    else if (vessels && target?.kind === 'ctrl') overlay.dots('pick', { pos: [ctrlShown(target.vid, target.u)], size: dotPx(16), color: 0xff3d71 });
    else overlay.clear('pick');
    const vid = vessels ? (target?.kind === 'ctrl' ? target.vid : selVessel) : null;
    if (vid && vesselById.has(vid)) {
      overlay.dots('ctrl', { pos: knotsOf(hist.now, vid).map((u) => ctrlShown(vid, u)), size: dotPx(12), color: 0x41d6ff });
      overlay.line('sel', vesselById.get(vid)!.course, 0x41d6ff);
    } else { overlay.clear('ctrl'); overlay.clear('sel'); }
    if (mode === 'organs' && selOrgan) {
      const b = organBoxLocal(selOrgan);
      if (b) overlay.box('organ', b.lo, b.hi, 0xffb347);   // (the box is of the live meshes, which already carry the draft)
      const hs = tool === 'cage' ? cageHandles(selOrgan) : [];
      if (hs.length) { overlay.segments('cage-lines', cageLines(cageN(selOrgan), hs), 0x7fd6ff); overlay.dots('cage', { pos: hs, size: dotPx(13), color: 0xffffff }); }
      else { overlay.clear('cage-lines'); overlay.clear('cage'); }
    } else { overlay.clear('organ'); overlay.clear('cage-lines'); overlay.clear('cage'); }
    cel.setEditorOverlay(overlay.object);   // (asks for a frame; the same object, so nothing is rebuilt)
    frameFor('editor', 300);
  };

  // ── the panel ──
  const syncers: (() => void)[] = [];
  const msgEl = el('div', { className: 'msg' });
  const status = el('div', { className: 'hint' });
  const dyn = el('div');   // what the mode needs
  const section = (host: HTMLElement, items: readonly { label: string; run: () => void; on?: () => boolean; off?: () => boolean }[]): HTMLElement[] => items.map((i) => {
    const b = el('button', { textContent: i.label }); b.onclick = () => { i.run(); sync(); };
    syncers.push(() => { b.classList.toggle('on', !!i.on?.()); b.disabled = !!i.off?.(); });
    host.append(b); return b;
  });
  const bar = (items: Parameters<typeof section>[1]): HTMLElement => { const b = el('div', { className: 'bar' }); section(b, items); return b; };
  let sliding = false;
  const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt = (v: number): string => (Math.round(v * 1000) / 1000).toString()): HTMLElement => {
    const v = el('span', { className: 'val' }), i = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const show = (): void => { i.value = String(get()); v.textContent = fmt(get()); };
    i.oninput = () => { const before = hist.now; set(Number(i.value)); if (!sliding && hist.now !== before) { sliding = true; hist.markAs(before); } sync(); };   // (an undo step only when the draft changed: the brush sliders do not)
    i.onchange = () => { sliding = false; };
    syncers.push(show);
    return el('div', { className: 'row' }, [el('label', { textContent: label }), i, v]);
  };
  const say = (t: string): void => { msg = t; msgEl.textContent = t; };

  const edit = (next: typeof hist.now, coalesce = true): void => { hist.commit(next, coalesce); };
  const zoomBar = (): HTMLElement => bar([{ label: 'Zoom in', run: () => putView(zoomPan(view, 1.4)) }, { label: 'Zoom out', run: () => putView(zoomPan(view, 1 / 1.4)) }, { label: 'Fit view', run: () => putView({ k: 1, x: 0, y: 0 }) }]);
  const buildDyn = (): void => {
    syncers.length = 0; dyn.replaceChildren();
    syncers.push(() => { for (const [m, b] of modeBtns) b.classList.toggle('on', m === mode); });
    if (mode === 'orbit') {
      dyn.append(el('div', { className: 'hint', textContent: 'Drag turns the figure all the way round. Pinch and the other gestures work as usual.' }));
      dyn.append(bar([{ label: 'Face front', run: () => { cel.rig.inspectTo(0, 0); frameFor('editor', 900); } }, { label: 'Side', run: () => { cel.rig.inspectTo(Math.PI / 2, 0); frameFor('editor', 900); } }, { label: 'Top', run: () => { cel.rig.inspectTo(0, 1.2); frameFor('editor', 900); } }]));
    } else if (mode === 'vessels') {
      dyn.append(zoomBar());
      dyn.append(el('div', { className: 'hint', textContent: 'Orange: junctions (drag moves every vessel end there). Tap a vessel to pick it; tap it again to add a blue control point anywhere along it, drag a point to bend, Remove point takes one away. Save applies the edit.' }));
      const sel = (): { get: () => { dx: number; dy: number; dz: number }; put: (m: { dx: number; dy: number; dz: number }) => void } | null => {
        const t = target; if (!t) return null;
        return t.kind === 'node'
          ? { get: () => nodeOf(hist.now, t.id), put: (m) => edit(setNode(hist.now, t.id, m)) }
          : { get: () => controlOf(hist.now, t.vid, t.u), put: (m) => edit(setControl(hist.now, t.vid, t.u, m)) };
      };
      dyn.append(bar((['free', 'x', 'y', 'z'] as const).map((l) => ({ label: l === 'free' ? 'Free drag' : `Lock ${l.toUpperCase()}`, on: () => lock === l, run: () => { lock = l; } }))));
      const which = el('div', { className: 'hint' });
      syncers.push(() => { which.textContent = !target ? 'Nothing picked.' : target.kind === 'node' ? `Junction ${target.id}` : `${target.vid} at ${Math.round(target.u * 100)}%`; });
      dyn.append(which);
      // the picked handle's numbers (plan units for x and y, scene units for depth), typed or nudged
      const num = (key: 'dx' | 'dy' | 'dz', label: string, step: string): HTMLElement => {
        const i = el('input', { type: 'number', step }); i.style.cssText = 'width:64px;font:11px ui-monospace,Menlo,monospace;color:#fff;background:#fff2;border:1px solid #fff6;border-radius:6px;padding:4px;min-width:0';
        i.onchange = () => { const s = sel(); if (!s || !Number.isFinite(i.valueAsNumber)) return; hist.mark(); s.put({ ...s.get(), [key]: i.valueAsNumber }); sync(); };
        syncers.push(() => { const s = sel(); i.disabled = !s; if (document.activeElement !== i) i.value = s ? String(Math.round(s.get()[key] * 1000) / 1000) : ''; });
        return el('label', { className: 'row' }, [el('span', { textContent: label }), i]);
      };
      dyn.append(el('div', { className: 'bar' }, [num('dx', 'x', '0.5'), num('dy', 'y', '0.5'), num('dz', 'depth', '0.005')]));
      const nudge = (dx: number, dy: number, dz: number): void => { const s = sel(); if (!s) return; const g = s.get(); hist.mark(); s.put({ dx: g.dx + dx, dy: g.dy + dy, dz: Math.max(-0.3, Math.min(0.3, g.dz + dz)) }); sync(); };
      dyn.append(bar([{ label: '◀', off: () => !target, run: () => nudge(-1, 0, 0) }, { label: '▶', off: () => !target, run: () => nudge(1, 0, 0) }, { label: '▲', off: () => !target, run: () => nudge(0, -1, 0) }, { label: '▼', off: () => !target, run: () => nudge(0, 1, 0) },
        { label: 'Nearer', off: () => !target, run: () => nudge(0, 0, 0.005) }, { label: 'Farther', off: () => !target, run: () => nudge(0, 0, -0.005) }]));
      const nearestOther = (id: string): string | null => {
        const me = nodeShown(id); let best: string | null = null, bd = Infinity;
        for (const n of sk.nodes) { if (n.id === id) continue; const p = nodeShown(n.id), d = (p[0] - me[0]) ** 2 + (p[1] - me[1]) ** 2; if (d < bd) { bd = d; best = n.id; } }
        return best;
      };
      const joinTo = (plane: boolean, depth: boolean): void => {
        if (target?.kind !== 'node') return; const o = nearestOther(target.id); if (!o) return;
        const base = nodeById.get(target.id)!.at, to = nodeShown(o), cur = nodeOf(hist.now, target.id);
        hist.commit(setNode(hist.now, target.id, snapOffsets(base, to, cur, plane, depth))); say(`${plane ? 'Snapped' : 'Matched depth'} to junction ${o}.`);
      };
      const vesselExists = (id: string): boolean => vesselById.has(id), nodeExists = (id: string): boolean => nodeById.has(id);
      const partner = (): string | null => (target?.kind === 'node' ? mirrorId(target.id, nodeExists) : target?.kind === 'ctrl' ? mirrorId(target.vid, vesselExists) : null);
      dyn.append(bar([{ label: 'Mirror to the other side', off: () => !partner(), run: () => {
        const p = partner(); if (!p || !target) return;
        hist.commit(target.kind === 'node' ? setNode(hist.now, p, mirrorOffset(nodeOf(hist.now, target.id))) : setControl(hist.now, p, target.u, mirrorOffset(controlOf(hist.now, target.vid, target.u)), true));
        say(`Mirrored to ${p} (across the body's midline; check its direction).`);
      } }]));
      dyn.append(bar([{ label: 'Snap to nearest junction', off: () => target?.kind !== 'node', run: () => joinTo(true, true) }, { label: 'Match its depth', off: () => target?.kind !== 'node', run: () => joinTo(false, true) }]));
      dyn.append(bar([{ label: 'All', on: () => system === 'all', run: () => { system = 'all'; } }, { label: 'Portal', on: () => system === 'portal', run: () => { system = 'portal'; } }, { label: 'Venous', on: () => system === 'venous', run: () => { system = 'venous'; } }, { label: 'Arterial', on: () => system === 'arterial', run: () => { system = 'arterial'; } },
        { label: 'Solo vessel', on: () => solo, run: () => { solo = !solo; } }]));
      dyn.append(slider('Depth (scene units)', -0.2, 0.2, 0.002, () => sel()?.get().dz ?? 0, (z) => { const s = sel(); if (s) { const g = s.get(); s.put({ ...g, dz: z }); } }));
      dyn.append(bar([{ label: 'Remove point', off: () => target?.kind !== 'ctrl', run: () => { if (target?.kind === 'ctrl') { hist.commit(removeControl(hist.now, target.vid, target.u)); target = null; } } },
        { label: 'Reset picked', off: () => !target, run: () => { const s = sel(); if (s) s.put({ dx: 0, dy: 0, dz: 0 }); } },
        { label: 'Reset vessel', off: () => !(target?.kind === 'ctrl' ? target.vid : selVessel), run: () => { const v = target?.kind === 'ctrl' ? target.vid : selVessel; if (v) { hist.commit(resetVessel(hist.now, v)); } } },
        { label: 'Reset junction', off: () => target?.kind !== 'node', run: () => { if (target?.kind === 'node') hist.commit(resetNode(hist.now, target.id)); } }]));
    } else {
      dyn.append(zoomBar());
      const s = el('select');
      for (const id of organIds()) s.append(el('option', { value: id, textContent: id }));
      s.value = selOrgan ?? ''; s.onchange = () => { selOrgan = s.value; sync(); };
      dyn.append(el('div', { className: 'row' }, [el('label', { textContent: 'Organ (or tap it)' }), s]));
      syncers.push(() => { s.value = selOrgan ?? ''; });
      dyn.append(bar([{ label: 'Cage', on: () => tool === 'cage', run: () => { tool = 'cage'; } }, { label: 'Move', on: () => tool === 'move', run: () => { tool = 'move'; } }, { label: 'Fine brush', on: () => tool === 'liquify', run: () => { tool = 'liquify'; } }]));
      const o = (): ReturnType<typeof organOf> => organOf(hist.now, selOrgan ?? '');
      const axis = (n: 0 | 1 | 2, name: string): HTMLElement => slider(`Move ${name}`, -ORGAN_LIMITS.move, ORGAN_LIMITS.move, 0.002, () => o().move[n], (v) => { if (!selOrgan) return; const m = [...o().move] as [number, number, number]; m[n] = v; edit(setOrgan(hist.now, selOrgan, { move: m })); });
      dyn.append(axis(0, 'x'), axis(1, 'y'), axis(2, 'z'));
      dyn.append(slider('Turn (rad)', -ORGAN_LIMITS.rotY, ORGAN_LIMITS.rotY, 0.005, () => o().rotY, (v) => { if (selOrgan) edit(setOrgan(hist.now, selOrgan, { rotY: v })); }));
      dyn.append(slider('Scale', ORGAN_LIMITS.scaleMin, ORGAN_LIMITS.scaleMax, 0.005, () => o().scale, (v) => { if (selOrgan) edit(setOrgan(hist.now, selOrgan, { scale: v })); }));
      dyn.append(slider('Brush radius', 0.02, 0.3, 0.005, () => radius, (v) => { radius = v; }));
      dyn.append(slider('Brush strength', 0.1, 1, 0.05, () => strength, (v) => { strength = v; }));
      const strokes = el('div', { className: 'hint' }); syncers.push(() => { strokes.textContent = `Cage: drag a white handle to bulge, shrink or morph a whole region (the shape holds). ${o().strokes} fine-brush strokes on ${selOrgan ?? '-'}: Fine brush drags over the surface.`; });
      dyn.append(strokes);
      dyn.append(bar([{ label: 'Clear cage', run: () => { if (selOrgan) hist.commit(clearCage(hist.now, selOrgan)); } }, { label: 'Clear strokes', run: () => { if (selOrgan) hist.commit(clearStrokes(hist.now, selOrgan)); } }, { label: 'Reset organ', run: () => { if (selOrgan) hist.commit(resetOrgan(hist.now, selOrgan)); } }]));
    }
    sync();
  };
  const setMode = (m: Mode): void => {
    mode = m; target = null;
    layer.style.display = m === 'orbit' ? 'none' : 'block';
    cel.rig.setInspect(true);
    buildDyn();
  };
  let autosavePending = false;
  const flushHistory = (): void => { autosavePending = false; if (store) persistHistory(store, loaded, hist, clock.now()); };
  const known = knownIds();
  const orphanNote = (): string => { const r = orphansOf(hist.now, known); return orphanCount(r) ? `${orphanCount(r)} edit${orphanCount(r) === 1 ? '' : 's'} name${orphanCount(r) === 1 ? 's' : ''} something that no longer exists (${orphanText(r)}) and do${orphanCount(r) === 1 ? 'es' : ''} nothing.` : ''; };
  { const r = orphansOf(loaded, known); if (orphanCount(r)) console.warn('[editor] overrides name parts this build does not have:', orphanText(r)); }
  // Overlap hint (audit 14): an edit that presses one organ deeper into another than the page was built with is named, a moment after the edit settles
  const refPos = new Map<string, Float32Array>();
  let hintText = '', hintPending = false;
  const computeHints = (): void => {
    hintPending = false;
    const set: Record<string, { edited: Float32Array; reference: Float32Array; index?: ArrayLike<number> }> = {};
    for (const [id, o] of cel.disease.organs.byId) {
      const g = o.toonMesh.geometry, pos = g.getAttribute('position').array as Float32Array;
      if (!refPos.has(id)) refPos.set(id, Float32Array.from(pos));   // (what the page was built with: first looked at before the first live stroke)
      const t = liveTransform(loaded.organs?.[id], hist.now.organs?.[id], centroidOf(id));
      set[id] = { edited: throughTransform(pos, t), reference: throughTransform(refPos.get(id)!, { position: [0, 0, 0], rotY: 0, scale: 1 }), index: g.index?.array };
    }
    const h = organHints(set);
    hintText = h.length ? `Overlap: ${h.slice(0, 2).map((x) => `${x.a} presses into ${x.b} by ${(x.depth - x.was).toFixed(2)}`).join('; ')}${h.length > 2 ? ` (+${h.length - 2})` : ''}. Look before Save.` : '';
    msgEl.textContent = [msg, hintText].filter(Boolean).join(' ');
  };
  const dirty = (): boolean => differs(hist.now, loaded);
  const sync = (): void => {
    for (const f of syncers) f();
    status.textContent = `${dirty() ? 'Unsaved edits' : 'No edits since the last Save'} · ${Object.keys(hist.now.nodes ?? {}).length} junctions, ${Object.keys(hist.now.vessels ?? {}).length} vessels, ${Object.keys(hist.now.organs ?? {}).length} organs`;
    undoB.disabled = !hist.canUndo; redoB.disabled = !hist.canRedo;
    const remind = store ? exportReminder(store, hist.now, committedOverrides(), clock.now()) : null;
    msgEl.textContent = [msg, hintText, remind, orphanNote(), staleNote(loaded.meta?.base, buildCommit()), differs(hist.now, committedOverrides()) ? 'The draft differs from the committed file.' : ''].filter(Boolean).join(' '); refreshOverlay();
    if (!drag) refreshDiff();
    if (mode === 'organs' && !hintPending) { hintPending = true; clock.after(computeHints, 400, 'editor-hints'); }
    if (store && !autosavePending) { autosavePending = true; clock.after(flushHistory, 800, 'editor-autosave'); }   // (a moment after the last edit, not per move)
  };

  const modeBtns = (['orbit', 'vessels', 'organs'] as const).map((m) => { const b = el('button', { textContent: { orbit: 'Orbit', vessels: 'Vessels', organs: 'Organs' }[m] }); b.onclick = () => setMode(m); topbar.append(b); return [m, b] as const; });
  syncers.push(() => { for (const [m, b] of modeBtns) b.classList.toggle('on', m === mode); });
  const undoB = el('button', { textContent: 'Undo' }), redoB = el('button', { textContent: 'Redo' });
  undoB.onclick = () => { if (hist.undo()) say(''); sync(); };
  redoB.onclick = () => { if (hist.redo()) say(''); sync(); };
  const more = el('details', { className: 'more' }, [el('summary', { textContent: 'More' })]);
  const file = el('div', { className: 'bar' });
  const exp = el('button', { textContent: 'Export' });
  exp.onclick = () => {
    const text = fileText(bakeOverrides(hist.now), snaps, buildCommit());   // (strokes folded into the grid: a page that loads the file pays no per-stroke cost)
    if (store) { noteExported(store, hist.now, clock.now()); sync(); }
    void navigator.clipboard?.writeText(text).then(() => say('Copied to the clipboard and downloaded.'), () => say('Downloaded (the clipboard was refused).'));
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'overrides.json' }); a.click(); URL.revokeObjectURL(a.href);
  };
  const save = el('button', { textContent: 'Save' }); save.onclick = () => {
    flushHistory();
    // (Save reloads the page: the view comes back with it, sessionStorage, once)
    const a = cel.rig.inspectAngles; if (session) saveView(session, { yaw: a.yaw, pitch: a.pitch, mode, organ: selOrgan, vessel: selVessel, panel: box.style.display !== 'none' });
    const baked = bakeOverrides(hist.now);
    if (differs(baked, hist.now)) hist.commit(baked, true);   // (the history then ends at what the reloaded page is built with, so it is kept)
    flushHistory();
    saveDraft(fileOverrides(baked, snaps, buildCommit()));
  };
  // Play slides with the edits: the panel and the pointer layer go, the free orbit is released (the slides' own camera, callouts and cards run), one quiet text control brings the editor back
  const playBack = el('button', { id: 'editor-back', textContent: 'Back to editing' }); playBack.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:calc(var(--z-perf,100) + 1);display:none;font:600 12px ui-monospace,Menlo,monospace;color:#fff;background:none;border:0;padding:10px;text-shadow:0 0 3px #000,0 0 6px #000;opacity:.8;touch-action:manipulation';
  document.body.append(playBack);
  const playB = el('button', { textContent: 'Play slides' });
  const setPlaying = (on: boolean): void => {
    playing = on;
    topbar.style.display = on ? 'none' : 'flex'; box.style.display = on ? 'none' : (panelB.classList.contains('on') ? 'block' : 'none');
    layer.style.display = on || mode === 'orbit' ? 'none' : 'block'; playBack.style.display = on ? 'block' : 'none';
    cel.rig.setInspect(!on); labelEl.style.opacity = '0';
    if (on) cel.setEditorOverlay(null); else sync();
  };
  playB.onclick = () => setPlaying(true); playBack.onclick = () => setPlaying(false);
  const panelB = el('button', { textContent: 'Panel' }); panelB.onclick = () => { box.style.display = box.style.display === 'none' ? 'block' : 'none'; panelB.classList.toggle('on', box.style.display !== 'none'); }; panelB.classList.add('on');
  const clear = el('button', { textContent: 'Clear draft' });
  clear.onclick = () => { if (confirm('Throw away the saved draft and reload?')) { clearDraft(); if (store) clearHistory(store); location.reload(); } };
  const dropO = el('button', { textContent: 'Drop orphan edits' }); dropO.onclick = () => { hist.commit(withoutOrphans(hist.now, known)); say('Dropped the edits that named nothing.'); sync(); };
  file.append(dropO);
  // snapshots and the committed file
  const snapName = el('input', { type: 'text', placeholder: 'Snapshot name' }); snapName.style.cssText = 'font:11px ui-monospace,Menlo,monospace;color:#fff;background:#fff2;border:1px solid #fff6;border-radius:6px;padding:6px;min-width:0;flex:1';
  const snapSel = el('select');
  const fillSnaps = (): void => { snapSel.replaceChildren(...Object.keys(snaps).map((n) => el('option', { value: n, textContent: n }))); };
  const takeSnap = el('button', { textContent: 'Snapshot' }); takeSnap.onclick = () => { const n = snapName.value.trim() || `snapshot ${Object.keys(snaps).length + 1}`; snaps = { ...snaps, [n]: core(hist.now) }; snapName.value = ''; fillSnaps(); snapSel.value = n; say(`Kept “${n}”. Export and Save carry it.`); sync(); };
  const restoreSnap = el('button', { textContent: 'Restore' }); restoreSnap.onclick = () => { const s0 = snaps[snapSel.value]; if (s0) { hist.commit(core({ ...s0, version: 1 })); say(`Restored “${snapSel.value}”. Undo takes it back.`); sync(); } };
  const dropSnap = el('button', { textContent: 'Delete' }); dropSnap.onclick = () => { const { [snapSel.value]: _gone, ...rest } = snaps; snaps = rest; fillSnaps(); sync(); };
  fillSnaps();
  const toCommitted = el('button', { textContent: 'Reset to committed' }); toCommitted.onclick = () => { if (confirm('Throw away every edit in the draft and go back to the committed file?')) { hist.commit(core(committedOverrides())); say('Back to the committed file. Undo takes it back.'); sync(); } };
  more.append(el('div', { className: 'bar' }, [snapName, takeSnap]), el('div', { className: 'bar' }, [snapSel, restoreSnap, dropSnap]), el('div', { className: 'bar' }, [toCommitted]));
  // Before: hold to see the committed file's shape, let go for the draft. Changes: what the draft changes, each with its own Reset.
  const holdB = el('button', { textContent: 'Hold: Before' });
  const hold = (on: boolean): void => { if (before !== on) { before = on; holdB.classList.toggle('on', on); sync(); } };
  holdB.addEventListener('pointerdown', (e) => { holdB.setPointerCapture(e.pointerId); hold(true); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) holdB.addEventListener(t, () => hold(false));
  const diffBox = el('div', { className: 'diff' });
  const refreshDiff = (): void => {
    if (!more.open) return;
    const items = diffList(hist.now, committedOverrides());
    diffBox.replaceChildren(el('div', { className: 'hint', textContent: items.length ? `${items.length} change${items.length === 1 ? '' : 's'} from the committed file:` : 'No changes from the committed file.' }),
      ...items.slice(0, 60).map((it) => {
        const b = el('button', { textContent: 'Reset' }); b.onclick = () => { hist.commit(resetItem(hist.now, committedOverrides(), it)); sync(); };
        return el('div', { className: 'row' }, [el('label', { textContent: `${it.kind === 'node' ? 'junction' : it.kind} ${it.id}` }), b]);
      }));
  };
  more.addEventListener('toggle', refreshDiff);
  more.append(el('div', { className: 'bar' }, [holdB]), diffBox);
  // Slides: which ones an edit touches, a jump list, and Go to any slide (the editor steps aside, as in Play slides)
  const slideBox = el('div', { className: 'diff' });
  const play = (deck: string, slide: number): void => { setPlaying(true); startTalk(deck, stopOf(slide)); };
  const editedPoints = (): V3[] => {
    const pts: V3[] = [];
    for (const it of diffList(hist.now, loaded.snapshots ? core(loaded) : loaded).concat(diffList(hist.now, committedOverrides()))) {
      if (it.kind === 'node') { const n = nodeById.get(it.id); if (n) pts.push(n.at); } else if (it.kind === 'vessel') { const v = vesselById.get(it.id); if (v) pts.push(...v.course); } else { const b = organBoxes[it.id], c = centroidOf(it.id); pts.push(c); if (b) pts.push(b.lo, b.hi, [b.lo[0], b.hi[1], c[2]], [b.hi[0], b.lo[1], c[2]]); }
    }
    return pts;
  };
  const findSlides = el('button', { textContent: 'Slides this edit touches' });
  findSlides.onclick = () => {
    const pts = editedPoints(); if (!pts.length) { slideBox.replaceChildren(el('div', { className: 'hint', textContent: 'No edits yet.' })); return; }
    const ids = [...new Set([...builtinDecks().map((d) => d.id), ...lazyDecks().map((d) => d.id)])], found: Touch[] = [];
    const show = (state: string): void => slideBox.replaceChildren(el('div', { className: 'hint', textContent: state }), ...found.slice(0, 80).map((t) => {
      const b = el('button', { textContent: 'Play' }); b.onclick = () => play(t.deck, t.slide);
      return el('div', { className: 'row' }, [el('label', { textContent: `${t.deckTitle}, slide ${t.slide + 1}: ${t.title}` }), b]);
    }));
    void (async () => {
      for (const [i, id] of ids.entries()) {
        show(`Reading talks ${i}/${ids.length}: ${found.length} slides so far`);
        try { const d = await loadDeck(id); if (d) found.push(...slidesTouching(d, pts)); } catch { /* a talk that cannot be read is skipped */ }
      }
      show(found.length ? `${found.length} slides show something you edited${found.length > 80 ? ' (first 80)' : ''}:` : 'No slide frames what you edited.');
    })();
  };
  const goDeck = el('select'); for (const id of new Set([...builtinDecks().map((d) => d.id), ...lazyDecks().map((d) => d.id)])) goDeck.append(el('option', { value: id, textContent: id }));
  const goNum = el('input', { type: 'number', min: '1', value: '1' }); goNum.style.cssText = 'width:56px;font:11px ui-monospace,Menlo,monospace;color:#fff;background:#fff2;border:1px solid #fff6;border-radius:6px;padding:4px';
  const goB = el('button', { textContent: 'Go to slide' }); goB.onclick = () => { if (goDeck.value) play(goDeck.value, Math.max(0, (goNum.valueAsNumber || 1) - 1)); };
  more.append(el('div', { className: 'bar' }, [findSlides]), slideBox, el('div', { className: 'bar' }, [goDeck, goNum, goB]));
  const paste = el('textarea', { placeholder: 'Paste an overrides file here, then Import', rows: 3 });
  paste.style.cssText = 'width:100%;box-sizing:border-box;font:11px ui-monospace,Menlo,monospace;color:#fff;background:#fff2;border:1px solid #fff6;border-radius:6px;padding:6px';
  const importText = (text: string, from: string): void => {
    const o = parseOverrides(text);
    if (!o) { say(`${from} is not an overrides file (version 1 JSON).`); sync(); return; }
    snaps = { ...snaps, ...(o.snapshots ?? {}) }; hist.commit(core(o)); say(`Imported ${from}: ${Object.keys(o.nodes ?? {}).length} junctions, ${Object.keys(o.vessels ?? {}).length} vessels, ${Object.keys(o.organs ?? {}).length} organs. Undo takes it back.`); sync();
  };
  const imp = el('button', { textContent: 'Import pasted' }); imp.onclick = () => importText(paste.value, 'the pasted text');
  const pick = el('input', { type: 'file', accept: 'application/json,.json' }); pick.style.display = 'none';
  pick.onchange = () => { const f = pick.files?.[0]; if (f) void f.text().then((t) => importText(t, f.name)); pick.value = ''; };
  const impFile = el('button', { textContent: 'Import file' }); impFile.onclick = () => pick.click();
  file.append(imp, impFile, pick);
  more.append(paste);
  file.append(exp, clear);
  more.append(file);
  topbar.append(el('span', { className: 'gap' }), undoB, redoB, save, playB, panelB);
  box.append(dyn, status, more, msgEl);

  // ── the pointer layer ──
  type Drag =
    | { kind: 'handle'; t: Target; from: Vector2; through: Vector3; start: { dx: number; dy: number; dz: number }; marked: boolean }
    | { kind: 'organ'; id: string; from: Vector2; through: Vector3; start: V3; marked: boolean }
    | { kind: 'cage'; id: string; idx: number; from: Vector2; through: Vector3; start: V3; marked: boolean }
    | { kind: 'brush'; id: string; last: Vector2; lastHit: Vector3; marked: boolean };
  let drag: Drag | null = null;
  const ray = new Raycaster();
  const organAt = (ndc: Vector2): { id: string; point: Vector3 } | null => {
    const ids = new Map<Object3D, string>();
    for (const [id, o] of cel.disease.organs.byId) ids.set(o.group, id);
    ray.setFromCamera(ndc, cel.rig.camera);
    const hits = ray.intersectObject(cel.disease.organs.group, true);
    for (const h of hits) { for (let o: Object3D | null = h.object; o; o = o.parent) { const id = ids.get(o); if (id && organIds().includes(id)) return { id, point: h.point }; } }
    return null;
  };
  const stagePx = (e: PointerEvent): { ndc: Vector2; x: number; y: number } => { const s = stage(); const x = e.clientX - s.x, y = e.clientY - s.y; return { ndc: ndcOf(x, y, s.w, s.h), x, y }; };

  // zoom and pan in the edit modes (the app has no pinch zoom elsewhere): two fingers on the layer, the wheel, or the buttons; the camera's own hand view carries it
  let view: HandView = { k: 1, x: 0, y: 0 };
  const putView = (v: HandView): void => { view = v; cel.rig.holdHand(); cel.rig.setHand(v); frameFor('editor', 300); };
  const fingers = new Map<number, [number, number]>();
  layer.addEventListener('wheel', (e) => { e.preventDefault(); putView(zoomPan(view, Math.exp(-e.deltaY * 0.0015))); sync(); }, { passive: false });
  layer.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size >= 2) { drag = null; return; }
    const { ndc, x, y } = stagePx(e), hitR = hitPx(e);
    layer.setPointerCapture(e.pointerId);
    showLabel(nameAt(e), e.clientX, e.clientY);
    if (mode === 'vessels') {
      const cands: Target[] = [], pts: ([number, number] | null)[] = [];
      const vn = visNodes();
      for (const n of vn) { cands.push({ kind: 'node', id: n.id }); pts.push(screenOf(nodeShown(n.id))); }
      const vid = target?.kind === 'ctrl' ? target.vid : selVessel;
      if (vid) for (const u of knotsOf(hist.now, vid)) { cands.push({ kind: 'ctrl', vid, u }); pts.push(screenOf(ctrlShown(vid, u))); }
      let i = nearest(pts.slice(vn.length), x, y, hitR);   // (the control points first: they sit on a vessel, over its junctions)
      i = i >= 0 ? i + vn.length : nearest(pts.slice(0, vn.length), x, y, hitR);
      if (i >= 0) {
        const t = cands[i]!; target = t;
        const at = t.kind === 'node' ? nodeShown(t.id) : ctrlShown(t.vid, t.u);
        drag = { kind: 'handle', t, from: ndc, through: toWorld(at), start: t.kind === 'node' ? nodeOf(hist.now, t.id) : controlOf(hist.now, t.vid, t.u), marked: false };
      } else {
        const lines = sk.vessels.map((v) => v.course.map((p) => screenOf(p) ?? [NaN, NaN] as [number, number]));
        const k = nearestLine(lines, x, y, hitR);
        const tapped = k >= 0 ? sk.vessels[k]!.id : null;
        const f = k >= 0 && tapped === vid ? nearestParam(lines[k]!, x, y, hitR) : null;
        if (tapped && tapped === vid && f !== null) {   // (a tap on the vessel that is already picked adds a control point there)
          const u = Math.round(uAtIndex(sk.vessels[k]!.course, f) * 1000) / 1000;
          if (u > 0.03 && u < 0.97) { hist.commit(addControl(hist.now, tapped, u)); target = { kind: 'ctrl', vid: tapped, u }; say('Point added: drag it to bend. Tap another place for more.'); sync(); return; }
        }
        selVessel = tapped; target = null;
      }
      sync(); return;
    }
    if (tool === 'cage' && selOrgan) {   // (a handle first: it sits over the organ)
      const hs = cageHandles(selOrgan), i = nearest(hs.map((h) => screenOf(h)), x, y, hitR);
      if (i >= 0) { drag = { kind: 'cage', id: selOrgan, idx: i, from: ndc, through: toWorld(hs[i]!), start: cageOffset(hist.now, selOrgan, i), marked: false }; sync(); return; }
    }
    const hit = organAt(ndc);
    if (hit && (tool !== 'liquify' || hit.id !== selOrgan)) { selOrgan = hit.id; buildDyn(); }
    if (!selOrgan) return;
    if (tool === 'move' && hit) {
      const c = new Box3().setFromObject(cel.disease.organs.byId.get(selOrgan)!.group).getCenter(new Vector3());
      drag = { kind: 'organ', id: selOrgan, from: ndc, through: c, start: organOf(hist.now, selOrgan).move, marked: false };
    } else if (tool === 'liquify' && hit && hit.id === selOrgan) drag = { kind: 'brush', id: selOrgan, last: ndc, lastHit: hit.point, marked: false };
    sync();
  });
  // the name of what is under the pointer: quiet text with a halo, eased in and out, placed by transform (no box)
  let labelText = '';
  const showLabel = (t: string | null, x: number, y: number): void => {
    if (t && t !== labelText) labelEl.textContent = t;
    if (t) { labelText = t; labelEl.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y - 22)}px)`; }
    labelEl.style.opacity = t ? '1' : '0';
  };
  const nameAt = (e: PointerEvent): string | null => {
    const { ndc, x, y } = stagePx(e), r = hitPx(e);
    if (mode === 'vessels') {
      const vn = visNodes(), i = nearest(vn.map((n) => screenOf(nodeShown(n.id))), x, y, r);
      if (i >= 0) return `Junction ${vn[i]!.id}`;
      const k = nearestLine(sk.vessels.map((v) => v.course.map((p) => screenOf(p) ?? [NaN, NaN] as [number, number])), x, y, r);
      return k >= 0 ? sk.vessels[k]!.id : null;
    }
    return organAt(ndc)?.id ?? null;
  };
  layer.addEventListener('pointerleave', () => showLabel(null, 0, 0));
  layer.addEventListener('pointermove', (e) => {
    const was = fingers.get(e.pointerId);
    if (was && fingers.size === 2) {
      const [other] = [...fingers].filter(([id]) => id !== e.pointerId).map(([, p]) => p), now: [number, number] = [e.clientX, e.clientY];
      if (other) putView(pinchView(view, was, other, now, other));
      fingers.set(e.pointerId, now); return;
    }
    if (was) fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (!drag) { if (e.pointerType !== 'touch') showLabel(nameAt(e), e.clientX, e.clientY); return; }
    showLabel(null, 0, 0);
    const { ndc } = stagePx(e);
    if (drag.kind === 'handle') {
      if (!drag.marked) { hist.mark(); drag.marked = true; }
      const w = dragDelta(cel.rig.camera, drag.through, drag.from, ndc);
      const d = toLocal(drag.through.clone().add(w)).sub(toLocal(drag.through));
      const m = dragToOffsets(drag.start, d, lock);
      edit(drag.t.kind === 'node' ? setNode(hist.now, drag.t.id, m) : setControl(hist.now, drag.t.vid, drag.t.u, m));
    } else if (drag.kind === 'cage') {
      if (!drag.marked) { hist.mark(); drag.marked = true; }
      const w = dragDelta(cel.rig.camera, drag.through, drag.from, ndc);
      const d = toLocal(drag.through.clone().add(w)).sub(toLocal(drag.through));
      const r = strokeToReference([d.x, d.y, d.z], 1, hist.now.organs?.[drag.id]).by;   // (the handle's offset is in the reference frame: undo the draft's turn and scale)
      edit(setCageHandle(hist.now, drag.id, drag.idx, [drag.start[0] + r[0], drag.start[1] + r[1], drag.start[2] + r[2]], cageLim(drag.id)));
    } else if (drag.kind === 'organ') {
      if (!drag.marked) { hist.mark(); drag.marked = true; }
      const w = dragDelta(cel.rig.camera, drag.through, drag.from, ndc);
      const d = toLocal(drag.through.clone().add(w)).sub(toLocal(drag.through));
      edit(setOrgan(hist.now, drag.id, { move: [drag.start[0] + d.x, drag.start[1] + d.y, drag.start[2] + d.z] }));
    } else {
      const hit = organAt(ndc);
      if (hit && hit.id === drag.id && hit.point.distanceTo(drag.lastHit) > radius * 0.35) {
        if (!drag.marked) { hist.mark(); drag.marked = true; }
        const w = dragDelta(cel.rig.camera, drag.lastHit, drag.last, ndc);
        const by = toLocal(drag.lastHit.clone().add(w)).sub(toLocal(drag.lastHit)).multiplyScalar(strength);
        const hp = toLocal(hit.point), at = toReference([hp.x, hp.y, hp.z], hist.now.organs?.[drag.id], centroidOf(drag.id));
        // (a stroke is in the organ's reference frame, organ-apply.ts: the mesh on screen carries the draft's move, turn and scale, so undo those)
        const st = strokeToReference([by.x, by.y, by.z], radius, hist.now.organs?.[drag.id]);
        edit(addStroke(hist.now, drag.id, { at, radius: st.radius, by: st.by }));
        drag.last = ndc; drag.lastHit = hit.point;
      }
    }
    sync();
  });
  const end = (e?: PointerEvent): void => { if (e) fingers.delete(e.pointerId); drag = null; flushStrokes(); settleStrokes(); };
  layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault(); if (e.shiftKey ? hist.redo() : hist.undo()) sync();
  });

  setMode('orbit');
  say('Orbit to look round; Vessels or Organs to edit.');
  const back = session ? loadView(session) : null;   // after a Save: the camera, the mode, the picks and the panel as they were
  if (session && back) {
    session.removeItem(VIEW_KEY);
    if (back.organ && organIds().includes(back.organ)) selOrgan = back.organ;
    if (back.vessel && vesselById.has(back.vessel)) selVessel = back.vessel;
    if (back.mode === 'vessels' || back.mode === 'organs') setMode(back.mode);
    cel.rig.inspectTo(back.yaw, back.pitch);
    box.style.display = back.panel ? 'block' : 'none'; panelB.classList.toggle('on', back.panel);
    say('Saved. Everything is rebuilt from your draft; the view is as you left it.');
  }
  sync();
}
