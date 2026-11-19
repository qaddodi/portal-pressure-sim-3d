// The earlier reading shown faint beside a live reading instrument (2D presenter-question.js toolGhost, D3): a Doppler on the main portal vein, a FibroScan on the liver or the spleen, with the
// number it read at the slide the change counts from ("Before 24 cm/s"). tool.delta, else the slide's own delta; none when a tile of the slide already gives the change and where it came from.
import { fmt } from '../charts/fmt.ts';

type Rec = Record<string, unknown>;
const GHOST: Record<string, [string, string, number]> = { fibroscan: ['lsm', 'kPa', 1], spleen: ['ssm', 'kPa', 1], doppler: ['pvVel', 'cm/s', 0] };

export interface Ghost { label: string; value: string }

/** cs: the 2D slide; ids/kickers: the deck's slides in order; fpOf: a slide's settled fingerprint by id; stateOf: the slide each slide's state was made at (the slide before a `delta: true` is the one whose state it is). */
export function ghostOf(cs: Rec, i: number, slides: readonly { id: string; kicker?: string }[], fpOf: (id: string) => Rec | null, stateOf: readonly number[]): Ghost | null {
  const tool = (cs.tool ?? {}) as Rec, kind = tool.kind === 'fibroscan' && tool.organ === 'spleen' ? 'spleen' : String(tool.kind ?? '');
  const g = GHOST[kind];
  if (!g || (tool.kind === 'doppler' && (tool.vessel ?? 'PV_TRUNK') !== 'PV_TRUNK')) return null;
  if ((cs.tiles as string[] | undefined)?.includes(g[0])) return null;   // (a tile already gives the change and where it came from)
  const d = tool.delta != null ? tool.delta : cs.delta;
  let from: { id: string; kicker?: string } | undefined;
  if (d === true) from = i > 0 ? slides[stateOf[i - 1]!] : undefined;
  else if (typeof d === 'string') from = slides.find((x) => x.id === d);
  const ref = from ? fpOf(from.id) : null;
  const v = ref?.[g[0]];
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const lapse = cs.lapse as { from?: string } | undefined;
  return { label: (tool.deltaLabel as string | undefined) || (d === true && lapse?.from) || from?.kicker || 'Before', value: `${fmt(v, g[2])} ${g[1]}` };
}
