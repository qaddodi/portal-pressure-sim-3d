// The anatomy editor (?editor on the preview copy or a local run; docs/editor-plan.md, WS-C). A panel and a pointer layer over the figure:
//   Orbit    the inspector's free orbit (the figure turns all the way round; the figure's own gestures work)
//   Vessels  node handles (a junction: every vessel end there follows) and, on a tapped vessel, three control points; drag on the plane facing the camera, depth by slider
//   Organs   tap an organ, then Move (drag), sliders for move / turn / scale within the limits, or Liquify (drag over it: a brush of radius and strength)
// Undo / Redo, Save (keeps the draft in this browser and reloads: every consumer rebuilds from it), Export (clipboard + file), Clear draft.
// Nothing here runs per frame: the overlay is rewritten when an edit changes it, and a frame is asked for with frameFor. Layout reads go through layout-snap.
import { Box3, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { cel } from '../../../scene/api.ts';
import { frameFor } from '../../../clock/frame.ts';
import { readBox, readMetric } from '../../layout-snap.ts';
import { clearDraft, overrides, saveDraft } from '../../../editor/store.ts';
import { ORGAN_LIMITS, type Stroke, type V3 } from '../../../editor/types.ts';
import { liveTransform } from './live.ts';
import { LiveStrokes } from './strokes.ts';
import { clock } from '../../../clock/frame.ts';
import { Overlay } from './overlay.ts';
import { dragDelta, ndcOf, nearest, nearestLine } from './picking.ts';
import { skeleton, organIds, pointAt, centroidOf, type Skeleton } from './source.ts';
import { History, PLAN_PER_SCENE, dragToOffsets, toReference, strokeToReference, addStroke, clearStrokes, controlOf, exportText, nodeOf, organOf, resetNode, resetOrgan, resetVessel, setControl, setNode, setOrgan } from './state.ts';

type Mode = 'orbit' | 'vessels' | 'organs';
type Target = { kind: 'node'; id: string } | { kind: 'ctrl'; vid: string; u: number };
const CTRL_U = [0.25, 0.5, 0.75] as const;
const HIT_PX = 24;   // a finger, not a mouse
const loaded = overrides();   // the overrides this page was built with: handles and boxes show the shift from them

export function mountEditor(): void {
  if (document.getElementById('editor-panel')) return;
  const hist = new History(loaded);
  const sk: Skeleton = skeleton();
  const nodeById = new Map(sk.nodes.map((n) => [n.id, { id: n.id, at: n.pos, arms: n.arms }])), vesselById = new Map(sk.vessels.map((v) => [v.id, v]));
  const overlay = new Overlay();
  let mode: Mode = 'orbit', tool: 'move' | 'liquify' = 'move';
  let target: Target | null = null, selVessel: string | null = null, selOrgan: string | null = organIds()[0] ?? null;
  let radius = 0.08, strength = 0.5;
  let msg = '';

  const css = document.createElement('style');
  css.textContent = `
#editor-pill{position:fixed;left:150px;top:8px;z-index:var(--z-perf,100);padding:3px 10px;border-radius:999px;border:1px solid #fff8;background:#523;color:#fff;font:600 11px/18px ui-monospace,Menlo,monospace;touch-action:manipulation}
#editor-panel{position:fixed;left:8px;top:36px;z-index:var(--z-perf,100);width:min(340px,94vw);max-height:calc(100vh - 56px);overflow:auto;-webkit-overflow-scrolling:touch;padding:8px 10px;border-radius:12px;background:#000c;color:#fff;font:11px/1.5 ui-monospace,Menlo,monospace;display:none}
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
  const pill = el('button', { id: 'editor-pill', textContent: 'Editor' });
  const box = el('div', { id: 'editor-panel' });
  const layer = el('div', { id: 'editor-layer' });
  document.body.append(layer, pill, box);
  pill.onclick = () => { box.style.display = box.style.display === 'block' ? 'none' : 'block'; };
  box.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ── the draft ──
  const body = (): Object3D => cel.editorBody;
  const toWorld = (v: V3): Vector3 => body().localToWorld(new Vector3(v[0], v[1], v[2]));
  const toLocal = (w: Vector3): Vector3 => body().worldToLocal(w.clone());
  const planToScene = (dx: number, dy: number, dz: number): V3 => [dx / PLAN_PER_SCENE, -dy / PLAN_PER_SCENE, dz];
  const shift = (a: { dx: number; dy: number; dz: number }, b: { dx: number; dy: number; dz: number }): V3 => planToScene(a.dx - b.dx, a.dy - b.dy, a.dz - b.dz);
  const add = (p: V3, d: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
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
  const syncOrgans = (): void => {
    for (const id of [...Object.keys(hist.now.organs ?? {}), ...Object.keys(loaded.organs ?? {}), ...shownOrgans]) {
      const o = cel.disease.organs.byId.get(id); if (!o) continue;
      const t = liveTransform(loaded.organs?.[id], hist.now.organs?.[id], centroidOf(id));
      for (const m of o.group.children) { m.position.set(t.position[0], t.position[1], t.position[2]); m.rotation.y = t.rotY; m.scale.setScalar(t.scale); }
      shownOrgans.add(id);
      const list = hist.now.organs?.[id]?.strokes;
      if (list !== strokesShown.get(id)) { strokesShown.set(id, list); strokesDue.add(id); }
    }
    if (strokesDue.size && !strokesPending) { strokesPending = true; clock.after(flushStrokes, 0, 'editor-strokes'); }   // (one per frame, however many moves came in)
  };
  const strokesShown = new Map<string, readonly Stroke[] | undefined>(), strokesDue = new Set<string>(), liveStrokes = new Map<string, LiveStrokes>(), touched = new Set<string>();
  let strokesPending = false;
  const flushStrokes = (): void => {
    strokesPending = false;
    for (const id of strokesDue) {
      let ls = liveStrokes.get(id);
      if (!ls) {
        const g = cel.disease.organs.byId.get(id)?.toonMesh.geometry; if (!g) continue;
        ls = new LiveStrokes(g, loaded.organs?.[id], centroidOf(id)); liveStrokes.set(id, ls);
      }
      ls.set(hist.now.organs?.[id]?.strokes); touched.add(id);
    }
    strokesDue.clear();
    cel.setEditorOverlay(overlay.object); frameFor('editor', 300);
  };
  const settleStrokes = (): void => { for (const id of touched) liveStrokes.get(id)?.settle(); touched.clear(); cel.setEditorOverlay(overlay.object); };
  const refreshOverlay = (): void => {
    syncOrgans();
    const vessels = mode === 'vessels';
    overlay.dots('nodes', { pos: vessels ? sk.nodes.map((n) => nodeShown(n.id)) : [], size: 9, color: 0xffb347 });
    if (vessels && target?.kind === 'node') overlay.dots('pick', { pos: [nodeShown(target.id)], size: 16, color: 0xff3d71 });
    else if (vessels && target?.kind === 'ctrl') overlay.dots('pick', { pos: [ctrlShown(target.vid, target.u)], size: 16, color: 0xff3d71 });
    else overlay.clear('pick');
    const vid = vessels ? (target?.kind === 'ctrl' ? target.vid : selVessel) : null;
    if (vid && vesselById.has(vid)) {
      overlay.dots('ctrl', { pos: CTRL_U.map((u) => ctrlShown(vid, u)), size: 12, color: 0x41d6ff });
      overlay.line('sel', vesselById.get(vid)!.course, 0x41d6ff);
    } else { overlay.clear('ctrl'); overlay.clear('sel'); }
    if (mode === 'organs' && selOrgan) {
      const b = organBoxLocal(selOrgan);
      if (b) overlay.box('organ', b.lo, b.hi, 0xffb347);   // (the box is of the live meshes, which already carry the draft)
    } else overlay.clear('organ');
    cel.setEditorOverlay(overlay.object);   // (asks for a frame; the same object, so nothing is rebuilt)
    frameFor('editor', 300);
  };

  // ── the panel ──
  const syncers: (() => void)[] = [];
  const msgEl = el('div', { className: 'msg' });
  const status = el('div', { className: 'hint' });
  const modeBar = el('div', { className: 'bar' });
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
    i.oninput = () => { if (!sliding) { sliding = true; hist.mark(); } set(Number(i.value)); sync(); };
    i.onchange = () => { sliding = false; };
    syncers.push(show);
    return el('div', { className: 'row' }, [el('label', { textContent: label }), i, v]);
  };
  const say = (t: string): void => { msg = t; msgEl.textContent = t; };

  const edit = (next: typeof hist.now, coalesce = true): void => { hist.commit(next, coalesce); };
  const buildDyn = (): void => {
    syncers.length = 0; dyn.replaceChildren();
    syncers.push(() => { for (const [i, b] of [...modeBar.children].entries()) b.classList.toggle('on', ['orbit', 'vessels', 'organs'][i] === mode); });
    if (mode === 'orbit') {
      dyn.append(el('div', { className: 'hint', textContent: 'Drag turns the figure all the way round. Pinch and the other gestures work as usual.' }));
      dyn.append(bar([{ label: 'Face front', run: () => { cel.rig.inspectTo(0, 0); frameFor('editor', 900); } }, { label: 'Side', run: () => { cel.rig.inspectTo(Math.PI / 2, 0); frameFor('editor', 900); } }, { label: 'Top', run: () => { cel.rig.inspectTo(0, 1.2); frameFor('editor', 900); } }]));
    } else if (mode === 'vessels') {
      dyn.append(el('div', { className: 'hint', textContent: 'Orange: junctions (drag moves every vessel end there). Tap a vessel to get its three blue control points; drag one to bend it. Save applies the edit.' }));
      const sel = (): { get: () => { dx: number; dy: number; dz: number }; put: (m: { dx: number; dy: number; dz: number }) => void } | null => {
        const t = target; if (!t) return null;
        return t.kind === 'node'
          ? { get: () => nodeOf(hist.now, t.id), put: (m) => edit(setNode(hist.now, t.id, m)) }
          : { get: () => controlOf(hist.now, t.vid, t.u), put: (m) => edit(setControl(hist.now, t.vid, t.u, m)) };
      };
      const which = el('div', { className: 'hint' });
      syncers.push(() => { which.textContent = !target ? 'Nothing picked.' : target.kind === 'node' ? `Junction ${target.id}` : `${target.vid} at ${Math.round(target.u * 100)}%`; });
      dyn.append(which);
      dyn.append(slider('Depth (scene units)', -0.2, 0.2, 0.002, () => sel()?.get().dz ?? 0, (z) => { const s = sel(); if (s) { const g = s.get(); s.put({ ...g, dz: z }); } }));
      dyn.append(bar([{ label: 'Reset picked', off: () => !target, run: () => { const s = sel(); if (s) s.put({ dx: 0, dy: 0, dz: 0 }); } },
        { label: 'Reset vessel', off: () => !(target?.kind === 'ctrl' ? target.vid : selVessel), run: () => { const v = target?.kind === 'ctrl' ? target.vid : selVessel; if (v) { hist.commit(resetVessel(hist.now, v)); } } },
        { label: 'Reset junction', off: () => target?.kind !== 'node', run: () => { if (target?.kind === 'node') hist.commit(resetNode(hist.now, target.id)); } }]));
    } else {
      const s = el('select');
      for (const id of organIds()) s.append(el('option', { value: id, textContent: id }));
      s.value = selOrgan ?? ''; s.onchange = () => { selOrgan = s.value; sync(); };
      dyn.append(el('div', { className: 'row' }, [el('label', { textContent: 'Organ (or tap it)' }), s]));
      syncers.push(() => { s.value = selOrgan ?? ''; });
      dyn.append(bar([{ label: 'Move', on: () => tool === 'move', run: () => { tool = 'move'; } }, { label: 'Liquify', on: () => tool === 'liquify', run: () => { tool = 'liquify'; } }]));
      const o = (): ReturnType<typeof organOf> => organOf(hist.now, selOrgan ?? '');
      const axis = (n: 0 | 1 | 2, name: string): HTMLElement => slider(`Move ${name}`, -ORGAN_LIMITS.move, ORGAN_LIMITS.move, 0.002, () => o().move[n], (v) => { if (!selOrgan) return; const m = [...o().move] as [number, number, number]; m[n] = v; edit(setOrgan(hist.now, selOrgan, { move: m })); });
      dyn.append(axis(0, 'x'), axis(1, 'y'), axis(2, 'z'));
      dyn.append(slider('Turn (rad)', -ORGAN_LIMITS.rotY, ORGAN_LIMITS.rotY, 0.005, () => o().rotY, (v) => { if (selOrgan) edit(setOrgan(hist.now, selOrgan, { rotY: v })); }));
      dyn.append(slider('Scale', ORGAN_LIMITS.scaleMin, ORGAN_LIMITS.scaleMax, 0.005, () => o().scale, (v) => { if (selOrgan) edit(setOrgan(hist.now, selOrgan, { scale: v })); }));
      dyn.append(slider('Brush radius', 0.02, 0.3, 0.005, () => radius, (v) => { radius = v; }));
      dyn.append(slider('Brush strength', 0.1, 1, 0.05, () => strength, (v) => { strength = v; }));
      const strokes = el('div', { className: 'hint' }); syncers.push(() => { strokes.textContent = `${o().strokes} liquify strokes on ${selOrgan ?? '-'}. Liquify: drag over the organ to push its surface.`; });
      dyn.append(strokes);
      dyn.append(bar([{ label: 'Clear strokes', run: () => { if (selOrgan) hist.commit(clearStrokes(hist.now, selOrgan)); } }, { label: 'Reset organ', run: () => { if (selOrgan) hist.commit(resetOrgan(hist.now, selOrgan)); } }]));
    }
    sync();
  };
  const setMode = (m: Mode): void => {
    mode = m; target = null;
    layer.style.display = m === 'orbit' ? 'none' : 'block';
    cel.rig.setInspect(true);
    buildDyn();
  };
  const dirty = (): boolean => exportText(hist.now) !== exportText(loaded);
  const sync = (): void => {
    for (const f of syncers) f();
    status.textContent = `${dirty() ? 'Unsaved edits' : 'No edits since the last Save'} · ${Object.keys(hist.now.nodes ?? {}).length} junctions, ${Object.keys(hist.now.vessels ?? {}).length} vessels, ${Object.keys(hist.now.organs ?? {}).length} organs`;
    undoB.disabled = !hist.canUndo; redoB.disabled = !hist.canRedo;
    msgEl.textContent = msg; refreshOverlay();
  };

  for (const [m, label] of [['orbit', 'Orbit'], ['vessels', 'Vessels'], ['organs', 'Organs']] as const) { const b = el('button', { textContent: label }); b.onclick = () => setMode(m); modeBar.append(b); }
  const undoB = el('button', { textContent: 'Undo' }), redoB = el('button', { textContent: 'Redo' });
  undoB.onclick = () => { if (hist.undo()) say(''); sync(); };
  redoB.onclick = () => { if (hist.redo()) say(''); sync(); };
  const file = el('div', { className: 'bar' });
  const exp = el('button', { textContent: 'Export' });
  exp.onclick = () => {
    const text = exportText(hist.now);
    void navigator.clipboard?.writeText(text).then(() => say('Copied to the clipboard and downloaded.'), () => say('Downloaded (the clipboard was refused).'));
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'overrides.json' }); a.click(); URL.revokeObjectURL(a.href);
  };
  const save = el('button', { textContent: 'Save (reloads)' }); save.onclick = () => saveDraft(hist.now);
  const clear = el('button', { textContent: 'Clear draft' });
  clear.onclick = () => { if (confirm('Throw away the saved draft and reload?')) { clearDraft(); location.reload(); } };
  file.append(undoB, redoB, save, exp, clear);
  box.append(modeBar, dyn, status, file, msgEl);

  // ── the pointer layer ──
  type Drag =
    | { kind: 'handle'; t: Target; from: Vector2; through: Vector3; start: { dx: number; dy: number; dz: number }; marked: boolean }
    | { kind: 'organ'; id: string; from: Vector2; through: Vector3; start: V3; marked: boolean }
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

  layer.addEventListener('pointerdown', (e) => {
    const { ndc, x, y } = stagePx(e);
    layer.setPointerCapture(e.pointerId);
    if (mode === 'vessels') {
      const cands: Target[] = [], pts: ([number, number] | null)[] = [];
      for (const n of sk.nodes) { cands.push({ kind: 'node', id: n.id }); pts.push(screenOf(nodeShown(n.id))); }
      const vid = target?.kind === 'ctrl' ? target.vid : selVessel;
      if (vid) for (const u of CTRL_U) { cands.push({ kind: 'ctrl', vid, u }); pts.push(screenOf(ctrlShown(vid, u))); }
      let i = nearest(pts.slice(sk.nodes.length), x, y, HIT_PX);   // (the control points first: they sit on a vessel, over its junctions)
      i = i >= 0 ? i + sk.nodes.length : nearest(pts.slice(0, sk.nodes.length), x, y, HIT_PX);
      if (i >= 0) {
        const t = cands[i]!; target = t;
        const at = t.kind === 'node' ? nodeShown(t.id) : ctrlShown(t.vid, t.u);
        drag = { kind: 'handle', t, from: ndc, through: toWorld(at), start: t.kind === 'node' ? nodeOf(hist.now, t.id) : controlOf(hist.now, t.vid, t.u), marked: false };
      } else {
        const lines = sk.vessels.map((v) => v.course.map((p) => screenOf(p) ?? [NaN, NaN] as [number, number]));
        const k = nearestLine(lines, x, y, HIT_PX);
        selVessel = k >= 0 ? sk.vessels[k]!.id : null; target = null;
      }
      sync(); return;
    }
    const hit = organAt(ndc);
    if (hit && (tool === 'move' || hit.id !== selOrgan)) { selOrgan = hit.id; buildDyn(); }
    if (!selOrgan) return;
    if (tool === 'move' && hit) {
      const c = new Box3().setFromObject(cel.disease.organs.byId.get(selOrgan)!.group).getCenter(new Vector3());
      drag = { kind: 'organ', id: selOrgan, from: ndc, through: c, start: organOf(hist.now, selOrgan).move, marked: false };
    } else if (tool === 'liquify' && hit && hit.id === selOrgan) drag = { kind: 'brush', id: selOrgan, last: ndc, lastHit: hit.point, marked: false };
    sync();
  });
  layer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { ndc } = stagePx(e);
    if (drag.kind === 'handle') {
      if (!drag.marked) { hist.mark(); drag.marked = true; }
      const w = dragDelta(cel.rig.camera, drag.through, drag.from, ndc);
      const d = toLocal(drag.through.clone().add(w)).sub(toLocal(drag.through));
      const m = dragToOffsets(drag.start, d);
      edit(drag.t.kind === 'node' ? setNode(hist.now, drag.t.id, m) : setControl(hist.now, drag.t.vid, drag.t.u, m));
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
  const end = (): void => { drag = null; flushStrokes(); settleStrokes(); };
  layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault(); if (e.shiftKey ? hist.redo() : hist.undo()) sync();
  });

  setMode('orbit');
  say('Orbit to look round; Vessels or Organs to edit.');
  sync();
}
