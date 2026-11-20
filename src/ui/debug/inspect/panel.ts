// The inspector (Mohammad, 20 Nov: "make the debug more elaborate: rotate all around, change shaders, etc."): the on-screen panel behind `?inspect`, and behind `?joins=debug`, which grew into it. It exists only on a page whose address asks for it
// (main.tsx), is plain DOM written when a control is touched (nothing per frame), and is part of no card. What it changes, live, with no reload:
//   Camera    the free orbit (the drag turns the figure ALL the way round, tilts up to 88 degrees, nothing springs home), sliders for the angles, named views, Reset
//   Joins     the junction method (old / mesh / mesh2), and the three build-time diagnostics of the skins: paint dropped pixels, no flow marks, no ink (the skins compile again: a second or so)
//   Tubes and Skins   each part's own shade mode (as drawn, flat, normals, lens colour), dust, chevrons and ink on or off, a tint per vessel, a colour laid over it
//   Layers    every part of the figure drawn or not, and drawn as wireframe
//   Hunt      one-press settings for isolating a speck in the flow-mark pass, and Copy (what was on, as text for a thread)
// Normal mode never loads this file: the shaders carry their hooks only behind the VDBG define (scene/vessels/debug-view.ts).
import { cel, gesturesRef } from '../../../scene/api.ts';
import { clock } from '../../../clock/frame.ts';
import { setPart, SHADE_NAMES, type PartView, type ShadeMode } from '../../../scene/vessels/debug-view.ts';
import { clearJoinsOverride, joinsMode, setJoinsOverride, skinDebugOn, skinLeaveOut, type JoinsMode } from '../../../scene/vessels/skin/joins-mode.ts';
import { reapplySkinDefines } from '../../../scene/vessels/skin/skin-object.ts';
import { INSPECT_PITCH } from '../../../scene/camera/rig.ts';
import { flagValue } from '../flags.ts';
import { PRESETS, VIEWS, defaultState, stateText, wrapDeg, type InspectState, type Leave } from './state.ts';

const RAD = Math.PI / 180;

export function mountInspect(): void {
  if (document.getElementById('inspect-panel')) return;
  const state: InspectState = defaultState(joinsMode());
  state.drop = skinDebugOn(); state.leave = skinLeaveOut();   // (what the address already asked for)
  const wantJoins = state.joins;

  const css = document.createElement('style');
  css.textContent = `
#inspect-pill{position:fixed;left:80px;top:8px;z-index:var(--z-perf,100);padding:3px 10px;border-radius:999px;border:1px solid #fff8;background:#254;color:#fff;font:600 11px/18px ui-monospace,Menlo,monospace;pointer-events:auto}
#inspect-panel{position:fixed;left:8px;top:36px;z-index:var(--z-perf,100);width:min(350px,94vw);max-height:calc(100vh - 56px);overflow:auto;-webkit-overflow-scrolling:touch;padding:8px 10px;border-radius:12px;background:rgba(14,18,16,.93);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;pointer-events:auto;display:none}
#inspect-panel summary{font:700 11px/1.6 ui-monospace,Menlo,monospace;color:#9fe0b8;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;margin-top:6px}
#inspect-panel .row{display:flex;align-items:center;gap:8px;margin:3px 0}
#inspect-panel .row>label{flex:1}
#inspect-panel .row input[type=range]{flex:1.4;min-width:0;margin:0}
#inspect-panel .val{min-width:44px;text-align:right;color:#cde}
#inspect-panel select,#inspect-panel button{font:11px ui-monospace,Menlo,monospace;color:#fff;background:#fff2;border:1px solid #fff6;border-radius:6px;padding:3px 8px}
#inspect-panel select{max-width:60%}
#inspect-panel .bar{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0}
#inspect-panel .hint{color:#9ab;margin:2px 0 4px}
#inspect-panel .msg{min-height:14px;color:#ffd58a;margin-top:4px}
#inspect-panel table{border-collapse:collapse;width:100%}
#inspect-panel td{padding:1px 4px 1px 0}`;
  document.head.append(css);

  const pill = document.createElement('button'); pill.id = 'inspect-pill'; pill.textContent = 'Inspect';
  const box = document.createElement('div'); box.id = 'inspect-panel';
  document.body.append(pill, box);
  pill.onclick = () => { box.style.display = box.style.display === 'block' ? 'none' : 'block'; };
  box.addEventListener('pointerdown', (e) => e.stopPropagation());

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, kids: (Node | string)[] = []): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
  const msg = el('div', { className: 'msg' });
  const syncers: (() => void)[] = [];
  const section = (title: string, open = true): HTMLElement => { const d = el('details', { open }, [el('summary', { textContent: title })]); box.append(d); return d; };
  const check = (host: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void): void => {
    const c = el('input', { type: 'checkbox' }); c.checked = get(); c.onchange = () => { set(c.checked); syncAll(); };
    syncers.push(() => { c.checked = get(); });
    host.append(el('div', { className: 'row' }, [el('label', { textContent: label }), c]));
  };
  const select = (host: HTMLElement, label: string, opts: readonly (readonly [string, string])[], get: () => string, set: (v: string) => void): void => {
    const s = el('select'); for (const [v, t] of opts) s.append(el('option', { value: v, textContent: t }));
    s.value = get(); s.onchange = () => { set(s.value); syncAll(); };
    syncers.push(() => { s.value = get(); });
    host.append(el('div', { className: 'row' }, [el('label', { textContent: label }), s]));
  };
  const slider = (host: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string = (v) => String(Math.round(v * 100) / 100)): void => {
    const v = el('span', { className: 'val' }), i = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const show = () => { i.value = String(get()); v.textContent = fmt(get()); };
    i.oninput = () => { set(Number(i.value)); v.textContent = fmt(get()); };
    syncers.push(show); show();
    host.append(el('div', { className: 'row' }, [el('label', { textContent: label }), i, v]));
  };
  const buttons = (host: HTMLElement, items: readonly { label: string; title?: string; run: () => void }[]): void => {
    host.append(el('div', { className: 'bar' }, items.map((b) => { const x = el('button', { textContent: b.label, title: b.title ?? '' }); x.onclick = b.run; return x; })));
  };
  const syncAll = () => { for (const f of syncers) f(); };

  // ---- applying the state to the figure (every call idempotent: the diff is the scene's own) ----------------------------------------------------------------------------------------------------------------
  function apply(): void {
    const ch = setJoinsOverride({ mode: state.joins, drop: state.drop, leave: state.leave });
    if (ch.includes('mode')) cel.useJoinsLive();
    if (ch.includes('drop') || ch.includes('leave')) { const n = reapplySkinDefines(cel.scene); msg.textContent = n ? `Compiling ${n} skin programs…` : ''; }
    setPart('tube', state.tube); setPart('skin', state.skin);
    for (const l of cel.inspectLayers()) { cel.setInspectShown(l.id, !state.hidden.includes(l.id)); cel.setInspectWire(l.id, state.wired.includes(l.id)); }
    cel.post.setMode(state.aa ? 'fxaa' : 'off');
    cel.rig.setInspect(state.free);
    clock.invalidate('inspect');
  }
  const commit = (patch: Partial<InspectState>) => { Object.assign(state, patch); apply(); };
  const turnTo = (yaw: number, pitch: number) => { state.yawDeg = wrapDeg(yaw); state.pitchDeg = Math.max(-88, Math.min(88, pitch)); if (!state.free) { state.free = true; apply(); } cel.rig.inspectTo(state.yawDeg * RAD, state.pitchDeg * RAD); clock.invalidate('inspect'); };

  box.append(el('div', {}, ['Inspector · ', el('span', { className: 'val', textContent: 'live, nothing reloads' })]));

  // ---- Camera ----
  const cam = section('Camera');
  check(cam, 'Free orbit: drag turns it all the way round', () => state.free, (v) => commit({ free: v }));
  slider(cam, 'Turn', -180, 180, 1, () => state.yawDeg, (v) => turnTo(v, state.pitchDeg), (v) => `${Math.round(v)}°`);
  slider(cam, 'Tilt', -88, 88, 1, () => state.pitchDeg, (v) => turnTo(state.yawDeg, v), (v) => `${Math.round(v)}°`);
  buttons(cam, [
    ...VIEWS.map((v) => ({ label: v.label, run: () => { turnTo(v.yaw, v.pitch); syncAll(); } })),
    { label: 'Reset', title: 'Back to the shot: turn, tilt, zoom and pan', run: () => { gesturesRef.current?.refit(); cel.rig.inspectTo(0, 0); state.yawDeg = 0; state.pitchDeg = 0; syncAll(); clock.invalidate('inspect'); } },
  ]);
  cam.append(el('div', { className: 'hint', textContent: 'One finger or the mouse turns; two fingers tilt; Shift or a middle drag pans. A talk locks the camera.' }));

  // ---- Joins ----
  const jn = section('Joins and diagnostics');
  select(jn, 'Junction method', [['old', 'Old: overlapping tubes'], ['mesh', 'Mesh: SMV-SV confluence'], ['mesh2', 'Mesh 2: every junction']], () => state.joins, (v) => commit({ joins: v as JoinsMode }));
  check(jn, 'Paint dropped skin pixels', () => state.drop, (v) => commit({ drop: v }));
  select(jn, 'Skin without', [['', 'Nothing'], ['marks', 'Flow marks (no dust, no chevrons)'], ['dust', 'Dust only'], ['heads', 'Chevrons only'], ['ink', 'Outline ink'], ['dustblend', 'Old dust blend (A/B)']], () => state.leave, (v) => commit({ leave: v as Leave }));
  jn.append(el('div', { className: 'hint', textContent: 'Red back face, cyan presence dither, yellow no alpha, magenta past the ink band. Changing a diagnostic compiles the skins again (a second or so). The lobule reads the method once, when it opens.' }));

  // ---- Tubes and Skins ----
  const partUi = (title: string, key: 'tube' | 'skin') => {
    const s = section(title);
    const get = (): PartView => state[key], put = (patch: Partial<PartView>) => commit({ [key]: { ...state[key], ...patch } } as Partial<InspectState>);
    select(s, 'Shade', SHADE_NAMES.map((n, i) => [String(i), n] as const), () => String(get().shade), (v) => put({ shade: Number(v) as ShadeMode }));
    check(s, 'Dust', () => get().dust, (v) => put({ dust: v }));
    check(s, 'Chevrons', () => get().heads, (v) => put({ heads: v }));
    check(s, 'Outline ink', () => get().ink, (v) => put({ ink: v }));
    check(s, key === 'tube' ? 'Colour per vessel' : 'Colour per junction', () => get().tint, (v) => put({ tint: v }));
    const c = el('input', { type: 'color', value: get().colour }); c.oninput = () => { put({ colour: c.value }); };
    syncers.push(() => { c.value = get().colour; });
    s.append(el('div', { className: 'row' }, [el('label', { textContent: 'Colour over it' }), c]));
    slider(s, 'How much', 0, 1, 0.05, () => get().amount, (v) => put({ amount: v }));
  };
  partUi('Tubes', 'tube');
  partUi('Skins', 'skin');

  // ---- Layers ----
  const ly = section('Layers');
  const tbl = el('table'); ly.append(tbl);
  tbl.append(el('tr', {}, [el('td', { textContent: '' }), el('td', { textContent: 'draw' }), el('td', { textContent: 'wire' })]));
  for (const l of cel.inspectLayers()) {
    const on = el('input', { type: 'checkbox' }), wr = el('input', { type: 'checkbox' });
    on.onchange = () => { commit({ hidden: on.checked ? state.hidden.filter((x) => x !== l.id) : [...state.hidden, l.id] }); };
    wr.onchange = () => { commit({ wired: wr.checked ? [...state.wired, l.id] : state.wired.filter((x) => x !== l.id) }); };
    syncers.push(() => { on.checked = !state.hidden.includes(l.id); wr.checked = state.wired.includes(l.id); });
    tbl.append(el('tr', {}, [el('td', { textContent: l.label }), el('td', {}, [on]), el('td', {}, [wr])]));
  }
  check(ly, 'Anti-aliasing pass (FXAA)', () => state.aa, (v) => commit({ aa: v }));

  // ---- Hunt ----
  const hunt = section('Hunt a speck');
  hunt.append(el('div', { className: 'hint', textContent: 'Each press changes only what it says; press Reset all to start over. A speck that goes was that part.' }));
  buttons(hunt, PRESETS.map((p) => ({ label: p.label, title: p.hint, run: () => { Object.assign(state, p.make(state)); apply(); syncAll(); msg.textContent = p.hint; } })));
  buttons(hunt, [
    { label: 'Reset all', run: () => { clearJoinsOverride(); const cur = { yaw: state.yawDeg, pitch: state.pitchDeg, free: state.free }; Object.assign(state, defaultState(wantJoins), { yawDeg: cur.yaw, pitchDeg: cur.pitch, free: cur.free }); apply(); syncAll(); msg.textContent = 'Everything as drawn.'; } },
    { label: 'Copy', title: 'What is on, as text for a thread', run: () => { const t = stateText(state, document.title); void navigator.clipboard?.writeText(t).then(() => { msg.textContent = 'Copied.'; }, () => { msg.textContent = t; }); } },
  ]);
  box.append(msg);

  // the angles follow a drag on the figure (a timer, not a frame: the panel is not part of the picture)
  window.setInterval(() => {
    if (box.style.display !== 'block' || !cel.rig.inspectOn) return;
    const a = cel.rig.inspectAngles, y = wrapDeg(a.yaw / RAD), p = Math.max(-INSPECT_PITCH / RAD, Math.min(INSPECT_PITCH / RAD, a.pitch / RAD));
    if (Math.abs(y - state.yawDeg) > 0.4 || Math.abs(p - state.pitchDeg) > 0.4) { state.yawDeg = y; state.pitchDeg = p; syncAll(); }
  }, 250);

  apply(); syncAll();
  if (flagValue('joins') === 'debug') box.style.display = 'block';   // (?joins=debug opens the panel)
}
