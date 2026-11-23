// Which slides the capture takes: all of them, some the person ticks, or a random sample (25, 50, 100) drawn from random talks. A slide is named `deck:k` (k = its stop in the talk: 0 the title, 1 the first slide,
// the last the check), the same name in the address (`&pick=hvpg:3,outflow:5`) that the outer page hands each size's frame. The choice is made once (a sample is drawn once, not once per size), so every size
// captures the same slides. Pure but for `pickerUi`, which builds the small form the audit panel and the outer page both show.

export interface PickDeck { id: string; title: string; slides: readonly { title: string }[] }

export const stopKey = (deck: string, k: number): string => `${deck}:${k}`;
/** The keys of every slide stop in the talks (the title and the check are not "slides": a sample is of slides). */
export const slideKeys = (decks: readonly PickDeck[]): string[] => decks.flatMap((d) => d.slides.map((_, i) => stopKey(d.id, i + 1)));

/** A small seeded generator (mulberry32): the same seed, the same sample. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** `n` slides drawn at random from the talks (every slide equally likely, none twice), in talk order. */
export function randomPick(decks: readonly PickDeck[], n: number, seed: number): string[] {
  const all = slideKeys(decks), rnd = seeded(seed);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j]!, all[i]!]; }
  const take = new Set(all.slice(0, Math.max(0, Math.min(n, all.length))));
  return slideKeys(decks).filter((k) => take.has(k));
}
export const packPick = (keys: readonly string[]): string => keys.join(',');
/** The keys an address names (`hvpg:3,outflow:5`), or null for "all": bad entries are dropped. */
export function unpackPick(v: string | null): Set<string> | null {
  if (!v) return null;
  const keys = v.split(',').map((s) => s.trim()).filter((s) => /^[\w-]+:\d+$/.test(s));
  return keys.length ? new Set(keys) : null;
}
/** The talk's highest picked stop (the walk can end after it), or -1 when none of it is picked. */
export function lastPicked(pick: ReadonlySet<string>, deck: string): number {
  let m = -1;
  for (const k of pick) { const [d, n] = k.split(':'); if (d === deck) m = Math.max(m, Number(n)); }
  return m;
}
/** What a pick is called in the README: "hvpg 3, 5; outflow 2". */
export function pickWords(keys: readonly string[]): string {
  const by = new Map<string, number[]>();
  for (const k of keys) { const [d, n] = k.split(':'); by.set(d!, [...(by.get(d!) ?? []), Number(n)]); }
  return [...by].map(([d, ns]) => `${d} ${ns.join(', ')}`).join('; ');
}

/** The form: which talks (ticked; all to start with) and how many of their slides: every one, or a random 25, 50 or 100. `read()` gives `{ decks, pick, words }`: `decks` the ticked talks' ids (null when all are ticked), `pick` the random sample's keys (null for every slide of those talks). */
export function pickerUi(doc: Document, decks: () => readonly PickDeck[]): { el: HTMLElement; read(): { decks: string[] | null; pick: string[] | null; words: string; none: boolean }; refresh(): void } {
  const el = doc.createElement('div'); el.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:0 0 6px';
  const which = doc.createElement('select'); which.setAttribute('aria-label', 'How many slides');
  for (const [v, t] of [['all', 'All slides'], ['25', 'Random 25'], ['50', 'Random 50'], ['100', 'Random 100']] as const) { const o = doc.createElement('option'); o.value = v; o.textContent = t; which.append(o); }
  const list = doc.createElement('div'); list.style.cssText = 'flex:1 1 100%;max-height:30vh;overflow:auto;border:1px solid rgba(128,128,128,.4);border-radius:8px;padding:6px 8px;display:flex;flex-direction:column;gap:2px';
  const off = new Set<string>();   // (the talks not ticked: a talk that loads later starts ticked)
  const draw = () => {
    list.textContent = '';
    const bar = doc.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
    const mk = (t: string, on: () => void) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = on; bar.append(b); };
    const count = doc.createElement('span');
    const all = decks();
    const upd = () => { count.textContent = `${all.length - [...off].filter((id) => all.some((d) => d.id === id)).length} of ${all.length} decks`; };
    mk('All', () => { off.clear(); draw(); });
    mk('None', () => { for (const d of all) off.add(d.id); draw(); });
    bar.append(count); list.append(bar); upd();
    for (const d of all) {
      const l = doc.createElement('label'); l.style.cssText = 'display:flex;gap:6px;align-items:baseline';
      const c = doc.createElement('input'); c.type = 'checkbox'; c.checked = !off.has(d.id);
      c.onchange = () => { if (c.checked) off.delete(d.id); else off.add(d.id); upd(); };
      l.append(c, d.title); list.append(l);
    }
  };
  const refresh = draw;
  el.append(list, which); draw();
  return {
    el, refresh,
    read() {
      const all = decks(), ticked = all.filter((d) => !off.has(d.id)), allTicked = ticked.length === all.length;
      const names = allTicked ? 'every talk' : ticked.map((d) => d.title).join(', ');
      if (!ticked.length) return { decks: [], pick: null, words: '', none: true };
      if (which.value === 'all') return { decks: allTicked ? null : ticked.map((d) => d.id), pick: null, words: `every slide of ${names}`, none: false };
      const keys = randomPick(ticked, Number(which.value), new Date().getTime());
      return { decks: allTicked ? null : ticked.map((d) => d.id), pick: keys, words: `random ${keys.length} from ${names}: ${pickWords(keys)}`, none: false };
    },
  };
}
