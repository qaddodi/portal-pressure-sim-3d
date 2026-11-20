// Edit shapes: the builder's panel and handles (Settings > Edit shapes, shown with ?edit in the address). Pick a vessel or an organ, drag its handles (a finger or a mouse), set its depth,
// Copy the result as JSON, Reset to the source. The handles are DOM buttons moved by the clock's `tags` phase (transform only); nothing here exists while the mode is off.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { clock } from '../../clock/frame.ts';
import { cel } from '../api.ts';
import { useSettings } from '../../state/settings.ts';
import { ORGAN_IDS } from '../organs/meshes.ts';
import { ORGAN_Z } from '../organs/z.ts';
import { TIER_Z, x2d, x3, y2d, y3 } from '../frame2d.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { handleIndices } from './model.ts';
import { EDITABLE_VESSELS, organCentre, sourceOf, useEdit } from './store.ts';

const ORGAN_EDIT = ORGAN_IDS.filter((id) => id in ORGAN_Z);
const ray = new Raycaster(), ndc = new Vector2(), hit = new Vector3();
/** The scene point under a pointer, on the plane at depth z. */
function pointAt(clientX: number, clientY: number, z: number): Vector3 | null {
  const { w, h } = cel.rig.stageSize;
  ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
  ray.setFromCamera(ndc, cel.rig.camera);
  return ray.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -z), hit) ? hit.clone() : null;
}

/** The handles of the target, in scene units: a vessel's points at its depth, or the organ's centre. */
function handlesOf(): Vector3[] {
  const { target, edits } = useEdit.getState();
  if (!target) return [];
  if (target.kind === 'organ') { const c = organCentre(target.id); return c ? [c] : []; }
  const v = NETWORK_BY_ID.get(target.id);
  if (!v) return [];
  const pts = edits.vessels[target.id]?.pts ?? sourceOf(target.id), z = TIER_Z[v.tier] + (edits.vessels[target.id]?.dz ?? 0);
  return handleIndices(sourceOf(target.id)).map((i) => new Vector3(x3(pts[i]![0]), y3(pts[i]![1]), z));
}

const btn: React.CSSProperties = { font: '600 13px/1 var(--font-ui, system-ui)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--edge, #8886)', background: 'var(--surface, #fff)', color: 'var(--text, #111)', minHeight: 40 };

export function EditShapes() {
  const on = useSettings((s) => s.editShapes);
  return on ? <Panel /> : null;
}

function Panel() {
  const target = useEdit((s) => s.target);
  const edits = useEdit((s) => s.edits);
  const [note, setNote] = useState('');
  const handles = useRef<(HTMLDivElement | null)[]>([]);
  const n = useMemo(() => (target ? handlesOf().length : 0), [target]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the handles follow the camera and the edit: transform only, on the clock's tags phase
  useEffect(() => {
    const place = () => {
      const hs = cel.view === 'body' ? handlesOf() : [], p = { x: 0, y: 0 };
      handles.current.forEach((el, i) => {
        if (!el) return;
        const h = hs[i];
        if (!h) { el.style.opacity = '0'; return; }
        cel.rig.project(h, p);
        el.style.transform = `translate(${p.x - 22}px, ${p.y - 22}px)`;
        el.style.opacity = '1';
      });
    };
    const off = clock.on('tags', place, 5);
    place();
    clock.invalidate('edit-shapes');
    return off;
  }, [target, edits]);

  const drag = useRef<{ i: number; dx: number; dy: number; z: number } | null>(null);
  const down = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const h = handlesOf()[i];
    if (!h) return;
    const p = pointAt(e.clientX, e.clientY, h.z);
    drag.current = { i, dx: p ? h.x - p.x : 0, dy: p ? h.y - p.y : 0, z: h.z };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current, t = useEdit.getState().target;
    if (!d || !t) return;
    const p = pointAt(e.clientX, e.clientY, d.z);
    if (!p) return;
    const x = p.x + d.dx, y = p.y + d.dy;
    if (t.kind === 'vessel') useEdit.getState().moveVessel(t.id, d.i, x2d(x), y2d(y));
    else { const o = useEdit.getState().edits.organs[t.id] ?? { dx: 0, dy: 0, dz: 0 }, c = organCentre(t.id); if (c) useEdit.getState().moveOrgan(t.id, o.dx + (x - c.x), o.dy + (y - c.y)); }
  };
  const up = () => { drag.current = null; };

  const dz = target ? (target.kind === 'vessel' ? edits.vessels[target.id]?.dz ?? 0 : edits.organs[target.id]?.dz ?? 0) : 0;
  const key = target ? `${target.kind}:${target.id}` : '';
  const edited = Object.keys(edits.vessels).length + Object.keys(edits.organs).length;
  const flash = (s: string) => { setNote(s); window.setTimeout(() => setNote(''), 2200); };

  return (
    <>
      <div aria-hidden={false} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 'var(--z-chrome)' as unknown as number }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} ref={(el) => { handles.current[i] = el; }} onPointerDown={down(i)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            style={{ position: 'absolute', left: 0, top: 0, width: 44, height: 44, display: i < n ? 'grid' : 'none', placeItems: 'center', opacity: 0, touchAction: 'none', pointerEvents: 'auto', cursor: 'grab' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ff8a00', border: '3px solid #fff', boxShadow: '0 0 0 2px #000a', display: 'block' }} />
          </div>
        ))}
      </div>
      <div role="group" aria-label="Edit shapes" style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', maxWidth: 420, zIndex: 'var(--z-chrome)' as unknown as number, display: 'grid', gap: 8, padding: 12, borderRadius: 16, background: 'var(--surface, #fff)', border: '1px solid var(--edge, #8886)', color: 'var(--text, #111)', font: '500 13px/1.3 var(--font-ui, system-ui)', userSelect: 'none', WebkitUserSelect: 'none' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select aria-label="Shape to edit" value={key} style={{ ...btn, flex: 1, minWidth: 0 }}
            onChange={(e) => { const [k, ...r] = e.target.value.split(':'); useEdit.getState().setTarget(k ? { kind: k as 'vessel' | 'organ', id: r.join(':') } : null); }}>
            <option value="">Pick a vessel or organ…</option>
            <optgroup label="Organs">{ORGAN_EDIT.map((id) => <option key={id} value={`organ:${id}`}>{id}{edits.organs[id] ? ' •' : ''}</option>)}</optgroup>
            <optgroup label="Vessels">{EDITABLE_VESSELS.map((v) => <option key={v.id} value={`vessel:${v.id}`}>{v.label} ({v.id}){edits.vessels[v.id] ? ' •' : ''}</option>)}</optgroup>
          </select>
          <button type="button" style={btn} onClick={() => useSettings.getState().set('editShapes', false)}>Done</button>
        </div>
        {target ? (
          <label style={{ display: 'grid', gap: 4 }}>
            <span>{target.kind === 'vessel' ? 'Depth (whole vessel)' : 'Depth'}: {dz >= 0 ? '+' : ''}{dz.toFixed(3)}{target.kind === 'organ' ? ` on ${(ORGAN_Z[target.id] ?? 0).toFixed(2)}` : ''}</span>
            <input type="range" min={-0.4} max={0.4} step={0.005} value={dz} style={{ width: '100%', touchAction: 'pan-y' }}
              onChange={(e) => { const v = parseFloat(e.target.value); if (target.kind === 'vessel') useEdit.getState().setVesselDz(target.id, v); else useEdit.getState().setOrganDz(target.id, v); }} />
          </label>
        ) : <span style={{ opacity: 0.7 }}>Drag the orange dots. Pan and turn the figure as usual.</span>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={btn} onClick={() => void useEdit.getState().copy().then((ok) => flash(ok ? `Copied ${edited} edit${edited === 1 ? '' : 's'}` : 'Copy was blocked'))}>Copy</button>
          <button type="button" style={btn} disabled={!target} onClick={() => useEdit.getState().resetTarget()}>Reset this</button>
          <button type="button" style={btn} disabled={!edited} onClick={() => useEdit.getState().resetAll()}>Reset all</button>
          <span aria-live="polite" style={{ opacity: 0.8 }}>{note || (edited ? `${edited} edited` : '')}</span>
        </div>
      </div>
    </>
  );
}
