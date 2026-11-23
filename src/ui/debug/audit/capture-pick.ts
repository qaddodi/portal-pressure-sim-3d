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

export type SliceChoice = { kind: 'all' } | { kind: 'ticked' } | { kind: 'random'; n: number };
/** The form: a talk (or all), and which of its slides (all, ticked, or a random 25, 50 or 100). `read()` gives the choice as `{ only, pick }`, `pick` null for every slide. */
export function pickerUi(doc: Document, decks: () => readonly PickDeck[]): { el: HTMLElement; read(): { only?: string; pick: string[] | null; words: string }; refresh(): void } {
  const el = doc.createElement('div'); el.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:0 0 6px';
  const talk = doc.createElement('select'); talk.setAttribute('aria-label', 'Talk to capture');
  const which = doc.createElement('select'); which.setAttribute('aria-label', 'Which slides');
  for (const [v, t] of [['all', 'Every slide'], ['ticked', 'Pick slides…'], ['25', 'Random 25 slides'], ['50', 'Random 50 slides'], ['100', 'Random 100 slides']] as const) { const o = doc.createElement('option'); o.value = v; o.textContent = t; which.append(o); }
  const list = doc.createElement('div'); list.hidden = true; list.style.cssText = 'flex:1 1 100%;max-height:34vh;overflow:auto;border:1px solid rgba(128,128,128,.4);border-radius:8px;padding:6px 8px';
  const ticks = new Set<string>();
  const drawList = () => {
    list.textContent = '';
    const bar = doc.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
    const mk = (t: string, on: () => void) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = on; bar.append(b); };
    const shown = decks().filter((d) => !talk.value || d.id === talk.value);
    mk('Tick all', () => { for (const d of shown) for (let i = 1; i <= d.slides.length; i++) ticks.add(stopKey(d.id, i)); drawList(); });
    mk('Clear', () => { ticks.clear(); drawList(); });
    const count = doc.createElement('span'); count.textContent = `${ticks.size} ticked`; bar.append(count); list.append(bar);
    for (const d of shown) {
      const det = doc.createElement('details'); det.open = shown.length === 1;
      const sum = doc.createElement('summary'); sum.textContent = d.title; det.append(sum);
      d.slides.forEach((s, i) => {
        const key = stopKey(d.id, i + 1), l = doc.createElement('label'); l.style.cssText = 'display:flex;gap:6px;align-items:baseline;padding:2px 0';
        const c = doc.createElement('input'); c.type = 'checkbox'; c.checked = ticks.has(key);
        c.onchange = () => { if (c.checked) ticks.add(key); else ticks.delete(key); count.textContent = `${ticks.size} ticked`; };
        l.append(c, `${i + 1}. ${s.title}`); det.append(l);
      });
      list.append(det);
    }
  };
  const refresh = () => {
    const keep = talk.value; talk.textContent = '';
    const all = doc.createElement('option'); all.value = ''; all.textContent = 'All talks'; talk.append(all);
    for (const d of decks()) { const o = doc.createElement('option'); o.value = d.id; o.textContent = d.title; talk.append(o); }
    talk.value = keep; list.hidden = which.value !== 'ticked'; if (!list.hidden) drawList();
  };
  talk.onchange = () => { if (which.value === 'ticked') drawList(); };
  which.onchange = () => { list.hidden = which.value !== 'ticked'; if (!list.hidden) drawList(); };
  el.append(talk, which, list); refresh();
  return {
    el, refresh,
    read() {
      const only = talk.value || undefined, pool = decks().filter((d) => !only || d.id === only);
      if (which.value === 'all') return { only, pick: null, words: only ? pool[0]?.title ?? only : 'every slide of every talk' };
      if (which.value === 'ticked') { const keys = slideKeys(pool).filter((k) => ticks.has(k)); return { only, pick: keys, words: pickWords(keys) }; }
      const keys = randomPick(pool, Number(which.value), new Date().getTime());
      return { only, pick: keys, words: `random ${keys.length}: ${pickWords(keys)}` };
    },
  };
}
