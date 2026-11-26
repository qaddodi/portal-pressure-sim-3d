// Which slides the capture takes: all of them, some the person ticks, or a random sample (5, 10, 25) drawn from random talks. A slide is named `deck:k` (k = its stop in the talk: 0 the title, 1 the first slide,
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
/** A talk's capture folder: its number among every talk in the registered (deck) order, then its id: `35-shunts`. The number never depends on which talks a run takes or the
 *  order they finished loading in, so the same talk has
 *  the same folder on every device and every run (capture 2274649a: Mac 35-shunts, iPhone 35-two-lesions). An id that is not in the list goes last. Pure; tests/capture-folders.test.ts. */
export function deckFolder(order: readonly string[], id: string): string {
  const i = order.indexOf(id);
  return `${String((i < 0 ? order.length : i) + 1).padStart(2, '0')}-${id}`;
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

/** The form: how many slides (All, Ticked, Random 5, 10, 25 as one segmented row) and which talks (a "Talks 42 of 42 ›" row that opens the ticked list). `read()` gives `{ decks, pick, words, none }`: `decks` the talks' ids (null for every talk), `pick` the random sample's keys (null for every slide of those talks). All ignores the ticks; Ticked takes every slide of the ticked talks; Random draws from the ticked talks. */
export function pickerUi(doc: Document, decks: () => readonly PickDeck[]): { el: HTMLElement; read(): { decks: string[] | null; pick: string[] | null; words: string; none: boolean }; refresh(): void } {
  const LINE = 'rgba(255,255,255,.18)';
  const el = doc.createElement('div'); el.style.cssText = 'flex:1 1 100%;margin:0 0 4px';
  const cap = doc.createElement('div'); cap.textContent = 'WHICH SLIDES'; cap.style.cssText = 'font-size:12px;font-weight:600;letter-spacing:.04em;opacity:.6;margin:6px 0';
  const seg = doc.createElement('div'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Which slides'); seg.style.cssText = 'display:flex;gap:4px;margin:0 0 10px';
  const MODES = [['all', 'All'], ['ticked', 'Ticked'], ['5', 'Random 5'], ['10', '10'], ['25', '25']] as const;
  let which: string = '5';
  const segBtns = MODES.map(([v, t]) => {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = t;
    b.style.cssText = 'flex:1 1 0;min-width:0;min-height:38px;margin:0;padding:0 2px;font-size:13px;border-radius:9px';
    b.onclick = () => { which = v; paint(); };
    seg.append(b); return [v, b] as const;
  });
  const paint = () => { for (const [v, b] of segBtns) { const on = v === which; b.setAttribute('aria-pressed', String(on)); b.style.background = on ? 'rgba(255,255,255,.2)' : 'transparent'; b.style.borderColor = on ? 'transparent' : LINE; b.style.opacity = on ? '1' : '.7'; b.style.fontWeight = on ? '600' : '400'; } };
  paint();
  const talks = doc.createElement('button'); talks.type = 'button'; talks.setAttribute('aria-expanded', 'false');
  talks.style.cssText = `display:flex;justify-content:space-between;align-items:center;width:100%;min-height:40px;margin:0;padding:0;border:0;border-bottom:1px solid ${LINE};border-radius:0;font-size:15px;font-weight:400;background:transparent`;
  const list = doc.createElement('div'); list.hidden = true; list.style.cssText = `max-height:30vh;overflow:auto;border-bottom:1px solid ${LINE};padding:6px 0;display:flex;flex-direction:column;gap:4px`;
  talks.onclick = () => { list.hidden = !list.hidden; talks.setAttribute('aria-expanded', String(!list.hidden)); upd(); };
  const off = new Set<string>();   // (the talks not ticked: a talk that loads later starts ticked)
  const upd = () => { const all = decks(); talks.textContent = ''; const a = doc.createElement('span'), b = doc.createElement('span'); a.textContent = 'Talks'; b.textContent = `${all.length - [...off].filter((id) => all.some((d) => d.id === id)).length} of ${all.length}  ${list.hidden ? '›' : '⌄'}`; b.style.opacity = '.6'; talks.append(a, b); };
  const draw = () => {
    list.textContent = '';
    const all = decks();
    const bar = doc.createElement('div'); bar.style.cssText = 'display:flex;gap:16px;margin-bottom:2px';
    const mk = (t: string, on: () => void) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = on; b.style.cssText = 'border:0;background:transparent;color:#408cff;min-height:28px;margin:0;padding:0;font-size:13px'; bar.append(b); };
    mk('All', () => { off.clear(); draw(); });
    mk('None', () => { for (const d of all) off.add(d.id); draw(); });
    list.append(bar);
    for (const d of all) {
      const l = doc.createElement('label'); l.style.cssText = 'display:flex;gap:8px;align-items:baseline;font-size:14px';
      const c = doc.createElement('input'); c.type = 'checkbox'; c.checked = !off.has(d.id);
      c.onchange = () => { if (c.checked) off.delete(d.id); else off.add(d.id); upd(); };
      l.append(c, d.title); list.append(l);
    }
    upd();
  };
  const refresh = draw;
  el.append(cap, seg, talks, list); draw();
  return {
    el, refresh,
    read() {
      const all = decks(), ticked = which === 'all' ? all : all.filter((d) => !off.has(d.id)), allTicked = ticked.length === all.length;
      const names = allTicked ? 'every talk' : ticked.map((d) => d.title).join(', ');
      if (!ticked.length) return { decks: [], pick: null, words: '', none: true };
      if (which === 'all' || which === 'ticked') return { decks: allTicked ? null : ticked.map((d) => d.id), pick: null, words: `every slide of ${names}`, none: false };
      const keys = randomPick(ticked, Number(which), new Date().getTime());
      return { decks: allTicked ? null : ticked.map((d) => d.id), pick: keys, words: `random ${keys.length} from ${names}: ${pickWords(keys)}`, none: false };
    },
  };
}
