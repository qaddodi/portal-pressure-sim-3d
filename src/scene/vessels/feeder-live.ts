// A conditional group of tributaries (the epigastric network of the caput, the umbilical and the caudate's own lane) is graded, not on or off: 2D draws it at the model's own `live`, 0 to 1
// (stage-tubes.js feeders: `fd.live = lv`, `fd.w = w * k * fk * (0.5 + 0.5 * lv)`), so alpha is `live` and the width is `0.5 + 0.5 * live` of its full one: a caput network fills in, thin and faint, as the
// paraumbilical route is recruited, and thins out as it closes. Here that is a dither share (the object's `fade`, composed with the dive's and the Circuit's: scene.ts composeFade) and the vertex stage's
// `liveW`. The model's number is smooth in model time but arrives in steps (and a new patient jumps it), so what is drawn chases it at the rate the 2D draw-on and retract times give (PRESENCE_TIMES.other: 1500 in,
// 1100 out), never faster: nothing is taken off or put on in one frame. An unconditional group (`when` none) is always 1: it has no timer and costs nothing.
import type { VesselObject } from './vessel-object.ts';
import { PRESENCE_TIMES } from './presence-track.ts';

/** The 2D width share of a tributary group at `live`: half of it at none, all of it at 1. */
export const liveWidth = (live: number): number => 0.5 + 0.5 * live;
/** Below this a group is not drawn at all (2D binds a tributary or strand only while `live > 0.02`). */
export const LIVE_FLOOR = 0.02;

interface Entry { obj: VesselObject; conditional: boolean; target: number; cur: number; seen: boolean }

export class FeederLives {
  private entries = new Map<string, Entry>();
  /** `items`: the tributary groups' objects with whether the group is conditional (it has a `when`). A group starts whole; the first `set` of each puts it where it belongs without animating. */
  constructor(items: readonly { obj: VesselObject; id: string; conditional: boolean }[]) {
    for (const i of items) this.entries.set(i.id, { obj: i.obj, conditional: i.conditional, target: 1, cur: 1, seen: false });
  }

  has(id: string): boolean { return this.entries.has(id); }
  ids(): string[] { return [...this.entries.keys()]; }
  /** How much of the group is drawn now, 0 to 1 (what its fade and its width are made from). */
  liveOf(id: string): number { return this.entries.get(id)?.cur ?? 1; }

  /** The model's `live` for a group (feederLive); `instant` puts it there at once (a new patient, the first frame). */
  set(id: string, live: number, instant = false): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.target = Math.min(1, Math.max(0, live));
    if (instant || !e.seen) { e.seen = true; e.cur = e.target; this.write(e); }
  }

  /** Walks every group toward its model's `live` at the 2D in and out rates; true while one is on its way. `onChange` is called once if any group's drawing moved (the scene composes the fades again). */
  step(dtMs: number, onChange: () => void): boolean {
    let moving = false;
    for (const e of this.entries.values()) {
      if (e.cur === e.target) continue;
      const k = dtMs / (e.target > e.cur ? PRESENCE_TIMES.other.in : PRESENCE_TIMES.other.out);
      e.cur = Math.abs(e.target - e.cur) <= k ? e.target : e.cur + Math.sign(e.target - e.cur) * k;
      this.write(e);
      moving = true;
    }
    if (moving) onChange();
    return moving;
  }

  private write(e: Entry): void {
    e.obj.setLiveWidth(e.conditional ? liveWidth(e.cur) : 1);
  }
}
