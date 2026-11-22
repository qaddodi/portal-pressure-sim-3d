// The lobule's words over the canvas: the zone names and the stations (portal venule, sinusoids, central vein with their pressures, the arteriole, the ductule, the lymph), as DOM in the figure's one
// label type (labels/labels.css), placed by the one label solver from the items captions.ts builds, moved by the clock (transform and opacity only). As every figure label they ride the picture while the camera pans or zooms it
// (labels/ride.ts) and are placed again once it is still where their carried places no longer hold.
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import '../labels/labels.css';
import '../circuit/captions.css';
import { clock } from '../../clock/frame.ts';
import { useLookId } from '../../looks/use-look.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi, talkRects } from '../../ui/ui-store.ts';
import { useShell } from '../../ui/shell/store.ts';
import { useLabels } from '../labels/store.ts';
import { cel } from '../api.ts';
import { type Box, leaderGeom, rectToBox } from '../labels/geometry.ts';
import { makeMeasure } from '../labels/LabelLayer.tsx';
import { type Placement, solve } from '../labels/solver.ts';
import { restyle } from '../labels/roll.ts';
import { LS, baselineAt, fontPx, lookVars, typeVars } from '../labels/type.ts';
import { type CapMeta, buildLobuleCaptions, lobuleLabelView, readingSig, readingText } from './captions.ts';
import { footBlocker, useFootNote } from '../../ui/shell/foot-note.ts';
import { creditClaim } from '../labels/credit-claim.ts';
import { Ride, RoomFade, boxesFit } from '../labels/ride.ts';
import { HandWatch } from '../labels/hand-watch.ts';

interface El { root: HTMLElement; name: HTMLElement; val: HTMLElement | null; lead: HTMLElement | null; ring: HTMLElement | null; ringTx: string; tx: string; text: string; valText: string; size: string }
const boxKey = (b: Box): string => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`;

export function LobuleCaptions() {
  const layer = useRef<HTMLDivElement>(null);
  const lookId = useLookId();
  const lookRef = useRef(lookId); lookRef.current = lookId;
  const retype = useRef<() => void>(() => {});
  useEffect(() => { retype.current(); }, [lookId]);

  useEffect(() => {
    const root = layer.current!;
    const measure = makeMeasure();
    const els = new Map<string, El>();
    const v3 = new Vector3(), pt = { x: 0, y: 0 }, w3: [number, number, number] = [0, 0, 0];
    let placed = new Map<string, Placement>(), metas = new Map<string, CapMeta>();
    const gate = new Ride(), roomFade = new RoomFade(), pa = { x: 0, y: 0 }, pb = { x: 0, y: 0 }, pc = { x: 0, y: 0 }, pd = { x: 0, y: 0 }, rp = { x: 0, y: 0 };
    let alpha = 0, last = -1, wasShown = false, hold: { release(): void } | null = null;

    const putVars = () => {
      const { vp } = useUi.getState();
      for (const [k, v] of Object.entries({ ...typeVars(vp), ...lookVars(lookRef.current, vp) })) root.style.setProperty(k, v);
      root.style.setProperty('--cc-ink', (LS.LOOKS as Record<string, Record<string, string>>)[lookRef.current]!['text-3']!);
      gate.invalidate();
    };
    putVars();
    retype.current = putVars;
    const offUi = useUi.subscribe((s, p) => { if (s.vp !== p.vp) putVars(); });

    const proj = (x: number, y: number): [number, number] => {
      cel.lobule.anchorAt(x, y, w3);
      cel.rig.project(v3.set(w3[0], w3[1], w3[2]), pt);
      return [pt.x, pt.y];
    };
    const view = (): Box => lobuleLabelView(useUi.getState().vp, BAR, cel.rig.targetRoom);
    const blockers = (): Box[] => {
      const out = talkRects(useUi.getState().boxes).map(rectToBox), note = footBlocker(useFootNote.getState().rect);
      return note ? [...out, note, ...creditClaim.boxes] : [...out, ...creditClaim.boxes];   // (the foot note, while it shows: no name, reading or leader stands under it)
    };

    const make = (id: string, m: CapMeta): El => {
      const r = document.createElement('div');
      r.className = `lb cc cc-${m.kind}`;
      r.dataset.target = m.target;
      const name = document.createElement('span'); name.className = 'lb-name'; r.appendChild(name);
      let val: HTMLElement | null = null, lead: HTMLElement | null = null, ring: HTMLElement | null = null;
      if (m.kind === 'station') {
        val = document.createElement('span'); val.className = 'lb-val'; r.appendChild(val);
        lead = document.createElement('i'); lead.className = 'lb-lead'; root.appendChild(lead);
        ring = document.createElement('i'); ring.className = 'lb-anchor'; root.appendChild(ring);   // (2D draws the dot on what each name names, leader or none)
      }
      root.appendChild(r);
      const e: El = { root: r, name, val, lead, ring, ringTx: '', tx: '', text: '', valText: '', size: '' };
      els.set(id, e);
      return e;
    };

    /** a slide is on: its readings carry their unit */
    const onSlide = () => useLabels.getState().presenting;
    const solveNow = () => {
      const { vp } = useUi.getState();
      const level = useShell.getState().figure.labelLevel;
      const m = cel.lobule.inkContext()?.model ?? null;
      const L = cel.lobule.currentLayers;
      const vw = view(), bl = blockers();
      const ROOM = 64;   // (a tract takes the names only with room round it for them: the venule at least this far inside the view)
      const inView = (x: number, y: number) => x > vw.x0 + ROOM && x < vw.x1 - ROOM && y > vw.y0 + ROOM && y < vw.y1 - ROOM && !bl.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
      const built = buildLobuleCaptions({ proj, vp, measure, net: cel.lobule.net, layers: { zones: L.zones, lymph: L.lymph }, hide: !m, inView, unit: onSlide() });
      const items = level === 'none' ? built.items.filter((it) => it.id.startsWith('z:')) : built.items;
      const out = solve({ items, view: vw, blockers: bl, lines: built.lines, keep: built.keep });
      placed = new Map(out.placed.map((p) => [p.id, p]));
      metas = built.meta;
      itemsNow = new Map(items.map((it) => [it.id, it]));
      const stand = new Set(placed.keys());
      for (const [id, e] of els) if (!stand.has(id)) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); e.ring?.removeAttribute('data-on'); }
      for (const [id, p] of placed) {
        const mt = metas.get(id)!;
        const e = els.get(id) ?? make(id, mt);
        const f = mt.forms[Math.min(p.form, mt.forms.length - 1)]!;
        // (the words first: a caption that is showing crosses over to its new words from the caption as it stood; an empty one takes no room: labels.css `:empty`)
        if (e.text !== f.name) restyle(e.root, () => { e.text = f.name; e.name.textContent = f.name; }, e.text ? alpha : 0);   // (a caption with no words yet has nothing to cross over from)
        const size = `${p.w}x${p.h}|${p.form}`;
        if (e.size !== size) {
          e.size = size;
          e.root.style.width = `${Math.round(p.w * 100) / 100}px`; e.root.style.height = `${Math.round(p.h * 100) / 100}px`;
          e.root.dataset.form = f.name ? '0' : '2';
          e.root.style.setProperty('--b', `${Math.round(baselineAt(p.h, LS.PAD.y) * 100) / 100}px`);
          if (mt.kind === 'zone') e.name.style.fontSize = `${fontPx(10.5, vp)}px`;
        }
        e.root.setAttribute('aria-label', mt.label);
        if (e.val) {
          const v = !f.value ? '' : m ? readingText(mt.read, m, false, onSlide()) : '?';
          if (e.valText !== v) { e.valText = v; e.val.textContent = v; }
        }
      }
    };
    let itemsNow = new Map<string, import('../labels/solver.ts').Item>();

    /** The readings as the model has them now, written in place into the names that stand (no solve, no fade): the numbers move with the pulse and the treatments, the places do not. */
    const refreshReadings = () => {
      const m = cel.lobule.inkContext()?.model ?? null;
      for (const [id, p] of placed) {
        const mt = metas.get(id), e = els.get(id);
        if (!mt || !e?.val) continue;
        const f = mt.forms[Math.min(p.form, mt.forms.length - 1)]!;
        const v = !f.value ? '' : m ? readingText(mt.read, m, false, onSlide()) : '?';
        if (e.valText !== v) { e.valText = v; e.val.textContent = v; }
      }
    };

    /** Everything that decides what the words say and where they may stand but the picture's place on the screen (a pan only carries them). */
    const layoutSig = (): string => {
      const { vp, boxes } = useUi.getState();
      const L = cel.lobule.currentLayers, m = cel.lobule.inkContext()?.model;
      return [vp.w, vp.h, L.zones, L.lymph, useShell.getState().figure.labelLevel, boxKey(rectToBox(boxes.free)), blockers().map(boxKey).join(';'), boxKey(view()), lookRef.current,
        readingSig(m, onSlide()), onSlide()].join('|');   // (the readings' widths, never their values: a value that moves a tenth is written in place, refreshReadings, and sends nothing through a fade)
    };
    const boxesOf = () => {
      const out: { ax: number; ay: number; dx: number; dy: number; w: number; h: number }[] = [];
      for (const [id, p] of placed) { const it = itemsNow.get(id); if (it) out.push({ ax: it.ax, ay: it.ay, dx: p.dx, dy: p.dy, w: p.w, h: p.h }); }
      return out;
    };
    const hand = new HandWatch();
    const tick = () => {
      const now = clock.now(), dt = last < 0 ? 16 : Math.min(100, now - last);
      last = now;
      const on = cel.view === 'lobule' && cel.lobule.group.visible;
      // (four corners of a square on the plate: the dots ride the plate's own perspective, exact under a tilt, ride.ts)
      // (Off: the corners stay where they were last read. They were set to 0, so a name still fading out as the view went away was carried by a collapsed quad to the screen's corner, 700 to 1300 px in one
      //  frame at half opacity: Presinusoidal stop 7, 21 Nov audit.)
      if (on) { const a = proj(0, 0), b = proj(1, 0), c = proj(1, 1), d = proj(0, 1); pa.x = a[0]; pa.y = a[1]; pb.x = b[0]; pb.y = b[1]; pc.x = c[0]; pc.y = c[1]; pd.x = d[0]; pd.y = d[1]; }
      const g = gate.step({ now, dt, on, moving: cel.rig.isMoving, byHand: hand.step(cel.rig.handView, cel.rig.isMoving), a: pa, b: pb, c: pc, d: pd, layout: layoutSig, fits: (ride) => boxesFit(boxesOf(), ride, view(), blockers()) });
      if (g.solve) { solveNow(); if (typeof location !== 'undefined' && /[?&]capwhy\b/.test(location.search)) console.info('[lobule-captions] re-placed:', gate.why, gate.whySig); } else if (alpha > 0) refreshReadings();
      alpha = g.alpha;
      if (alpha > 0 || wasShown) {
        const walls = blockers(), room = view();
        let any = false;
        for (const [id, e] of els) {
          const p = placed.get(id), it = itemsNow.get(id);
          if (!p || !it) continue;
          // (the dot rides the picture; the words keep their place beside it; one carried under a card or past the edge fades out whole and back once it stands clear: never seen cut)
          gate.ride(it.ax, it.ay, rp);
          const ax = rp.x, ay = rp.y, bx = ax + p.dx, by = ay + p.dy;
          const a = alpha * roomFade.of(id, { x0: bx, y0: by, x1: bx + p.w, y1: by + p.h }, room, walls, dt);
          if (a <= 0) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); e.ring?.removeAttribute('data-on'); continue; }
          any = true;
          const op = String(Math.round(a * 1000) / 1000);
          const tx = `translate3d(${Math.round(bx * 100) / 100}px,${Math.round(by * 100) / 100}px,0)`;
          if (tx !== e.tx) { e.root.style.transform = tx; e.tx = tx; }
          e.root.style.opacity = op;
          e.root.setAttribute('data-on', '');
          if (e.ring) {
            const rt = `translate(${Math.round(ax * 100) / 100}px,${Math.round(ay * 100) / 100}px)`;
            if (rt !== e.ringTx) { e.ring.style.transform = rt; e.ringTx = rt; }
            e.ring.style.opacity = op; e.ring.setAttribute('data-on', '');
          }
          if (e.lead) {
            if (p.leader) {
              const gm = leaderGeom(ax, ay, { x0: bx, y0: by, x1: bx + p.w, y1: by + p.h });
              e.lead.style.transform = `translate(${Math.round(gm.x * 100) / 100}px,${Math.round(gm.y * 100) / 100}px) rotate(${gm.angle.toFixed(4)}rad) scaleX(${Math.round(gm.len * 100) / 100})`;
              e.lead.style.opacity = op; e.lead.setAttribute('data-on', '');
            } else e.lead.removeAttribute('data-on');
          }
        }
        wasShown = any;
        if (alpha === 0) { for (const e of els.values()) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); e.ring?.removeAttribute('data-on'); } roomFade.clear(); }
      }
      const busy = g.busy;
      if (busy && !hold) hold = clock.hold('lobule-captions');
      else if (!busy && hold) { hold.release(); hold = null; }
    };
    const off = clock.on('tags', tick, 1);
    // (a store change only asks for a frame: everything the words depend on is in the layout signature, compared at rest. They used to force a new placement on ANY change of the shell store, which
    //  changes all the time, so the names faded out and in again and again: the flashing, 20 Nov. Only what the signature cannot see, a font or the type variables, forces one.)
    const wake = () => { clock.invalidate('lobule-captions'); };
    const refont = () => { gate.invalidate(); clock.invalidate('lobule-captions'); };
    const offShell = useShell.subscribe(wake);
    const offUi2 = useUi.subscribe((s, p) => { if (s.boxes !== p.boxes) wake(); });
    const offFoot = useFootNote.subscribe(wake);
    void document.fonts?.ready.then(refont);
    return () => { off(); offShell(); offUi(); offUi2(); offFoot(); hold?.release(); for (const e of els.values()) { e.root.remove(); e.lead?.remove(); e.ring?.remove(); } };
  }, []);

  return <div ref={layer} className="lb-layer cc-layer" aria-hidden="true" />;
}
