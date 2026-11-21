// The debug page (the 2D app's gallery/page.js), at /preview/?debug: the real app with a small panel on top. Plain DOM, one style block, loaded only on the preview copy.
//   bar     Report (the "What's wrong here?" sheet), Browse (the catalog), previous and next specimen, the open specimen's name, Tools
//   Browse  a search box and the catalog as a tree: figure views, sheets, slides by talk, patients; a tap opens the real thing the way the app opens it
//   Tools   the look, Freeze (pause the model), Shoot (the panel away, Esc brings it back), Copy link, Check (the screen's self-checks now), Sweep, Phone check, Full check, benches
//   ?debug=check runs the Phone check on load, ?debug=full the long walk, ?sweep=<specimens|affected>, ?only=<ids> narrows any of them
// Every run ends in ONE report in the 2D app's format (core/run.copied.js), shown in the panel with Copy. Nothing here runs per frame: every read and write is a tap or a step.
import { Vector3 } from 'three';
import { buildCatalog, byId, resolveSpec, defaultSweep, SECTION_NAMES, type Entry, type Section } from './catalog.ts';
import { liveCatalog, loadAllDecks, openEntry, settle, problems, memoryMB, setLook, journeys, caughtCount } from './live.ts';
import { runSweep } from './sweep.ts';
import { runCheck } from './check.ts';
import { renderRun, type Run } from '../core/api.ts';
import { BENCHES } from './benches.ts';
import { LOOK_IDS, LOOK_LABELS } from '../../../looks/looks.ts';
import { useSettings } from '../../../state/settings.ts';
import { flagValue, flagNumber, debugPage } from '../flags.ts';
import { attach } from '../pps.ts';
import { cel } from '../../../scene/api.ts';
import { screenNow, packetNow, stateNow } from '../packet/sources.ts';
import { stateLink, baseOf } from '../packet/state.ts';
import { togglePlay } from '../../shell/transport.ts';
import { latest } from '../../../engine/index.ts';
import { clock } from '../../../clock/frame.ts';
void buildCatalog;

const CSS = `
.gl { --gl-bg: rgba(250,249,247,.97); --gl-ink: #1b1b1d; --gl-ink2: #5b5a57; --gl-line: rgba(0,0,0,.18); --gl-red: #c8282e; font: 500 13px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--gl-ink); }
.gl[data-dark] { --gl-bg: rgba(28,28,32,.97); --gl-ink: #efefef; --gl-ink2: #a8a8ad; --gl-line: rgba(255,255,255,.22); }
.gl * { box-sizing: border-box; }
.gl button { font: inherit; font-weight: 600; color: inherit; min-height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--gl-line); background: transparent; cursor: pointer; }
.gl button[aria-pressed="true"], .gl button[aria-current="true"] { background: var(--gl-ink); color: var(--gl-bg); border-color: var(--gl-ink); }
.gl button:focus-visible, .gl input:focus-visible { outline: 2px solid var(--gl-red); outline-offset: 2px; }
.gl button:disabled { opacity: .5; }
.gl-bar { position: fixed; left: 8px; right: 8px; top: 8px; z-index: 300; display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 13px; background: var(--gl-bg); border: 1px solid var(--gl-line); }
.gl-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
.gl-sheet { position: fixed; z-index: 300; background: var(--gl-bg); border: 1px solid var(--gl-line); box-shadow: 0 12px 40px -12px rgba(0,0,0,.45); border-radius: 14px; display: flex; flex-direction: column; }
.gl-rail { left: 8px; top: 62px; bottom: 8px; width: min(340px, calc(100vw - 16px)); }
.gl-tools { right: 8px; top: 62px; bottom: 8px; width: min(400px, calc(100vw - 16px)); }
.gl-sheet[hidden] { display: none; }
@media (max-width: 700px) { .gl-rail, .gl-tools { left: 8px; right: 8px; width: auto; top: auto; bottom: 8px; max-height: 72vh; } }
.gl-head { display: flex; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid var(--gl-line); }
.gl-head input { flex: 1; min-width: 0; min-height: 34px; font: inherit; padding: 0 10px; border-radius: 9px; border: 1px solid var(--gl-line); background: transparent; color: inherit; }
.gl-body { overflow-y: auto; overflow-x: hidden; padding: 6px 8px 12px; flex: 1; min-height: 0; overscroll-behavior: contain; }
.gl-h { margin: 12px 4px 4px; color: var(--gl-ink2); font-size: 12px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.gl-item { display: block; width: 100%; text-align: left; min-height: 32px; padding: 4px 8px; border: 0 !important; border-radius: 8px; font-weight: 500 !important; }
.gl-item small { color: var(--gl-ink2); display: block; font-size: 12px; }
.gl-sec { padding: 8px 4px; border-bottom: 1px solid var(--gl-line); }
.gl-sec h3 { margin: 0 0 6px; font-size: 12px; font-weight: 650; color: var(--gl-ink2); letter-spacing: .04em; text-transform: uppercase; }
.gl-row { display: flex; flex-wrap: wrap; gap: 6px; }
.gl-out { margin: 0; padding: 8px; font: 500 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 34vh; overflow-y: auto; overflow-x: hidden; border-radius: 9px; border: 1px solid var(--gl-line); }
.gl-note { color: var(--gl-ink2); font-size: 12px; margin: 4px 0; }
.gl-sec input[type=text] { width: 100%; min-height: 34px; font: inherit; padding: 0 10px; border-radius: 9px; border: 1px solid var(--gl-line); background: transparent; color: inherit; }
.gl[data-shoot] .gl-bar, .gl[data-shoot] .gl-sheet { display: none; }
.gl-tag { position: fixed; left: 8px; bottom: 8px; z-index: 300; padding: 2px 8px; border-radius: 8px; background: var(--gl-bg); border: 1px solid var(--gl-line); display: none; }
.gl[data-shoot] .gl-tag { display: block; }
`;

export async function mountPage(kind: 'gallery' | 'check' | 'full' | 'frame'): Promise<void> {
  if (document.getElementById('gl-root')) return;
  await loadAllDecks();   // (every talk, not just the one the registry holds at boot: the catalog and the checks list the decks)
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string, attrs: Record<string, string> = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const btn = (label: string, on: () => void) => { const b = el('button', '', label, { type: 'button' }); b.onclick = on; return b; };
  const root = el('div', 'gl', undefined, { id: 'gl-root', 'data-debug': '' });
  const dark = () => { root.toggleAttribute('data-dark', document.documentElement.style.colorScheme === 'dark'); };
  dark();

  const cat = liveCatalog();
  let at = -1, running = false, stop = false;
  const nameEl = el('div', 'gl-name', 'Nothing open');
  const tag = el('div', 'gl-tag');

  // ── output: one report, shown and copyable ──
  const out = el('pre', 'gl-out'); out.hidden = true; out.setAttribute('role', 'status');
  const status = el('div', 'gl-note', 'Ready.'); status.setAttribute('role', 'status');
  let outText = '';
  const show = (text: string) => { outText = text; out.textContent = text; out.hidden = !text; };
  const showRun = (run: Run) => { show(renderRun(run)); attach('lastReport', run); status.textContent = `${run.findings.length} finding${run.findings.length === 1 ? '' : 's'} in ${Math.round((run.ms ?? 0) / 1000)} s. Copy it into the thread.`; };
  const copy = btn('Copy', () => { const t = outText || ''; navigator.clipboard?.writeText(t).then(() => { status.textContent = `Copied ${t.length.toLocaleString('en-US')} characters.`; }, () => { out.hidden = false; status.textContent = 'The browser would not copy; select the text above and copy it by hand.'; }); });
  const busyWhile = async (label: string, fn: () => Promise<void>) => {
    if (running) return; running = true; stop = false; status.textContent = `${label}…`;
    try { await fn(); } catch (e) { status.textContent = `${label} failed: ${(e as Error)?.message ?? e}`; } finally { running = false; }
  };

  // ── Browse ──
  const rail = el('section', 'gl-sheet gl-rail'); rail.hidden = true; rail.setAttribute('aria-label', 'Browse');
  const search = el('input', '', undefined, { type: 'search', placeholder: 'Search the catalog', 'aria-label': 'Search the catalog' });
  const railBody = el('div', 'gl-body');
  rail.append(Object.assign(el('div', 'gl-head'), {}), railBody);
  rail.firstElementChild!.append(search, btn('Close', () => { rail.hidden = true; }));
  const items = new Map<string, HTMLButtonElement>();
  const open = async (e: Entry) => {
    await busyWhile(`Opening ${e.label}`, async () => {
      at = cat.indexOf(e); nameEl.replaceChildren(e.label, Object.assign(el('small'), { textContent: `${SECTION_NAMES[e.section]} · ${e.group}` })); tag.textContent = e.label;
      items.forEach((b, id) => b.toggleAttribute('aria-current', id === e.id));
      await openEntry(e); const s = await settle({ timeoutMs: 30000 });
      status.textContent = s.settled ? `${e.label} is open.` : `${e.label} opened but the page was still moving after ${Math.round(s.ms / 1000)} s.`;
    });
  };
  const drawRail = () => {
    const q = search.value.trim().toLowerCase(); items.clear(); railBody.replaceChildren();
    let cur = '';
    for (const e of cat) {
      if (q && !`${e.label} ${e.group} ${e.id}`.toLowerCase().includes(q)) continue;
      const head = `${SECTION_NAMES[e.section as Section]}${e.section === 'slide' ? ` · ${e.group}` : ''}`;
      if (head !== cur) { cur = head; railBody.append(el('div', 'gl-h', head)); }
      const b = el('button', 'gl-item', e.label, { type: 'button' }); if (e.note) b.append(Object.assign(el('small'), { textContent: e.note }));
      b.onclick = () => { void open(e); }; items.set(e.id, b); railBody.append(b);
    }
  };
  search.oninput = drawRail; drawRail();
  const step = (d: number) => { if (cat.length) void open(cat[(Math.max(0, at) + d + cat.length) % cat.length]!); };

  // ── Tools ──
  const tools = el('section', 'gl-sheet gl-tools'); tools.hidden = true; tools.setAttribute('aria-label', 'Tools');
  const tbody = el('div', 'gl-body');
  const sec = (title: string, ...kids: (HTMLElement | string)[]) => { const s = el('div', 'gl-sec'); s.append(el('h3', '', title), ...kids); tbody.append(s); return s; };
  const row = (...b: HTMLElement[]) => { const r = el('div', 'gl-row'); r.append(...b); return r; };
  tools.append(Object.assign(el('div', 'gl-head'), {}), tbody);
  tools.firstElementChild!.append(el('strong', '', 'Tools'), btn('Close', () => { tools.hidden = true; }));
  const lookBtns = LOOK_IDS.map((id) => { const b = btn(LOOK_LABELS[id], () => { setLook(id); dark(); clock.after(paintLooks, 50); }); return [id, b] as const; });
  const paintLooks = () => { const cur = document.documentElement.dataset.look; lookBtns.forEach(([id, b]) => b.setAttribute('aria-pressed', String(id === cur))); dark(); };
  sec('Look', row(...lookBtns.map(([, b]) => b)));
  const frozen = btn('Freeze', () => { togglePlay(); clock.after(() => { const run = latest.frame?.running; frozen.setAttribute('aria-pressed', String(run === false)); }, 200); });
  sec('The page', row(frozen, btn('Shoot', () => { root.setAttribute('data-shoot', ''); }), btn('Copy link', () => { const link = stateLink(stateNow(), baseOf(location)); void navigator.clipboard?.writeText(link).then(() => { status.textContent = 'Link copied.'; }); show(link); }),
    btn('Check', () => { void busyWhile('Checking this screen', async () => { const t = Date.now(); const f = screenNow().findings as { rule: string; what: string; where?: string }[]; const { checkRun } = await import('../core/api.ts'); showRun(checkRun(f.map((x) => ({ kind: x.rule, text: x.what, where: x.where })), { size: `${innerWidth}x${innerHeight}`, look: document.documentElement.dataset.look, title: nameEl.textContent ?? '', at: new Date(t).toISOString() })); }); })));
  const spec = el('input', '', undefined, { type: 'text', placeholder: 'Specimens: all, slide:hvpg, view, sheet:help … (empty: one of each)', 'aria-label': 'Specimens to sweep' }) as HTMLInputElement;
  const looksIn = el('input', '', undefined, { type: 'text', placeholder: 'Looks: light,dark (empty: this look)', 'aria-label': 'Looks to sweep' }) as HTMLInputElement;
  const sweep = async (specText: string, looks: string[]) => {
    // ('affected' (the specimens a change touches) needs the 2D app's file-to-card table, which is not ported: it is named as unknown in the report, never swept as nothing)
    const r = specText ? resolveSpec(cat, specText) : { entries: defaultSweep(cat), unknown: [] };
    await busyWhile('Sweeping', async () => {
      const run = await runSweep(r.entries, looks.length ? looks : [document.documentElement.dataset.look ?? 'light'], { open: openEntry, setLook, settle, problems, errors: caughtCount, memoryMB, size: `${innerWidth}x${innerHeight}` }, { unknown: r.unknown, shouldStop: () => stop, onStep: (d, n, x) => { status.textContent = `Sweep ${d} of ${n}: ${x.id} (${x.look})`; } });
      showRun(run);
    });
  };
  // A walk the browser ended part way (an iPhone tab kill) is written down after every step in sessionStorage; the same tab, opened again, resumes after it and says so (?fresh=1 forgets it).
  const WALK = 'pps.walk';
  const walkMark = (v: { full: boolean; done: number; label: string } | null) => { try { if (v) sessionStorage.setItem(WALK, JSON.stringify(v)); else sessionStorage.removeItem(WALK); } catch { /* blocked: no resume */ } };
  const walkWas = (full: boolean): { done: number; label: string } | null => { try { const v = JSON.parse(sessionStorage.getItem(WALK) || 'null'); return v && v.full === full && v.done > 0 && flagValue('fresh') !== '1' ? v : null; } catch { return null; } };
  const walk = async (full: boolean) => {
    await busyWhile(full ? 'Full check' : 'Phone check', async () => {
      const only = flagValue('only'); const js = journeys().filter((j) => !only || only.split(',').includes(j.id));
      const was = walkWas(full);
      if (flagValue('fresh') === '1') walkMark(null);
      const { report } = await runCheck(js, { settle, problems, errors: caughtCount, memoryMB, info: { device: `${innerWidth}x${innerHeight}`, look: document.documentElement.dataset.look ?? '', build: String(import.meta.env.VITE_BUILD ?? 'dev') } }, { full, steps: flagValue('steps') !== '0', from: was?.done ?? 0, shouldStop: () => stop, onStep: (d, n, r) => { walkMark({ full, done: d, label: `${r.journey} > ${r.label}` }); status.textContent = `${full ? 'Full' : 'Phone'} check ${d} of ${n}: ${r.journey} > ${r.label}`; } });
      walkMark(null);   // (it ended on its own: nothing to resume)
      if (was) report.notes.push(`RESUMED: the browser ended this tab part way; the walk went on after step ${was.done} (${was.label}). Steps 1 to ${was.done} were walked by the page before it.`);
      // the ledger rides in the report's notes, so a Full check read later still says what the estimate stood at each tab kill
      try { const { killLedgerLines } = await import('../kill/mount.ts'); report.notes.push(...killLedgerLines()); } catch { /* no storage: no ledger */ }
      showRun(report);
    });
  };
  sec('Checks', row(btn('Phone check', () => { void walk(false); }), btn('Full check', () => { void walk(true); }), btn('Stop', () => { stop = true; status.textContent = 'Stopping after this step…'; })),
    el('p', 'gl-note', 'Phone check: views, sheets, HVPG slides, patients and the first slide of each talk. Full check adds every slide of the first three talks and reads the memory estimate after each step.'));
  sec('Sweep', spec, looksIn, row(btn('Sweep', () => { void sweep(spec.value.trim(), looksIn.value.split(',').map((s) => s.trim()).filter(Boolean)); }), btn('All five looks', () => { void sweep(spec.value.trim(), [...LOOK_IDS]); })));
  const benchOut = el('pre', 'gl-out'); benchOut.hidden = true;
  const benchSec = sec('Benches');
  for (const b of BENCHES) { const bb = btn(b.label, () => { void busyWhile(b.label, async () => { const t = await b.run((m) => { status.textContent = `${b.label}: ${m}`; }); show(`# ${b.label}\n${t}`); status.textContent = `${b.label} done.`; }); }); bb.title = b.about; benchSec.append(bb, el('p', 'gl-note', b.about)); }
  void benchOut;
  const keyOrder = el('p', 'gl-note', 'Keys: [ and ] step the catalog, Esc brings the panel back after Shoot.');
  tbody.append(keyOrder);

  // ── bar ──
  const bar = el('div', 'gl-bar');
  const report = btn('Report', () => { void (window as unknown as { pps?: { packet?: { open?(): void } } }).pps?.packet?.open?.(); });
  const browse = btn('Browse', () => { rail.hidden = !rail.hidden; if (!rail.hidden) { tools.hidden = true; search.focus(); } });
  const toolsBtn = btn('Tools', () => { tools.hidden = !tools.hidden; if (!tools.hidden) { rail.hidden = true; paintLooks(); } });
  bar.append(report, browse, btn('◀', () => step(-1)), btn('▶', () => step(1)), nameEl, toolsBtn);
  bar.querySelectorAll('button')[2]!.setAttribute('aria-label', 'Previous specimen'); bar.querySelectorAll('button')[3]!.setAttribute('aria-label', 'Next specimen');
  const live = el('div', 'gl-sheet', undefined, { style: 'left:8px;right:8px;bottom:8px;top:auto;padding:8px;gap:6px;max-height:50vh;' }); live.setAttribute('data-live', '');
  live.append(status, out, row(copy));
  root.append(bar, rail, tools, live, tag);
  document.body.append(root);
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null; if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (e.key === 'Escape') root.removeAttribute('data-shoot'); else if (e.key === '[') step(-1); else if (e.key === ']') step(1);
  });
  paintLooks();
  useSettings.subscribe(() => clock.after(paintLooks, 50));

  attach('vessels', () => cel.probeVessels());
  attach('rigProject', (pts: number[][]) => pts.map((q) => { const o = cel.rig.project(new Vector3(q[0], q[1], q[2] ?? 0)); return [o.x, o.y]; }));   // where scene points are on the canvas now (CSS px): what the picture does, which the target alone does not show (the room moves the picture without moving the target)
  attach('rig', () => { const p = cel.rig.pose, c = cel.rig.camera, t = p.shot.target; return { target: [...t], half: [...p.shot.half], yaw: p.shot.yaw, pitch: p.shot.pitch, r: p.shot.r, d: Math.hypot(c.position.x - t[0], c.position.y - t[1], c.position.z - t[2]), zoom: c.zoom, fov: c.fov, room: { ...p.room }, fit: cel.rig.fitSize, view: cel.view, moving: cel.rig.isMoving }; });   // the camera's pose now, for a per-frame measurement (pps.rig() in a rAF loop)
  attach('debug', { catalog: () => cat, open: (id: string) => { const e = byId(cat, id); return e ? open(e) : Promise.reject(new Error(`no specimen ${id}`)); }, settle, sweep: (s: string, l: string[]) => sweep(s, l), check: (full = false) => walk(full), packet: packetNow, report: () => outText });

  // ── what the address asks for ──
  const auto = kind === 'check' ? 'phone' : kind === 'full' ? 'full' : null;
  const sw = flagValue('sweep');
  if (auto) clock.after(() => { void walk(auto === 'full'); }, 600);
  else if (sw != null) clock.after(() => { void sweep(sw === '' ? '' : sw, (flagValue('look') ?? '').split(',').filter(Boolean)); }, 600);
  void flagNumber; void debugPage;
}
