// The Circuit view: the change between the Anatomy and the Circuit, the circuit's quarter turn, and what stands on the map. One owner of the change's clock (the 2D stage's viewClock),
// of the turn's, and of the vessels' tracks. The scene calls `update(now)` once a frame (the clock's camera phase) and asks `moving` whether another frame is needed.
//   t   the change's eased share, 0 the body, 1 the map (a tween from where it stands to the end asked for, the camera's own ease and length: they land together)
//   rr  the turn's eased share, 0 the wide map, 1 upright (flow bottom to top); it is part of the map course, never of the world, so nothing pops at either end
import { Ease } from '../../clock/ease.ts';
import { easeInOutCubic } from '../../clock/tween.ts';
import { COURSES, N_TRACK } from './course.ts';
import { MAP_CENTRE, turnAngle } from './map.ts';
import { needsTrack, morphInto, tangentsInto } from './morph.ts';
import { createCircuitShared, type CircuitShared } from './uniforms.ts';
import { TURN_MS, VIEW_CHANGE_MS } from './data.copied.ts';
import { MAPPED } from '../vessels/network.ts';

/** A value that glides from where it stands to a target in ms, on the cubic in-out the camera uses: an Ease (it holds the clock itself), stepped by `update(now)` too so a hand-turned `now` drives it. */
class Glide {
  private readonly e: Ease;
  constructor(v: number, tag: string) { this.e = new Ease(v, tag); }
  get value(): number { return this.e.value; }
  get target(): number { return this.e.target; }
  aim(to: number, now: number, ms: number): void {
    if (to === this.e.target) return;
    this.e.to(to, { ms, curve: easeInOutCubic, at: now });
  }
  /** Steps to `now`; returns whether it is still on its way. */
  step(now: number): boolean { this.e.step(now); return this.e.moving; }
  set(v: number): void { this.e.snap(v); }
}

export interface CircuitVesselHandle {
  id: string;
  /** the vessel's `len` uniform and `circRow` uniform */
  len: { value: number };
  circRow: { value: number };
}

export class CircuitView {
  readonly shared: CircuitShared;
  private readonly change = new Glide(0, 'circuit-change');
  private readonly turn = new Glide(0, 'circuit-turn');
  private readonly rows = new Map<string, number>();
  private readonly handles: CircuitVesselHandle[] = [];
  private readonly tex: Float32Array;
  private readonly m = new Float32Array(3 * N_TRACK);
  private readonly base = new Float32Array(3 * N_TRACK);
  private readonly tan = new Float32Array(3 * N_TRACK);
  private lastKey = '';
  private trackOn = false;
  private lenKey = -1;
  /** reduced motion: no glide, the change and the turn land at once */
  reduceMotion = false;

  constructor() {
    MAPPED.forEach((v, k) => this.rows.set(v.id, 2 * k));
    this.shared = createCircuitShared(2 * MAPPED.length);
    this.tex = this.shared.circTrack.value.image.data as unknown as Float32Array;
  }

  /** The vessels' uniforms the view writes (the scene hands them over as it builds them). */
  attach(h: CircuitVesselHandle): void { this.handles.push(h); }

  /** The change's eased share and the turn's. */
  get t(): number { return this.change.value; }
  get rr(): number { return this.turn.value; }
  /** Whether the view is on its way to the map, or on it. */
  get toCircuit(): boolean { return this.change.target === 1; }
  get upright(): boolean { return this.turn.target === 1; }
  get moving(): boolean { return this.change.value !== this.change.target || this.turn.value !== this.turn.target; }

  /** Turn the figure toward the map (true) or back to the body (false). The camera is asked for the same length by the caller (`changeMs`). */
  go(circuit: boolean, now: number): void {
    const to = circuit ? 1 : 0;
    this.change.aim(to, now, this.reduceMotion ? 0 : this.changeMs(to));
  }
  /** How long the change takes from where it stands to `to` (the 2D app's viewXfLeftMs: the share still to go on its one clock). */
  changeMs(to = this.change.target): number { return this.reduceMotion ? 0 : Math.abs(to - this.change.value) * VIEW_CHANGE_MS; }
  /** Stand the map upright (flow bottom to top) or lay it wide again. */
  setUpright(on: boolean, now: number): void { this.turn.aim(on ? 1 : 0, now, this.reduceMotion ? 0 : TURN_MS * Math.abs((on ? 1 : 0) - this.turn.value)); }
  /** Lay the turn at once (the map is not showing, so nothing is seen to move). */
  snapTurn(upright: boolean): void { this.turn.set(upright ? 1 : 0); this.lastKey = ''; }
  /** Both at once, with nothing moving (a deep link, the first frame). */
  snap(circuit: boolean, upright: boolean): void { this.change.set(circuit ? 1 : 0); this.turn.set(upright ? 1 : 0); this.lastKey = ''; }

  /** Steps the change and the turn and writes the shared uniforms and the vessels' tracks. Returns true while either moves. */
  update(now: number): boolean {
    const a = this.change.step(now), b = this.turn.step(now);
    const t = this.change.value, rr = this.turn.value;
    const s = this.shared;
    s.circT.value = t;
    const ang = turnAngle(rr);
    s.circRot.value.set(Math.cos(ang), Math.sin(ang));
    s.circM.value.set(MAP_CENTRE.x, MAP_CENTRE.y, MAP_CENTRE.z);
    this.writeTracks(t, rr);
    return a || b;
  }

  private writeTracks(t: number, rr: number): void {
    const key = `${t}|${rr}`;
    const mid = t > 0 && t < 1;
    if (key === this.lastKey) return;
    this.lastKey = key;
    let wrote = false;
    for (const h of this.handles) {
      const g = COURSES.get(h.id);
      const row = this.rows.get(h.id);
      if (!g || row === undefined) continue;
      let on = false;
      if (mid && needsTrack(g, rr)) {
        on = morphInto(g, t, rr, this.m, this.base);
        if (on) {
          tangentsInto(this.m, this.tan);
          const d0 = row * N_TRACK * 4, d1 = (row + 1) * N_TRACK * 4;
          for (let i = 0; i < N_TRACK; i++) {
            this.tex[d0 + 4 * i] = this.m[3 * i]! - this.base[3 * i]!; this.tex[d0 + 4 * i + 1] = this.m[3 * i + 1]! - this.base[3 * i + 1]!; this.tex[d0 + 4 * i + 2] = this.m[3 * i + 2]! - this.base[3 * i + 2]!; this.tex[d0 + 4 * i + 3] = 0;
            this.tex[d1 + 4 * i] = this.tan[3 * i]!; this.tex[d1 + 4 * i + 1] = this.tan[3 * i + 1]!; this.tex[d1 + 4 * i + 2] = this.tan[3 * i + 2]!; this.tex[d1 + 4 * i + 3] = 0;
          }
          wrote = true;
        }
      }
      h.circRow.value = on ? row : -1;
      // the flow marks keep their pitch in scene units: the vessel's length is its body course's, then the map course's
      h.len.value = g.lenA + (g.lenC - g.lenA) * t;
    }
    if (wrote) this.shared.circTrack.value.needsUpdate = true;
    this.trackOn = wrote;
  }

  /** Whether the vessels' lengths are the body's (for a test) */
  get tracksOn(): boolean { return this.trackOn; }
  get lengthsAt(): number { return this.lenKey; }
}
