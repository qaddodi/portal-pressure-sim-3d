#!/usr/bin/env node
// Writes tests/fixtures/tiles-2d.json: what the 2D app's data card shows for every slide of the decks H to P that has tiles or an instrument with readings in its header (the HVPG talk
// first): which tiles, and per tile its name, number, unit, rating class and word, scale bar (bands, ticks, cut-off numbers, where the number and its start sit) and its "from" line.
// It runs the 2D app's own pure modules (table-marks.js, card-tiles.js, num.js, vital-read.js) over the 2D engine's state of each slide (tests/deck-states.js), with the few lines of
// presenter-cards.js buildTiles/write that join them, which is what the browser does and node cannot run (the DOM is not shimmed that far). tests/tiles-2d.test.ts holds the 3D tiles to it.
//
//   node scripts/gen-tiles-2d.mjs --from <2D checkout>        (about a minute: the 2D engine plays each deck once)
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../tests/fixtures/tiles-2d.json');
const IN_RANGE = (id) => /^[h-p]/i.test(id);
const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
const changes = (s) => MODEL.some((k) => s[k]);

const args = process.argv.slice(2), at0 = args.indexOf('--from');
if (at0 < 0 || !args[at0 + 1]) { console.error('usage: node scripts/gen-tiles-2d.mjs --from <2D checkout>'); process.exit(2); }
const root = resolve(args[at0 + 1]);
const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
await imp('tests/dom-shim.js');
const { DECKS, withOverview } = await imp('src/ui/decks.js');
const { runStepsFull } = await imp('tests/deck-states.js');
const M = await imp('src/ui/table-marks.js');
const { tileKeys, headKeys, toolOnly } = await imp('src/ui/card-tiles.js');
const { fmt } = await imp('src/ui/num.js');
const { bpText } = await imp('src/ui/vital-read.js');
const { SCALE, TILE, NO_ASC, bandsOf, cutDp, rateOf, tileOf, tileShown, tipsGoal } = M;

const tileVal = (k, v, f) => (v == null ? '—' : tileOf(k)?.bp ? bpText(f?.sbp, f?.dbp, v) : fmt(v * (tileOf(k)?.x ?? 1), tileOf(k)?.d ?? 1));
const at = (k, v) => { const [a, b] = SCALE[k], x = TILE[k]?.x ?? 1; return Math.min(100, Math.max(0, ((v * x - a) / (b - a)) * 100)); };
const round = (v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v);

function tile(k, f, ref, key, tips) {
  const T = tileOf(k) || { t: k, s: '', u: '' }, S = SCALE[k];
  const rated = (g) => (tips && k === 'ppg' && g.ppg != null ? tipsGoal(g.ppg) : rateOf(k, g));
  const [cls, word] = f[k] != null ? rated({ ...f, [k]: tileShown(k, f[k]) }) : rated(f);
  const none = cls == null && (k === 'saag' || k === 'tp');
  const on = !none && f[k] != null, r0 = k === 'hvpgFall' ? null : ref?.[k], ok = on && r0 != null;
  const x = T.x ?? 1, dg = T.d ?? 1;
  let delta = '';
  if (k === 'hvpgFall') delta = f.respFrom == null ? '' : `from ${fmt(f.respFrom, 1)} mmHg`;
  else if (ok && f[k] != null) { const rd = (v) => +(v * x).toFixed(dg); delta = Math.abs(rd(f[k]) - rd(r0)) < 0.5 * 10 ** -dg ? 'No change' : `from ${fmt(r0 * x, dg)}${T.u === '%' ? '%' : ''}`; }
  const bands = bandsOf(k) || [];
  const rs = bands.map((z) => (tips && k === 'ppg' ? tipsGoal(z.m) : rateOf(k, { ...f, respAt: null, asc: Math.max(f.asc ?? 0, NO_ASC), [k]: z.m }))[0] || 'info');
  return {
    k, name: T.t, short: T.n ?? null, unit: none ? '' : T.u, pct: T.u === '%', text: none ? '—' : tileVal(k, f[k], f), none, rate: cls || (none ? 'none' : 'plain'), word, key,
    bar: S ? { zones: bands.map((z, i) => ({ left: round(at(k, z.a / x)), width: round(at(k, z.b / x) - at(k, z.a / x)), rate: rs[i] })), ticks: S[2].map((c) => round(at(k, c / x))),
      labels: S[2].map((c) => ({ left: round(at(k, c / x)), text: fmt(c, cutDp(c)) })), now: on ? round(at(k, f[k])) : null, was: ok ? round(at(k, r0)) : null } : null,
    delta, head: { name: T.n || T.t, text: none ? '—' : tileVal(k, f[k], f), unit: none ? '' : T.u },
  };
}

const out = { from: 'qaddodi/portal-pressure-simulator working copy beside this repo (see tests/fixtures/decks-hp-numbers.json for the pin)', decks: {} };
for (const d of DECKS.filter((x) => IN_RANGE(x.id))) {
  const shown = withOverview(d);
  const steps = shown.slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse } : {}));
  const full = await runStepsFull(steps);
  let last = full[0];
  const states = shown.slides.map((s, i) => (last = changes(s) || i === 0 ? full[i] : last));
  const fpOf = (id) => { const j = shown.slides.findIndex((s) => s.id === id); return j >= 0 ? states[j].fp : null; };
  const deltaOf = (s, i) => s.delta ?? (i > 0 && !s.preset && changes(s) ? true : null);
  const refOf = (s, i) => { const dd = deltaOf(s, i); return (dd === true ? states[i - 1]?.fp : typeof dd === 'string' ? fpOf(dd) : null) || null; };
  const rows = [];
  shown.slides.forEach((s, i) => {
    if (s.id === 'outline' || s.id === 'check' || s.visual || !(s.data === 'tiles' || s.tool)) return;
    for (const phone of [false, true]) {
      let f = states[i].fp;
      if (s.hvpgResp && f) {
        const base = refOf({ delta: s.hvpgResp }, i)?.hvpg;
        f = base > 0 && f.hvpg != null ? { ...f, hvpgFall: ((base - f.hvpg) / base) * 100, respFrom: base, respAt: tileShown('hvpg', f.hvpg) } : { ...f, hvpgFall: null, respFrom: null, respAt: null };
      }
      const keys = s.data ? tileKeys(s, phone) : [], ref = refOf(s, i), tips = !!states[i].params?.tips?.on;
      rows.push({ id: s.id, phone, tips, toolOnly: toolOnly(s), keys, head: headKeys(s, phone), tiles: keys.map((k) => tile(k, f, ref, (s.key || []).includes(k), tips)) });
    }
  });
  if (rows.length) out.decks[d.id] = rows;
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`wrote ${OUT}: ${Object.entries(out.decks).map(([k, v]) => `${k} ${v.length / 2}`).join(', ')}`);
process.exit(0);
