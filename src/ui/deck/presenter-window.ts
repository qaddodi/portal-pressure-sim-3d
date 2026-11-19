// The Presenter view's window (2D presenter-view-page.js): ?presenter-view=<session> on the app's own page. Text only (no figure, no GL context): the slide's title and line, the next
// slide's title, the notes and the question for the room, a talk clock and a slide clock, Next and Back. It follows the talk over a BroadcastChannel (from2d/presenter-view.js) and sends
// its keys and buttons back; closing either window leaves the other working.
import { VIEW_QUERY, PROTOCOL, STALE_MS, channelOf, validSession, fromTalk } from './from2d/presenter-view.js';
import { keepAwake } from './from2d/wake-lock.js';
import { applyLook, resolveLook } from '../../looks/looks.ts';
import { useSettings } from '../../state/settings.ts';

const CSS = `
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 15px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
.pv { display: grid; grid-template-rows: auto 1fr auto; height: 100%; max-width: 1100px; margin: 0 auto; padding: 16px 20px; box-sizing: border-box; gap: 14px; }
.pv-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 24px; color: var(--text-2); font-size: 13px; }
.pv-top b { color: var(--text); font-weight: 600; }
.pv-clock { margin-left: auto; display: flex; gap: 20px; font-variant-numeric: tabular-nums; }
.pv-clock span { display: flex; flex-direction: column; align-items: flex-end; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.pv-clock output { font-size: 26px; font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--text); }
.pv-main { overflow: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.pv-kick { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-2); }
.pv-title { margin: 0; font: 600 34px/1.12 'Source Serif 4', Georgia, serif; }
.pv-line { margin: 0; font-size: 20px; line-height: 1.4; }
.pv-next { margin: 0; padding: 10px 14px; border: 1px solid var(--text-3); border-radius: 8px; color: var(--text-2); }
.pv-next b { color: var(--text); font-weight: 600; }
.pv-notes { margin: 0; font-size: 17px; line-height: 1.5; white-space: pre-wrap; }
.pv-cap { margin: 6px 0 0; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-2); }
.pv-ask { margin: 0; padding: 10px 14px; border: 1px solid var(--text-3); border-radius: 8px; }
.pv-ask p { margin: 0; } .pv-ask .a { margin-top: 4px; color: var(--text-2); }
.pv-bar { display: flex; gap: 10px; align-items: center; }
.pv-bar button { font: inherit; padding: 10px 22px; border-radius: 8px; border: 1px solid var(--text-3); background: transparent; color: inherit; cursor: pointer; }
.pv-bar button.go { background: var(--accent); border-color: transparent; color: #fff; }
.pv-bar button:disabled { opacity: .4; cursor: default; }
.pv-bar small { margin-left: auto; color: var(--text-2); }
.pv-link { margin-left: auto; font-size: 12px; color: var(--text-2); } .pv-link[data-on="false"] { color: var(--danger); font-weight: 600; }
.pv-wait { margin: auto; color: var(--text-2); font-size: 18px; text-align: center; }
`;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string | null): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
}
interface View { kicker: string; title: string; line: string; notes: string; ask: [string, string] | null }
interface State { deck: { title: string; n: number }; i: number; beat: number; beats: number; cur: View; next: View | null; talk0: number; slide0: number }

export function run(): void {
  document.getElementById('boot')?.remove();
  document.documentElement.removeAttribute('data-boot');
  document.title = 'Presenter view';
  applyLook(resolveLook(useSettings.getState().look, window.matchMedia('(prefers-color-scheme: dark)').matches));
  const sid = new URLSearchParams(location.search).get(VIEW_QUERY) ?? '';
  const ok = validSession(sid);
  const root = el('div', 'pv'), ch = ok && typeof BroadcastChannel === 'function' ? new BroadcastChannel(channelOf(sid)) : null;
  document.head.append(el('style', '', CSS)); document.getElementById('root')?.replaceChildren(root);
  const talk = el('output'), slide = el('output'), where = el('b'), deckT = el('span'), main = el('div', 'pv-main'), count = el('small');
  const back = el('button', '', '← Back'), nextB = el('button', 'go', 'Next →');
  const top = el('div', 'pv-top'), clock = el('div', 'pv-clock');
  const ct = el('span', '', 'Talk'), cs = el('span', '', 'Slide'); ct.append(talk); cs.append(slide); clock.append(ct, cs);
  top.append(deckT, where, clock);
  const link = el('small', 'pv-link'); link.setAttribute('role', 'status');
  const bar = el('div', 'pv-bar'); bar.append(back, nextB, count, link);
  root.append(top, main, bar);
  let st: State | null = null, seen = 0, live = false;
  const send = (c: string, i?: number) => { if (!live) return; try { ch?.postMessage({ v: PROTOCOL, sid, t: 'cmd', c, ...(c === 'go' ? { i } : {}) }); } catch { /* channel closed */ } };
  const status = () => {
    const was = live;
    live = !!ch && Date.now() - seen < STALE_MS;
    link.dataset.on = String(live);
    link.textContent = !ok ? 'Not opened from a talk' : live ? 'Connected' : 'Disconnected from the talk';
    if (was !== live) paint();
    if (live && !was) { try { ch?.postMessage({ v: PROTOCOL, sid, t: 'hello' }); } catch { /* channel closed */ } }
  };
  const tick = () => { const now = Date.now(); talk.textContent = st ? mmss(now - st.talk0) : '0:00'; slide.textContent = st ? mmss(now - st.slide0) : '0:00'; };
  function paint() {
    keepAwake(!!st);
    main.replaceChildren();
    back.disabled = nextB.disabled = !st || !live;
    const none = (t: string) => { main.append(el('p', 'pv-wait', t)); deckT.textContent = ''; where.textContent = ''; count.textContent = ''; tick(); };
    if (!ok) return none('This window was not opened from a talk, so it has nothing to follow. Start a presentation, then open the presenter view from it.');
    if (!st) return none(live ? 'Waiting for a talk. Start a presentation in the main window.' : 'Disconnected from the talk. Keep the main window open, or open the presenter view from it again.');
    const { cur, next, deck, i, beat, beats } = st;
    deckT.textContent = deck.title; where.textContent = `Slide ${i + 1} of ${deck.n}`;
    count.textContent = beats > 1 ? `View ${beat + 1} of ${beats}` : '';
    if (cur.kicker) main.append(el('p', 'pv-kick', cur.kicker));
    main.append(el('h1', 'pv-title', cur.title));
    if (cur.line) main.append(el('p', 'pv-line', cur.line));
    const nx = el('p', 'pv-next'); nx.append('Next: ', ...(next ? [el('b', '', next.title)] : ['the end']));
    main.append(nx);
    if (cur.notes) main.append(el('p', 'pv-cap', 'Notes'), el('p', 'pv-notes', cur.notes));
    if (cur.ask) { const a = el('div', 'pv-ask'); a.append(el('p', 'q', cur.ask[0])); if (cur.ask[1]) a.append(el('p', 'a', cur.ask[1])); main.append(el('p', 'pv-cap', 'Discussion question'), a); }
    tick();
  }
  if (ch) ch.onmessage = (e) => {
    const m = e.data;
    if (!fromTalk(m, sid)) return;
    seen = Date.now(); if (!live) status();
    if (m.t === 'state') { st = m; paint(); } else if (m.t === 'end') { st = null; paint(); }
  };
  back.onclick = () => send('prev'); nextB.onclick = () => send('next');
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key; let c: string | null = null, i: number | undefined;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') c = 'next';
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') c = 'prev';
    else if (k === 'Home') { c = 'go'; i = 0; } else if (k === 'End' && st) { c = 'go'; i = st.deck.n - 1; }
    if (!c) return;
    if ((e.target as HTMLElement | null)?.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return;
    e.preventDefault(); if (!e.repeat) send(c, i);
  });
  setInterval(() => { tick(); status(); }, 1000);
  paint(); status();
  try { ch?.postMessage({ v: PROTOCOL, sid, t: 'hello' }); } catch { /* channel closed */ }
}
