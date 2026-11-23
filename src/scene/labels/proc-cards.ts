// A measurement's reading cards on the figure (2D proc-anim.js `labels`, drawn by stage-cath.js as the HVPG catheter's are): the EUS-PPG's PV at the portal vein's target and HV at the hepatic vein's,
// the IR pressures' IVC, portal vein and PPG beside the catheter's tip, the HVPG measurement's FHVP, WHVP and the stack they come together in. The 2D spec says which cards stand now and what they print;
// this turns that into what the label layer's catheter cards (cath-show.ts) draw, and asks the figure's names to stand aside while the needle works (2D `quiet`). Pure but for the store it writes.
import type { Vector3 } from 'three';
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
      if (c.mid) kinds.push('f', 'w', 'm'); else kinds.push('s');   // (mid: the EUS-PPG's pair keeps its two tags at their points and the calculation stands between them, not in a stack)
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

export interface CardRun { frame(t: number, f: unknown): void; end(): void }

/**
 * Starts a measurement's cards. `quiet`: the figure's names stand aside for the run (2D: the EUS-PPG's and the IR pressures'). `capture`: the run takes its own readings at the marks (the HVPG's; the
 * EUS-PPG's and the IR pressures' are taken by their panes, which also say the numbers). Call `frame(t, modelFrame)` from the procedure's frame and `end()` when it ends.
 */
export function runCards(kind: string, o: { quiet?: boolean; capture?: boolean } = {}): CardRun {
  const spec = specOf(kind) as { labels?(t: number, rd: unknown, f: unknown, out: Card[]): Card[]; capture?(i: number, rd: unknown, f: unknown): void; steps?: unknown[] } | null;
  const rd = (READS as unknown as Record<string, unknown>)[kind];
  const out: Card[] = [];
  const into: ProcCards = { kinds: [], sig: '', kickers: { f: '', w: '', h: '' }, tones: { f: 'free', w: 'wedge' }, text: { f: '', w: '', h: '', hv: null }, points: pointsOf(kind) };
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
      const r = cardsOf(out, into);
      if (r.sig !== sig) { sig = r.sig; set(r.kinds, r.sig); }
    },
    end(): void {
      if (!live) return;
      live = false;
      useLabels.getState().set({ proc: null, ...(o.quiet ? { quiet: false } : {}) });
    },
  };
}
