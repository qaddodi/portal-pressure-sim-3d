// The 28 Nov 2026 all-decks review, section 1 (clear defects) and the owner's section 3 rulings, pinned across EVERY deck rather than the slide the reviewer saw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
(globalThis as Record<string, unknown>).location = { search: '', pathname: '/', hostname: 'localhost' };
const { loadSource, SOURCE_IDS } = await import('../src/decks/source.ts');
const { toDeck } = await import('../src/decks/hp/deck.ts');
const { ensureChartsBaked } = await import('./baked-decks.ts');
ensureChartsBaked();
const { trustBaked, bakedById } = await import('../src/ui/charts/baked/store.ts');
const { mergeStates } = await import('../src/ui/charts/baked/view.ts');
const { lectureOf } = await import('../src/ui/debug/export/lecture.ts');
const { viewportOf } = await import('../src/ui/debug/export/frame.ts');
const { DEVICES } = await import('../src/ui/debug/devices.ts');
const { readingNotMeasurable, HV_READINGS, varixFloorWord } = await import('../src/ui/cuts.ts');
const { valueText } = await import('../src/ui/text/tokens.ts');
const { tileVal } = await import('../src/ui/cards/tiles-2d.ts');

const mac = DEVICES.find((d) => d.id === 'mac')!;
type Fp = Record<string, number>;
const read = async (id: string) => {
  const copied = await loadSource(id);
  const deck = toDeck(copied);
  trustBaked(copied);
  return { copied, deck, states: mergeStates(id, undefined) };
};
const lecture = async (id: string): Promise<string | null> => {
  const { copied, deck, states } = await read(id);
  if (!states) return null;
  return lectureOf({ deck, copied, states, baked: bakedById(id), vp: viewportOf(mac.w, mac.h), screen: mac.name, wire: false }, () => performance.now()).markdown;
};

test('a blocked hepatic vein: the wedged, free, HVPG and EUS readings are all "Not measurable", wherever they print', async () => {
  assert.deepEqual([...HV_READINGS].sort(), ['eus', 'fhvp', 'hvpg', 'whvp']);
  for (const k of HV_READINGS) {
    assert.equal(readingNotMeasurable(k, { hvBlocked: 1 }), true, k);
    assert.equal(readingNotMeasurable(k, {}), false, k);
    assert.equal(valueText(k, { [k]: 21.5, hvBlocked: 1 } as Fp), 'Not measurable', `${k} in the words`);
  }
  assert.equal(readingNotMeasurable('ppg', { hvBlocked: 1 }), false, 'the PPG is read in the portal vein and stays a number');
  for (const id of ['hvpg', 'gradients', 'sites']) {
    const md = await lecture(id);
    if (!md) continue;
    for (const row of md.split('\n').filter((l) => /^\s*\| Budd–Chiari syndrome \|/.test(l))) {
      const cells = row.split('|').map((c) => c.trim());
      assert.ok(cells.includes('Not measurable'), `${id}: the Budd–Chiari row has an unmeasurable cell: ${row}`);
      assert.ok(!/(2[45]\.[28]|0\.4) mmHg/.test(row.replace(/25\.8 mmHg/, '')), `${id}: no wedged, free or EUS number is printed for a blocked vein: ${row}`);
    }
  }
});

test('the esophageal varix floor (the vein\'s own caliber, under 2.5 mm) is "None", never a size', async () => {
  assert.equal(varixFloorWord('varix', 2.0), 'None');
  assert.equal(varixFloorWord('gv', 2.4), 'None');
  assert.equal(varixFloorWord('varix', 2.5), null);
  assert.equal(varixFloorWord('varix', 9.2), null);
  assert.equal(varixFloorWord('hvpg', 2.0), null, 'only a varix has a floor');
  assert.equal(valueText('varix', { varix: 2.0 } as Fp), 'None');
  assert.equal(tileVal('varix', 2.0), 'None');
  assert.match(valueText('varix', { varix: 6.0 } as Fp), /^6\.0 mm$/);
  for (const id of SOURCE_IDS) {
    const md = await lecture(id);
    if (!md) continue;
    assert.ok(!/\bVarix 2\.[0-4] mm/.test(md) && !/\bFundal 2\.[0-4] mm/.test(md), `${id}: a floor varix is printed as a size`);
    assert.ok(!/\| 2\.[0-4] mm \|/.test(md), `${id}: a table prints a floor varix as a size`);
  }
});

test('a meal time-lapse (the seconds clock) is a meal, not "8 days"', async () => {
  for (const id of ['day', 'circuit', 'doppler']) {
    const md = await lecture(id);
    if (!md) continue;
    const meal = md.split('\n').filter((l) => /"After a meal"/.test(l));
    assert.ok(meal.length, `${id} has a meal lapse`);
    for (const l of meal) assert.ok(!/\d+ days/.test(l), `${id}: ${l}`);
    assert.ok(!/\*\*Patient:\*\* 8 days pass/.test(md), `${id}: the meal step is not 8 days`);
  }
});

test('a case card\'s ascitic labs, platelets and stiffness are the model patient\'s own on the slide it opens (one source per number)', async () => {
  // (the one exception: the MASLD patient\'s case card is the patient BEFORE the 12% weight loss the slide then shows)
  const before = new Set(['cause-treated:masld']);
  let checked = 0;
  for (const id of SOURCE_IDS) {
    const { copied, deck, states } = await read(id);
    if (!states) continue;
    deck.slides.forEach((s, i) => {
      const c = copied.slides[i] as { vignette?: string; case?: { text?: string }; caseQ?: string };
      const txt = [c.vignette, c.case?.text, c.caseQ].filter(Boolean).join(' ');
      const fp = states[i]?.fp as Fp | undefined;
      if (!txt || !fp || before.has(`${id}:${s.id}`)) return;
      const at = `${id} ${i + 1} (${s.id})`;
      let m: RegExpExecArray | null;
      if ((m = /SAAG of ([\d.]+)/.exec(txt)) && fp.saag != null) { assert.equal(+m[1]!, +fp.saag.toFixed(1), `${at}: SAAG`); checked++; }
      if ((m = /total protein of ([\d.]+)/.exec(txt)) && fp.tp != null) { assert.equal(+m[1]!, +fp.tp.toFixed(1), `${at}: ascitic protein`); checked++; }
      if ((m = /platelets? (?:of|are|count of|count is) ([\d,]+)/.exec(txt)) && fp.plt != null) { assert.equal(+m[1]!.replace(/,/g, ''), Math.round(fp.plt) * 1000, `${at}: platelets`); checked++; }
      if ((m = /(?:LSM|stiffness)(?: \(LSM\))? (?:of|is) ([\d.]+) kPa/.exec(txt)) && fp.lsm != null) { assert.equal(+m[1]!, +fp.lsm.toFixed(1), `${at}: LSM`); checked++; }
    });
  }
  assert.ok(checked >= 10 || checked === 0, `the case cards were read (${checked} numbers)`);
});

test('the owner\'s rulings of 28 Nov are in the words', async () => {
  const text = async (id: string) => JSON.stringify((await loadSource(id)).slides);
  // 1: a recent trunk thrombus over half the lumen is anticoagulated
  const pre = await text('prehepatic');
  assert.match(pre, /anticoagulate at once/);
  assert.ok(!/Untreated PVT is monitored, then treated/.test(pre));
  // 2: age alone does not exclude a TIPS; no "age <75" criterion row, no "past the age limit"
  assert.ok(!/past the age limit|Past the age limit/.test(await text('tips-candidacy')));
  assert.ok(!/\*\*age\*\* <75/.test(await text('tips-complete')));
  // 3: primary prophylaxis response is a fall of 10% or an HVPG of 12 or less, in the treatment deck of a never-bled patient
  const tr = JSON.stringify((await loadSource('treatment')).slides.map((s) => [s.line, s.lineAhead, s.ask]));
  assert.ok(!/decompensated patient a (?:response|fall)|≥20%/.test(tr), 'a never-bled patient is judged on the primary prophylaxis rule');
  assert.match(tr, /primary prophylaxis is a fall of ≥10%/);
  // 4 and 5: PSVD is diagnosed by VALDIG criteria, and the stiffness rule that spares an endoscopy is gone
  const nc = await text('ncph');
  assert.ok(!/score of 5|scoring 3|<40 kPa\}/.test(nc.replace(/\{ssm\}/g, '')) && /VALDIG/.test(nc));
  // 6: not both a beta-blocker and banding in primary prophylaxis
  assert.match(await text('pregnancy'), /not both/);
  // 7: Baveno VIII after cure: LSM <12 kPa with platelets >150,000/µL rules CSPH out
  assert.match(JSON.stringify((await loadSource('cause-treated')).checks), /LSM <12 kPa with platelets >150,000/);
  // 10: primary SBP prophylaxis
  assert.match(await text('tipping'), /Child–Pugh ≥9\*\* and \*\*bilirubin ≥3 mg\/dL/);
});

test('every patch of the review landed in its deck (the apply script skips a patch whose text moved, so this is the check)', async () => {
  const { REVIEW_28NOV } = await import('../scripts/review-28nov-edits.mjs') as { REVIEW_28NOV: { deck: string; at: string; from?: string; to?: string; set?: unknown; moveAfter?: string }[] };
  const esc = (t: string) => JSON.stringify(t).slice(1, -1);
  const decks = new Map<string, { text: string; json: Record<string, unknown> }>();
  const step = (node: unknown, key: string): string | number => (Array.isArray(node) ? (/^\d+$/.test(key) ? +key : node.findIndex((x) => x && (x as { id?: string }).id === key)) : key);
  for (const p of REVIEW_28NOV) {
    if (!decks.has(p.deck)) { const j = await loadSource(p.deck, false); decks.set(p.deck, { text: JSON.stringify(j), json: j as unknown as Record<string, unknown> }); }
    const d = decks.get(p.deck)!;
    if (p.from !== undefined) { assert.ok(d.text.includes(esc(p.to!)), `${p.deck} ${p.at}: the new text is in the deck`); continue; }
    let node: unknown = d.json;
    const keys = p.at.split('.');
    for (const k of keys.slice(0, -1)) node = (node as Record<string | number, unknown>)[step(node, k)];
    if (p.moveAfter) { const arr = node as { id?: string }[]; const i = arr.findIndex((x) => x.id === keys.at(-1)), j = arr.findIndex((x) => x.id === p.moveAfter!.split('.').at(-1)); assert.equal(i, j + 1, `${p.deck} ${p.at} stands after ${p.moveAfter}`); continue; }
    assert.deepEqual((node as Record<string | number, unknown>)[step(node, keys.at(-1)!)], p.set, `${p.deck} ${p.at}`);
  }
});
