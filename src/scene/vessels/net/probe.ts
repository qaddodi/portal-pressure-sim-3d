// Did the network figure put a single pixel on the screen? ?geom=net hides the old tubes only for an object whose draw has been SEEN to pass the depth test (a WebGL2 occlusion query round each of its
// draws, read a frame or two later): a figure that draws nothing (a shader that discards everything, a texture the device could not read, a mesh off screen) leaves the old tubes up, so the flag never shows
// vessels missing (22 Nov: an iPhone showed "Mesh: network" with nearly every vessel gone). Pure of three.js: it is handed the context, so a test drives it with a stand-in.
export interface QueryGL {
  ANY_SAMPLES_PASSED: number; QUERY_RESULT_AVAILABLE: number; QUERY_RESULT: number;
  createQuery(): unknown; deleteQuery(q: unknown): void; beginQuery(target: number, q: unknown): void; endQuery(target: number): void;
  getQueryParameter(q: unknown, name: number): unknown;
}
/** A WebGL2 context has occlusion queries; a WebGL1 one does not (the figure then cannot be proven: the old tubes stay). */
export const canQuery = (gl: unknown): gl is QueryGL => !!gl && typeof (gl as QueryGL).createQuery === 'function' && typeof (gl as QueryGL).beginQuery === 'function';

export type ProbeState = 'pending' | 'drawn' | 'blank';
/** How many drawn frames an object gets to show a pixel before it is called blank (a frame whose query has not answered counts when it answers). */
export const PROBE_FRAMES = 45;

interface Slot { query: unknown | null; open: unknown | null; drawn: number; answered: number; hits: number }
export class DrawProbe {
  private readonly slots = new Map<string, Slot>();
  private readonly waiting: { key: string; q: unknown }[] = [];
  private active: string | null = null;
  private slot(key: string): Slot { let s = this.slots.get(key); if (!s) { s = { query: null, open: null, drawn: 0, answered: 0, hits: 0 }; this.slots.set(key, s); } return s; }

  /** Before a mesh's draw call. One query is open at a time (the meshes of the figure are drawn one after the other). */
  begin(gl: unknown, key: string): void {
    if (!canQuery(gl) || this.active) return;
    const s = this.slot(key), q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(gl.ANY_SAMPLES_PASSED, q); this.active = key; s.open = q; s.drawn++;
  }
  /** After the draw call. */
  end(gl: unknown, key: string): void {
    if (!canQuery(gl) || this.active !== key) return;
    const s = this.slot(key);
    gl.endQuery(gl.ANY_SAMPLES_PASSED); this.active = null;
    if (s.open) this.waiting.push({ key, q: s.open });
    s.open = null;
  }
  /** Reads the queries that have answered (once per frame, after the draws). Returns whether any answered. */
  poll(gl: unknown): boolean {
    if (!canQuery(gl)) return false;
    let any = false;
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i]!;
      if (!gl.getQueryParameter(w.q, gl.QUERY_RESULT_AVAILABLE)) continue;
      const s = this.slot(w.key); s.answered++; if (gl.getQueryParameter(w.q, gl.QUERY_RESULT)) s.hits++;
      gl.deleteQuery(w.q); this.waiting.splice(i, 1); any = true;
    }
    return any;
  }
  /** One object's standing: drawn (a pixel passed once), blank (PROBE_FRAMES answered frames and none), else pending. */
  state(keys: readonly string[]): ProbeState {
    let answered = 0;
    for (const k of keys) { const s = this.slots.get(k); if (!s) continue; if (s.hits > 0) return 'drawn'; answered += s.answered; }
    return answered >= PROBE_FRAMES ? 'blank' : 'pending';
  }
  /** What each mesh did, for the badge and the console. */
  report(): string { return [...this.slots].map(([k, s]) => `${k}: ${s.hits}/${s.answered} frames with pixels (${s.drawn} drawn)`).join('; ') || 'nothing was drawn'; }
}
