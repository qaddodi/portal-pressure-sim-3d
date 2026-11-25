// A measurement's reading cards on the figure (2D proc-anim.js `labels`, drawn by stage-cath.js as the HVPG catheter's are): the EUS-PPG's PV at the portal vein's target and HV at the hepatic vein's,
// the IR pressures' IVC, portal vein and PPG beside the catheter's tip, the HVPG measurement's FHVP, WHVP and the stack they come together in. The 2D spec says which cards stand now and what they print;
// this turns that into what the label layer's catheter cards (cath-show.ts) draw, and asks the figure's names to stand aside while the needle works (2D `quiet`). Pure but for the store it writes.
import { Vector3 } from 'three';
import { READS, markAt, specOf } from '../procedures/copied/proc-anim.js';
import { sceneApi } from '../api.ts';
import { useLabels, type ProcCards } from './store.ts';
import type { CalloutKind } from './cath-show.ts';
import type { Tone } from './cath.ts';
import { readFrame } from '../../ui/tests/slide/reads.ts';

/** The 2D card record (proc-anim.js): key 'f' stands at the tip, 'w' ahead of it, 'g' is the IR gradient (at the tip), 's' the stack with its rows and its result. */
interface Card { mid?: boolean; key?: string; at?: string; kicker?: string; text?: string; unit?: string; cls?: string; rows?: Card[]; calc?: Card }

/** A card's class as the layer's tone: the veins' own colours, or the band of a result. */
export function toneOfCls(cls: string | undefined, fallback: Tone): Tone {
  const c = (cls ?? '').split(' ');
  for (const w of ['danger', 'caution', 'ok'] as const) if (c.includes(w)) return w;
  if (c.includes('pv')) return 'pv';
  if (c.includes('ivc')) return 'ivc';
  if (c.includes('wedge')) return 'wedge';
  if (c.includes('free')) return 'free';
  return fallback;
}

/** What `labels` gave, as the layer's: which cards stand, the words they print (written into `into` in place) and the tones and names that need a new solve when they change. */
export function cardsOf(out: readonly Card[], into: ProcCards): { kinds: CalloutKind[]; sig: string } {
  const kinds: CalloutKind[] = [], text = into.text;
  let f = '', w = '', h = '', hv: number | null = null;
  for (const c of out) {
    if (c.key === 's') {
      kinds.push('s'); into.mid = !!c.mid;
      for (const r of c.rows ?? []) { if (r.at === 'ahead') { w = r.text ?? ''; into.kickers.w = r.kicker ?? into.kickers.w; into.tones.w = toneOfCls(r.cls, into.tones.w); } else { f = r.text ?? ''; into.kickers.f = r.kicker ?? into.kickers.f; into.tones.f = toneOfCls(r.cls, into.tones.f); } }
      h = c.calc?.text ?? ''; into.kickers.h = c.calc?.kicker ?? into.kickers.h;
      hv = Number.parseFloat(h); if (!Number.isFinite(hv)) hv = null;
    } else if (c.key === 'w' || c.at === 'ahead') {
      kinds.push('w'); w = c.text ?? ''; into.kickers.w = c.kicker ?? into.kickers.w; into.tones.w = toneOfCls(c.cls, into.tones.w);
    } else {
      // 'f' (the tip's) and the IR gradient 'g' (also at the tip, where it takes the place of the reading it follows)
      kinds.push('f'); f = c.text ?? ''; into.kickers.f = c.kicker ?? into.kickers.f; into.tones.f = toneOfCls(c.cls, into.tones.f);
    }
  }
  text.f = f; text.w = w; text.h = h; text.hv = hv;
  return { kinds, sig: kinds.join('') + '|' + into.kickers.f + '|' + into.kickers.w + '|' + into.kickers.h + '|' + into.tones.f + '|' + into.tones.w };
}

/** The two points the cards point to: the EUS-PPG's targets, or the catheter's tip and the point ahead of it. */
export const pointsOf = (kind: string) => (tip: Vector3, ahead: Vector3): boolean => sceneApi.procPoints(kind, tip, ahead);

export interface CardRun {
  frame(t: number, f: unknown): void;
  /** The run is over but its result stays (a talk slide's measurement, `keep`): the figure's names come back, the reading cards stay until `end()`. */
  rest(): void;
  end(): void;
}

/** The time from which a measurement's result has been read: the mark of its last reading (2D markT). From then the 2D spec takes the cards away as the scope or the catheter comes out. */
export function resultAt(kind: string): number {
  const spec = specOf(kind) as { steps?: unknown[] } | null;
  return spec?.steps?.length ? markAt(kind, spec.steps.length - 1) : Infinity;
}

/**
 * Starts a measurement's cards. `quiet`: the figure's names stand aside for the run (2D: the EUS-PPG's and the IR pressures'). `capture`: the run takes its own readings at the marks (the HVPG's; the
 * EUS-PPG's and the IR pressures' are taken by their panes, which also say the numbers). `keep`: the result, once read, stays where it was read when the 2D spec would take it away with the scope or
 * the catheter (a talk slide: Mohammad, 25 Nov, "the PPG-EUS calculation stays on the screen until we go to the next slide"); a time before the result (Back) takes it away as ever. Call
 * `frame(t, modelFrame)` from the procedure's frame and `end()` when it ends.
 */
export function runCards(kind: string, o: { quiet?: boolean; capture?: boolean; keep?: boolean; points?: (tip: Vector3, ahead: Vector3) => boolean } = {}): CardRun {
  const spec = specOf(kind) as { labels?(t: number, rd: unknown, f: unknown, out: Card[]): Card[]; capture?(i: number, rd: unknown, f: unknown): void; steps?: unknown[] } | null;
  const rd = (READS as unknown as Record<string, unknown>)[kind];
  const out: Card[] = [];
  const liveAt = o.points ?? pointsOf(kind), res = resultAt(kind), seat = { tip: new Vector3(), ahead: new Vector3(), has: false };
  let stands = false;   // the result has been read: its cards stand where they were read, whatever the scope or the catheter does next
  // (a kept result points where it was read: the catheter's tip has left by the time the 2D spec would take the cards away, and the cards must not follow it out)
  const points = !o.keep ? liveAt : (tip: Vector3, ahead: Vector3): boolean => {
    if (!stands) return liveAt(tip, ahead);
    if (!seat.has) { if (!liveAt(tip, ahead)) return false; seat.tip.copy(tip); seat.ahead.copy(ahead); seat.has = true; return true; }
    tip.copy(seat.tip); ahead.copy(seat.ahead);
    return true;
  };
  const into: ProcCards = { kinds: [], sig: '', kickers: { f: '', w: '', h: '' }, tones: { f: 'free', w: 'wedge' }, text: { f: '', w: '', h: '', hv: null }, points };
  let sig = '', got = -1, live = true;
  if (o.capture && rd) for (const k in rd as Record<string, number>) (rd as Record<string, number>)[k] = NaN;
  if (o.quiet) useLabels.getState().set({ quiet: true });
  const set = (kinds: CalloutKind[], s: string): void => { into.kinds = kinds; into.sig = s; useLabels.getState().set({ proc: { ...into } }); };
  return {
    frame(t, live0): void {
      if (!live || !spec?.labels) return;
      // (a reading is taken from the shown pressures, or the slide's own, never the instant's beat: tests/slide/reads.ts)
      const f = readFrame(live0 as Parameters<typeof readFrame>[0]);
      if (o.capture && spec.capture && spec.steps) {
        // each reading is taken once its callout has come (2D playProcedure: capture at the step's mark)
        for (let i = got + 1; i < spec.steps.length; i++) { if (t >= markAt(kind, i)) { spec.capture(i, rd, f); got = i; } else break; }
      }
      spec.labels(t, rd, f, out);
      if (o.keep) {
        if (t < res) { stands = false; seat.has = false; }
        else if (out.length || into.kinds.length) {
          // the result's own frame: where it is read is where it stands; what the 2D spec shows after it (nothing: it goes as the scope does) does not take it away
          if (!stands) { stands = true; seat.has = false; }
          if (!out.length) return;
        }
      }
      const r = cardsOf(out, into);
      if (r.sig !== sig) { sig = r.sig; set(r.kinds, r.sig); }
    },
    rest(): void {
      if (live && o.quiet) useLabels.getState().set({ quiet: false });
    },
    end(): void {
      if (!live) return;
      live = false;
      useLabels.getState().set({ proc: null, ...(o.quiet ? { quiet: false } : {}) });
    },
  };
}
