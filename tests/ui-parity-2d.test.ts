// The 3D app's card rules are the 2D app's, per device: iPhone, iPhone on its side, iPad both ways, Mac (and the sizes between).
// tests/fixtures/parity-2d.json is what the 2D modules and its stylesheet's own formulas give (scripts/gen-parity-2d.mjs, Node only);
// src/ui/layout/rules2d.ts must give the same numbers on every size. A rule that differs here is a rule the owner would see differ on a device.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  layoutOf, isSideways, sideColW, isShortSide, pzh, bodyB, margin, padding, cardWidth, cardScale, FIG_MIN, figFloorOf, phonePlan, SHUF, shufCol, shufMaxH, shufTop,
  titleFloorK, SHORT_H, SIDEWAYS_MAX_H, GRIP, WIDE, TITLE_RATIO, WALLET_STEPS,
} from '../src/ui/layout/rules2d.ts';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/parity-2d.json', import.meta.url), 'utf8'));
const near = (a: number, b: number, what: string, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${what}: 3D ${a} vs 2D ${b}`);

test('the constants are the 2D ones', () => {
  assert.equal(SHORT_H, fx.constants.SHORT_H);
  assert.equal(SIDEWAYS_MAX_H, fx.constants.SIDEWAYS_MAX_H);
  assert.equal(GRIP, fx.constants.GRIP);
  assert.deepEqual(WIDE, fx.constants.WIDE);
  assert.equal(TITLE_RATIO, fx.constants.TITLE_RATIO);
  const s = fx.constants.SHUF;
  assert.deepEqual({ strip: SHUF.strip, gapTight: SHUF.gapTight, colsUsual: SHUF.colsUsual, edge: SHUF.edge, gap: SHUF.gap }, { strip: s.strip, gapTight: s.gapTight, colsUsual: s.colsUsual, edge: s.edge, gap: s.gap });
  assert.equal(SHUF.cols.length, s.cols.length);
});

for (const z of fx.sizes) {
  test(`${z.id} ${z.w}×${z.h}: layout, type, geometry and wallet equal the 2D app's`, () => {
    assert.equal(layoutOf(z.w, z.h), z.layout, 'layout');
    assert.equal(isSideways(z.w, z.h), z.sideways, 'sideways');
    assert.equal(isShortSide(z.w, z.h), z.shortSide, 'short side');
    near(pzh(z.w, z.h), z.pzh, 'pzh');
    near(bodyB(z.w, z.h), z.b, 'the card body --pz-b');

    // floating cards: margin, padding and width are the stylesheet's (a stacked screen takes its own rules, tested by the stack's geometry below)
    if (z.layout === 'wide' || z.layout === 'short') {
      near(margin(z.w, z.h, z.layout), z.geometry.cm, 'margin --pz-cm');
      near(padding(z.w, z.h, z.layout), z.geometry.cp, 'padding --pz-cp');
      // an iPhone on its side leaves 2D's one wide card: two side columns (docs/approved/landscape-phone.md, Mohammad 23 Nov)
      if (!z.sideways) near(cardWidth(z.w, z.h, z.layout), z.geometry.cw, 'width --pz-cw');
      else near(cardWidth(z.w, z.h, z.layout), sideColW(z.w), 'a sideways card is a side column');
    } else {
      assert.equal(margin(z.w, z.h, z.layout), 8, 'a stacked card is 8 px from the edge');
      near(cardWidth(z.w, z.h, z.layout), z.layout === 'tab' ? z.w * 0.7 : z.w - 16, 'a stacked card is the screen less 8 px each side (an upright iPad: 70 %)');
    }

    for (const [key, want] of Object.entries(z.roles) as [string, Record<string, number>][]) {
      const [part, kind] = key.split(':');
      const got = cardScale({ vw: z.w, vh: z.h, layout: z.layout, part: part as 'text', card: kind === 'card' });
      for (const [role, v] of Object.entries(want)) near((got as unknown as Record<string, number>)[role], v, `type ${key}.${role}`, 1e-9);
    }

    assert.equal(FIG_MIN(z.h), z.figMin, 'the figure keeps this share of a phone');
    assert.equal(figFloorOf(z.h), z.figFloor, 'and gives way to this');
    for (let r = 0; r < 3; r++) near(shufMaxH(z.h, r), z.maxH[r], `wallet room ${r}`);
    for (let i = 0; i < z.shufCols.length; i++) if (!z.sideways) near(shufCol(i, z.w), z.shufCols[i], `wallet column ${i}`);
    for (const t of z.shufTop) near(shufTop(z.h, t.h), t.top, `wallet top for a card ${t.h} tall`);
  });
}

test('the phone stack plans the same as the 2D app over every height and card size', () => {
  assert.ok(fx.phonePlans.length > 100);
  for (const { in: i, out } of fx.phonePlans) assert.deepEqual(phonePlan(i), out, JSON.stringify(i));
});

test('a title keeps its floor over its words as the 2D app does', () => {
  for (const t of fx.titleFloor) near(titleFloorK(t.title, t.body), t.k, `title ${t.title} over body ${t.body}`);
});

test('the wallet tries its columns in the 2D order: three usual widths in each of two rooms, then every width in the last room', () => {
  assert.deepEqual(WALLET_STEPS.map((s) => `${s.room}.${s.col}`), ['0.0', '0.1', '0.2', '1.0', '1.1', '1.2', '2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6']);
});

// Opt in with PPS_2D_REPO=<2D checkout at the pin>: the fixture is then checked against that checkout as well, so a 2D rule change that is not in the fixture is seen.
// (Off by default: a clone on another commit must not turn this thread's tests red; run scripts/gen-parity-2d.mjs after a 2D card change.)
const two = pinned2D('src/ui/card-scale.js');
test('the fixture is what the 2D app gives at the pin (PPS_2D_REPO)', { skip: two.skip }, () => {
  let out = '';
  try { out = execFileSync('node', ['scripts/gen-parity-2d.mjs', '--from', two.repo, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { assert.fail(String((e as { stderr?: string }).stderr ?? e)); }
  assert.match(out, /matches/);
});
