// A card is left when its button carries the person to another section: the card closes, whichever card it is and whichever way the button is reached
// (owner, 26 Nov: "when I hit IR from the TIPS card, the TIPS/DIPS etc. card should close"). The root is one rule in shell/features.ts runFeature (LEAVES_CARD), not a
// select(null) written into each button; a card that grows a new "open it in X" button has to be named here as one that leaves or one that keeps its card.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, defaultParams } from '../src/engine/hales/portal/scenario.js';
import { setParams } from '../src/engine/store.ts';
import { presetStarted } from '../src/ui/action/params.ts';
import { useSelection, selectStructure, type Sel } from '../src/ui/action/selection.ts';
import { cardFor, type Act, type Verb } from '../src/ui/action/cards.ts';
import { STRUCTURES } from '../src/ui/action/structures.ts';
import { appAct } from '../src/ui/action/act.ts';
import { registerFeature, runFeature, LEAVES_CARD, type FeatureId } from '../src/ui/shell/features.ts';
import { handOverStent, takeStent } from '../src/ui/tests/from-orders.ts';

const load = (id: string) => { const p = (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === id)!.apply(defaultParams()); setParams(p); presetStarted(id, p); };
beforeEach(() => { load('cirr-decomp'); useSelection.setState({ sel: null }); });

/** Every feature a card's buttons and links can run, found by running each against a recording Act. */
function featuresOf(sel: Sel): FeatureId[] {
  const out: FeatureId[] = [];
  const act: Act = { update() {}, select() {}, feature: (id) => { out.push(id); }, action() {} };
  for (const v of cardFor(sel)!.verbs as Verb[]) if (v.type === 'button' || v.type === 'link') v.run(act);
  return out;
}
/** What a card's button hands over to another section is not a close: the shunt waits for its target (and puts the card away itself when it finds one), the views drop a card their picture cannot show. */
const KEEPS = new Set<FeatureId>(['shunt', 'view:lobule', 'view:sinusoid', 'view:circuit']);

test('every feature a card button runs either leaves the card (closes it) or is named as one that keeps it', () => {
  const seen = new Set<FeatureId>();
  for (const s of STRUCTURES) for (const f of featuresOf(s.sel)) seen.add(f);
  for (const f of seen) assert.ok(LEAVES_CARD.has(f) || KEEPS.has(f), `${f}: neither LEAVES_CARD nor KEPT`);
  for (const f of ['doppler', 'endoscopy', 'fibroscan', 'ir'] as const) assert.ok(seen.has(f), `${f} is on some card`);
  for (const f of LEAVES_CARD) assert.ok(!KEEPS.has(f), f);
});

test('on every card, each button that leaves it closes the card, after its handler has read the selection', () => {
  let n = 0;
  for (const s of STRUCTURES) {
    for (const f of new Set(featuresOf(s.sel))) {
      if (!LEAVES_CARD.has(f)) continue;
      let read: Sel | null | undefined;
      const off = registerFeature(f, () => { read = useSelection.getState().sel; });
      selectStructure(s.sel);
      assert.ok(useSelection.getState().sel, `${s.id} selected`);
      const verb = (cardFor(s.sel)!.verbs as Verb[]).find((v) => (v.type === 'button' || v.type === 'link') && (() => { let hit = false; v.run({ update() {}, select() {}, feature: (id) => { if (id === f) hit = true; }, action() {} }); return hit; })())!;
      (verb as Extract<Verb, { run(a: Act): void }>).run(appAct);
      off();
      assert.ok(read, `${s.id} ${f}: the handler saw the card's selection`);
      assert.equal(useSelection.getState().sel, null, `${s.id} ${f}: the card closed`);
      n++;
    }
  }
  assert.ok(n >= 10, `only ${n} buttons checked`);
});

test('the TIPS and the DIPS card\'s IR button closes the card and the IR pane still learns the stent (handed over before the card closes)', () => {
  for (const id of ['TIPS', 'DIPS']) {
    const sel: Sel = { type: 'edge', id };
    registerFeature('ir', () => { handOverStent(); });
    selectStructure(sel);
    const ir = (cardFor(sel)!.verbs as Verb[]).find((v) => v.type === 'button' && v.id === 'ir') as Extract<Verb, { type: 'button' }>;
    ir.run(appAct);
    assert.equal(useSelection.getState().sel, null, `${id} card closed`);
    assert.equal(takeStent(), id, `${id} handed over`);
    assert.equal(takeStent(), null, 'once');
  }
});

test('a feature with no handler leaves the card open (nothing was left), and a feature that keeps its card does not close it', () => {
  const sel: Sel = { type: 'edge', id: 'TIPS' };
  selectStructure(sel);
  assert.equal(runFeature('endoscopy', 'Endoscope'), false);
  assert.deepEqual(useSelection.getState().sel, sel);
  const off = registerFeature('compare', () => undefined);
  runFeature('compare', 'Compare');
  off();
  assert.deepEqual(useSelection.getState().sel, sel);
});
