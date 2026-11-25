// The tap-anything cards against the 2D app's own: every card's words and verbs, what it reads and says for six patients, and what each slider and toggle does to the
// parameters (tests/fixtures/actions-2d.json, written by scripts/gen-actions.mjs from the 2D preview branch's actions.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partOf } from '../src/engine/hales/portal/topology.js';
import { cardFor, normalizeSel, type Card, type Verb } from '../src/ui/action/cards.ts';
import type { Env } from '../src/ui/action/read.ts';
import { EI } from '../src/ui/action/read.ts';
import type { Sel } from '../src/ui/action/selection.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const fx: J = JSON.parse(readFileSync('tests/fixtures/actions-2d.json', 'utf8'));
// (the 3D app took the Inject dye button out on 24 Nov 2026, docs/approved/dye.md: the 2D catalogue's dye verb is not expected)
for (const c of fx.cards) if (c.verbs) c.verbs = c.verbs.filter((v: J) => v.type !== 'dye');
// Plan 17 (22 Nov): a piece of a split vein is the vein (its tap selects the host), so 2D's separate card for a piece is the one place 3D departs on purpose: tests/piece-sel.test.ts holds that.
const isPiece = (s: J) => s?.type === 'edge' && partOf(s.id) !== s.id;
fx.cards = fx.cards.filter((c: J) => !isPiece(c.sel));
for (const sets of Object.values<J>(fx.sets)) for (const k of Object.keys(sets)) if (k.startsWith('edge:') && partOf(k.slice(5)) !== k.slice(5)) delete sets[k];
const keyOf = (s: Sel) => `${s.type}:${(s as J).id ?? (s as J).part ?? (s as J).zone}`;
const STATIC = ['type', 'id', 'key', 'label', 'short', 'icon', 'min', 'max', 'step', 'def', 'info', 'hist', 'options', 'ticks', 'tickNames', 'danger', 'quiet', 'small', 'unit'];
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
function diff(a: J, b: J, path = '', out: J = {}): J {
  const isO = (x: J) => x && typeof x === 'object' && !Array.isArray(x);
  if (isO(a) && isO(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], path ? `${path}.${k}` : k, out); }
  else if (JSON.stringify(a) !== JSON.stringify(b)) out[path] = b === undefined ? null : b;
  return out;
}
// (2D keeps ONE hysteresis for every vessel's pressure change: a change between 0.8 and 1 mmHg shows or not by what the last card read. 3D keeps one per card.)
const sameReading = (got: J, want: J, what: string) => {
  const g = got && { v: got.v, u: got.u, d: got.d ?? null, up: !!got.up };
  const edge = (x: string | null) => x != null && Math.abs(parseFloat(x.replace('−', '-'))) < 1;
  if (g && want && (g.d === null) !== (want.d === null) && edge(g.d ?? want.d)) return assert.deepEqual({ ...g, d: 0 }, { ...want, d: 0 }, what);
  assert.deepEqual(g, want, what);
};
const near = (a: unknown, b: unknown, what: string) => {
  if (typeof a === 'number' && typeof b === 'number') assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
  else assert.deepEqual(a, b, what);
};

function patient(id: string): Env & { P: J } {
  const r = fx.patients[id], fr = r.frame;
  const f = { ...fr, P: Float32Array.from(fr.P), Pf: Float32Array.from(fr.Pf), Q: Float32Array.from(fr.Q), Qf: Float32Array.from(fr.Qf), D: Float32Array.from(fr.D) };
  return { f, p: r.params, ref: r.healthy, P: r.params };
}

test('the catalogue has the same cards as 2D, with the same words and verbs', () => {
  for (const c of fx.cards) {
    const card = cardFor(c.sel);
    if (c.none) { assert.equal(card, null, keyOf(c.sel)); continue; }
    assert.ok(card, keyOf(c.sel));
    const c3 = card as Card, w = keyOf(c.sel);
    assert.equal(c3.kicker, c.kicker, `${w} kicker`); assert.equal(c3.title, c.title, `${w} title`); assert.equal(c3.why, c.why, `${w} why`);
    assert.equal(c3.edge ?? null, c.edge, `${w} edge`); assert.equal(!!c3.noValue, c.noValue, `${w} noValue`); assert.equal(!!c3.noDetails, c.noDetails, `${w} noDetails`);
    assert.equal(!!c3.span, c.hasSpan, `${w} span`);
    if (c.spanLabels) assert.deepEqual({ el: c3.span!.el, dn: c3.span!.dn, cut: c3.span!.cut }, c.spanLabels, `${w} span words`);
    assert.deepEqual(c3.verbs.map((v) => v.type), c.verbs.map((v: J) => v.type), `${w} verb types`);
    c.verbs.forEach((fv: J, i: number) => {
      const v = c3.verbs[i] as J;
      for (const k of STATIC) if (fv[k] !== undefined) assert.deepEqual(v[k], fv[k], `${w} verb ${i} (${fv.type} ${fv.id ?? ''}) ${k}`);
      if (fv.formatAt) assert.deepEqual([v.min, v.max, v.def].map((x: number) => v.format(x)), fv.formatAt, `${w} verb ${i} format`);
    });
  }
});

test('a station or a micro-vessel stands for the structure 2D opens', () => {
  assert.deepEqual(normalizeSel({ type: 'node', id: 'CONF' }), { type: 'edge', id: 'PV_TRUNK' });
  assert.deepEqual(normalizeSel({ type: 'node', id: 'W_R' }), { type: 'edge', id: 'RHV_IVC' });
  assert.deepEqual(normalizeSel({ type: 'node', id: 'VAR' }), { type: 'organ', id: 'varices' });
  assert.deepEqual(normalizeSel({ type: 'edge', id: 'POST_R_RHV' }), { type: 'edge', id: 'RHV_IVC' });
  assert.equal(normalizeSel({ type: 'edge', id: 'NOT_A_VESSEL' }), null);
  assert.equal(normalizeSel({ type: 'organ', id: 'liver' })?.type, 'organ');
});

for (const id of fx.presets as string[]) {
  test(`${id}: every card reads, says and shows what 2D's does`, () => {
    const shown = patient(id);
    // (2D's lobule cards read the engine's beat-by-beat pressures at the instant the golden was taken; this app reads the SHOWN ones, as every other reading does, so the portal venule a card prints is the number
    // the lobule's label prints (tests/reads-one-source.test.ts). The one departure: the golden's lobule cards are read against the instant's pressures, which is all the 2D value was.)
    const instant = { ...shown, f: { ...shown.f, Pf: shown.f.P } };
    const rec = fx.readings[id];
    for (const c of fx.cards) {
      if (c.none) continue;
      const env = keyOf(c.sel).startsWith('lobule:') ? instant : shown;
      const card = cardFor(c.sel)!, w = `${id} ${keyOf(c.sel)}`, r = rec[keyOf(c.sel)];
      if (!r) continue;
      if (r.value) for (const [lens, want] of Object.entries(r.value)) { sameReading(card.value({ ...env, lens }), want, `${w} value (${lens})`); }
      else assert.equal(card.noValue, true, `${w} has no value`);
      assert.deepEqual(card.status ? card.status(env) : null, r.status ? r.status : null, `${w} status`);
      // (2D's span never swaps its ends for a vessel that runs backward: the `else` of that line sits inside its comment, so it keeps the last card's. 3D does what the comment says.)
      if (r.span && ((env.f.Qf ?? env.f.Q)[(card as Card).edge ? EI[card.edge!]! : 0]! >= -0.01 || !card.edge)) { const s = card.span!.at(env); near(s.a, r.span.a, `${w} span a`); near(s.b, r.span.b, `${w} span b`); near(s.d, r.span.d, `${w} span d`); assert.equal(s.ok, r.span.ok, `${w} span ok`); }
      r.verbs.filter((fv: J) => fv.type !== 'dye').forEach((fv: J, i: number) => {
        const v = card.verbs[i] as Verb & J, x = `${w} verb ${i} (${fv.type} ${fv.id ?? ''})`;
        if (v.type === 'read' || v.type === 'stat') assert.equal(v.value(env), fv.value, x);
        else if (v.type === 'about') assert.deepEqual([...v.text(env)], fv.lines, x);
        else if (v.type === 'meter') near(v.share(env), fv.share, x);
        else if (v.type === 'slider') { near(v.get(env.p), fv.get, `${x} get`); assert.equal(v.format(v.get(env.p)), fv.text, `${x} text`); }
        else if (v.type === 'toggle') assert.equal(v.get(env.p), fv.get, x);
        else if (v.type === 'seg') assert.equal(v.get(env.p), fv.get, x);
        if (v.showIf && fv.showIf !== undefined) assert.equal(v.showIf(env), fv.showIf, `${x} showIf`);
        if (v.type === 'button' && fv.note !== undefined && v.note) assert.equal(v.note(env), fv.note, `${x} note`);
      });
    }
  });
}

for (const id of Object.keys(fx.sets)) {
  test(`${id}: every slider and toggle changes the parameters as 2D's does`, () => {
    const { P } = patient(id);
    for (const [key, list] of Object.entries<J>(fx.sets[id])) {
      const card = cardFor(JSON.parse(`{"type":"${key.split(':')[0]}","${key.startsWith('edge') ? 'id' : key.startsWith('organ') ? 'id' : /\d$/.test(key) && key.startsWith('lobule:') && !isNaN(+key.slice(7)) ? 'zone' : 'part'}":${/^(edge|organ):/.test(key) ? JSON.stringify(key.slice(key.indexOf(':') + 1)) : isNaN(+key.slice(7)) ? JSON.stringify(key.slice(7)) : key.slice(7)}}`))!;
      for (const s of list) {
        const v = card.verbs.find((x) => (x as J).id === s.id && (x.type === 'slider' || x.type === 'toggle')) as J;
        assert.ok(v, `${key} ${s.id}`);
        if (v.type === 'slider') {
          for (const [x, want] of Object.entries(s.probes)) {
            if (x === 'midThenDef') continue;
            const p = clone(P); v.set(p, +x); assert.deepEqual(diff(P, p), want, `${key} ${s.id} at ${x}`);
          }
          const mid = +(v.min + (v.max - v.min) * 0.37).toFixed(3), p1 = clone(P); v.set(p1, mid); const p2 = clone(p1); v.set(p2, v.def);
          assert.deepEqual(diff(p1, p2), s.probes.midThenDef, `${key} ${s.id} back to its default`);
        } else {
          const on = clone(P), off = clone(P); v.set(on, true); v.set(off, false); const on2 = clone(on); v.set(on2, false);
          assert.deepEqual(diff(P, on), s.on, `${key} ${s.id} on`); assert.deepEqual(diff(P, off), s.off, `${key} ${s.id} off`); assert.deepEqual(diff(on, on2), s.onThenOff, `${key} ${s.id} on then off`);
        }
      }
    }
  });
}

test('every verb names an icon the app draws', async () => {
  const src = readFileSync('src/ui/action/icons.tsx', 'utf8');   // (a .tsx cannot load here: the drawing table is read as text)
  const hasIcon = (n: string) => new RegExp(`(^|[\\s,{])(${n}|'${n}'): '`, 'm').test(src);
  const missing = new Set<string>();
  for (const c of fx.cards) { const card = cardFor(c.sel); for (const v of card?.verbs ?? []) if ((v as J).icon && !hasIcon((v as J).icon)) missing.add((v as J).icon); }
  assert.deepEqual([...missing], []);
});

test('a card prints one small snapshot, equal while nothing it prints changes; a shunt starts only from a vein that can take one', async () => {
  const { snapOf, sameSnap } = await import('../src/ui/action/snap.ts');
  const env = patient('cirr-decomp');
  const pv = cardFor({ type: 'edge', id: 'PV_TRUNK' })!, a = snapOf(pv, env), b = snapOf(pv, { ...env });
  assert.ok(sameSnap(a, b));
  const shunt = pv.verbs.findIndex((v) => v.type === 'button' && v.id === 'shunt');
  assert.equal(a.verbs[shunt]!.show, true);
  const art = cardFor({ type: 'edge', id: 'A_SMA' })!;
  assert.equal(art.verbs.some((v) => v.type === 'button' && v.id === 'shunt'), false);
  const moved = snapOf(pv, { ...env, p: { ...env.p, stenosis: { PV_TRUNK: 0.4 } } });
  assert.ok(!sameSnap(a, moved));
});
