import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIALS } from '../src/ui/charts/trial/trials.generated.ts';
import { trialLayout, fitWords, trialWords, trialOf, type Fit } from '../src/ui/charts/trial/model.ts';
import { trialFrame } from '../src/ui/charts/trial/frame.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const ids = Object.keys(TRIALS);
const FITS: Record<string, Fit> = {
  fits: { verdict: 'fits', met: 3, of: 3, rows: [] },
  no: { verdict: 'no', rows: [{ rule: 'Child-Pugh B or C', state: 'no', value: 'A' }] },
  unknown: { verdict: 'unknown', rows: [] },
};

test('every trial id finds its record; an unknown id finds none', () => {
  assert.ok(ids.length >= 21, String(ids.length));
  for (const id of ids) assert.equal(trialOf(id)?.id, id);
  assert.equal(trialOf('nope'), null);
  assert.equal(trialOf('__proto__'), null);
});

test('every trial fits the card at 300, 330 and 430 px on every look: words at least 12 px, nothing outside, readable', () => {
  eachLook((look) => {
    for (const w of [300, 330, 430]) for (const id of ids) {
      const c = ctxOf(look, w), t = TRIALS[id]!;
      for (const fit of [null, FITS.fits!, FITS.no!]) judge(trialFrame(t, fit, c), look);
      judge(trialFrame(t, null, c, { head: false }), look);
      judge(trialFrame(t, null, ctxOf(look, w, 'phone-portrait'), { compact: true }), look);
    }
  });
});

test('the layout is the same drawing at the same width (so a card never jumps) and grows when the fit line is added', () => {
  const t = TRIALS[ids[0]!]!, f = 13;
  const a = trialLayout(t, 330, f, measure), b = trialLayout(t, 330, f, measure);
  assert.deepEqual(a, b);
  assert.ok(trialLayout(t, 330, f, measure, FITS.fits!).H > a.H);
});

test('two arms sit side by side where their names fit, and stack where they do not', () => {
  const two = ids.map((i) => TRIALS[i]!).filter((t) => t.arms.length === 2);
  assert.ok(two.length > 0);
  const wide = two.filter((t) => { const L = trialLayout(t, 430, 13, measure), xs = L.texts.filter((x) => x.look === 'trial.pct').map((x) => x.x); return xs.length === 2 && xs[0] !== xs[1]; });
  assert.ok(wide.length > 0, 'at 430 px some two-arm trial reads side by side');
  const narrow = trialLayout(two[0]!, 160, 13, measure).texts.filter((x) => x.look === 'trial.pct').map((x) => x.x);
  assert.equal(new Set(narrow).size, 1, 'at 160 px the arms stack, each number at the left edge');
});

test('the fit line says what the model says, and the card draws a mark for it: a cross, a tick or a dash', () => {
  const t = TRIALS[ids[0]!]!;
  assert.equal(fitWords(null), null);
  assert.match(fitWords(FITS.no!)!, /^Does not fit: child-pugh b or c \(this patient: A\)$/i);
  assert.equal(fitWords(FITS.unknown!), 'Cannot tell from the model');
  const marks = (fit: Fit) => trialLayout(t, 330, 13, measure, fit).paths.length;
  assert.equal(marks(FITS.no!), 2);
  assert.equal(marks(FITS.fits!), 1);
  assert.equal(marks(FITS.unknown!), 1);
  assert.ok(trialWords(t, FITS.no!).includes(fitWords(FITS.no!)!));
});

test('arm bars are as wide as the share, and a zero layout draws them at no width', () => {
  const t = TRIALS[ids[0]!]!;
  const L = trialLayout(t, 330, 13, measure), Z = trialLayout(t, 330, 13, measure, null, { zero: true });
  for (const [i, a] of t.arms.entries()) {
    const bar = L.rects.filter((r) => r.look === 'trial.bar')[i];
    if (bar) assert.ok(Math.abs(bar.w - (330 * a.rate) / 100) < 1e-6);
  }
  for (const r of Z.rects.filter((r) => r.look === 'trial.bar')) assert.equal(r.w, 0);
});

test('only trials checked against their paper go without the warning', () => {
  for (const id of ids) {
    const t = TRIALS[id]!, has = trialLayout(t, 330, 13, measure).texts.some((x) => x.look === 'trial.warn');
    assert.equal(has, t.status !== 'checked', id);
  }
});

test('the endpoint line never says the follow-up twice (ATTIRE: "days 3 to 15, days 3 to 15")', async () => {
  const { endpointOf, sameTime } = await import('../src/ui/charts/trial/model.ts');
  assert.ok(sameTime('New infection, renal dysfunction or death, days 3 to 15', 'Days 3 to 15'));
  for (const id of ids) {
    const t = trialOf(id)!, w = endpointOf(t).toLowerCase(), f = String(t.followUp ?? '').trim().toLowerCase();
    if (f) assert.equal(w.split(f).length - 1 <= 1, true, `${id}: ${w}`);
  }
});
