// ?audit, the sequential pass (external review, finding 9): the indexed sweep jumps to each stop by number, which proves a stop can be reached but not that a person can walk to it. This pass starts a talk at its
// first stop and presses Next one press at a time through every beat and page to the end, and at each new stop's edge presses Back and Next again (the stop must come back to the same place). At every stop it
// reads the card headings and the visible targets and clicks each tab-like selector once. It says, per talk and size, which stops were INTENDED (the talk has them), REACHED (this pass stood on them) and SKIPPED.
// The page is read through a `Driver`, so a Node test walks a fake talk.
import type { Step } from './run.ts';
import type { AuditFinding } from './judge.ts';

export interface Where { stop: number; beat: number; page: number | 'last'; ended: boolean }
export interface Driver {
  total: number;
  now(): Where;
  press(m: 'next' | 'back'): void;
  /** the headings of the cards standing now, and how many visible buttons and links a person could press */
  headings(): string[];
  targets(): number;
  /** clicks each tab-like selector of the cards standing now that is not selected; returns how many it clicked */
  selectors(): Promise<number>;
  /** the stop's kind and name, for the report ("slide", "Wedge to lobule") */
  nameOf(stop: number): { kind: string; name: string };
  go(stop: number): void;
}
/** What the pass proved for one talk at one size. */
export interface SequenceProof {
  deck: string; intended: number; reached: number[]; skipped: number[];
  /** stops where Back from the next stop did not come back to it, 1-based */
  backFailed: number[];
  /** slide stops that showed no card heading, 1-based */
  noHeading: number[];
  /** where Next did nothing though the talk had not ended (1-based), or null */
  stuckAt: number | null;
  presses: number; selectorsClicked: number; targetsSeen: number;
}
const same = (a: Where, b: Where) => a.stop === b.stop && a.beat === b.beat && a.page === b.page && a.ended === b.ended;

/** The steps of one talk's pass. `proof` is filled in as it goes (a stopped or crashed run keeps what was proved so far). */
export async function* sequence(d: Driver, deck: string, o: { edges: boolean; maxPresses?: number }, proof: SequenceProof): AsyncGenerator<Step> {
  const reached = new Set<number>(), edged = new Set<number>(), cap = o.maxPresses ?? d.total * 10 + 30;
  proof.intended = d.total;
  const stand = async (flags: AuditFinding[]) => {
    const w = d.now(); if (w.ended) return;
    const first = !reached.has(w.stop); reached.add(w.stop); proof.reached = [...reached].sort((a, b) => a - b); proof.skipped = Array.from({ length: d.total }, (_, i) => i).filter((i) => !reached.has(i)).map((i) => i + 1);
    if (!first) return;
    const info = d.nameOf(w.stop), hs = d.headings(), t = d.targets();
    proof.targetsSeen += t;
    if (info.kind === 'slide' && !hs.length) { proof.noHeading.push(w.stop + 1); flags.push({ kind: 'no-heading', sev: 'warn', what: `stop ${w.stop + 1} "${info.name}" stands with no card heading showing`, where: `${deck}, stop ${w.stop + 1}` }); }
    proof.selectorsClicked += await d.selectors();
  };
  // the first stop is stood on by going there (a talk opens on its first stop)
  const start: Step = { group: deck, id: `${deck}:seq:start`, label: 'sequential pass: start of the talk', run: () => { d.go(0); }, flags: [] };
  yield start; { const f: AuditFinding[] = []; await stand(f); start.flags!.push(...f); }
  for (let n = 0; n < cap; n++) {
    const before = d.now();
    if (before.ended) break;
    const flags: AuditFinding[] = [];
    const nx: Step = { group: deck, id: `${deck}:seq:${n}`, label: `Next press ${n + 1} (stop ${before.stop + 1} of ${d.total})`, run: () => { d.press('next'); proof.presses++; }, flags };
    yield nx;
    const after = d.now();
    if (same(before, after)) { proof.stuckAt = before.stop + 1; flags.push({ kind: 'next-stuck', sev: 'fail', what: `Next did nothing at stop ${before.stop + 1} "${d.nameOf(before.stop).name}" (beat ${before.beat + 1}) though the talk had not ended`, where: `${deck}, stop ${before.stop + 1}` }); break; }
    if (after.ended) break;
    if (after.stop === before.stop) { await stand(flags); continue; }
    nx.label = `Next press ${n + 1}: into stop ${after.stop + 1} of ${d.total}`;
    await stand(flags);
    // the edge: Back from here must come back to where we were, and Next must come forward to here again
    if (o.edges && !edged.has(after.stop)) {
      edged.add(after.stop);
      const bf: AuditFinding[] = [];
      yield { group: deck, id: `${deck}:seq:${n}:back`, label: `Back at the edge of stop ${after.stop + 1}`, run: () => { d.press('back'); proof.presses++; }, flags: bf };
      const back = d.now();
      if (back.ended || back.stop !== before.stop) { proof.backFailed.push(after.stop + 1); bf.push({ kind: 'back-edge', sev: 'fail', what: `Back from stop ${after.stop + 1} landed on stop ${back.stop + 1} (expected stop ${before.stop + 1})`, where: `${deck}, stop ${after.stop + 1}` }); }
      const nf: AuditFinding[] = [];
      yield { group: deck, id: `${deck}:seq:${n}:fwd`, label: `Next again into stop ${after.stop + 1}`, run: () => { d.press('next'); proof.presses++; }, flags: nf };
      const fwd = d.now();
      if (fwd.ended || fwd.stop !== after.stop) { nf.push({ kind: 'back-edge', sev: 'fail', what: `Next after Back came to stop ${fwd.stop + 1}, not stop ${after.stop + 1}`, where: `${deck}, stop ${after.stop + 1}` }); if (fwd.stop !== after.stop) d.go(after.stop); }
    }
  }
}
export const newProof = (deck: string): SequenceProof => ({ deck, intended: 0, reached: [], skipped: [], backFailed: [], noHeading: [], stuckAt: null, presses: 0, selectorsClicked: 0, targetsSeen: 0 });
