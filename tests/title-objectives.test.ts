// L3 (owner, 27 Nov, from capture 3531bdfa): "By the end you can" objectives on the title card ran to two or three lines on a phone and pushed the card past its room. He approved one-line-where-it-can-be drafts
// (ext-review-3531bdfa/l3-objective-drafts.md) for eight decks; the words go in through scripts/source-edits.mjs CAPTURE_3531BDFA_L3.
// The rule pinned here, for every deck: an objective is measured the way tests/ui-fit-estimate.test.ts measures a card (Inter 0.54 em a character plus 8% for ragged wrapping) at the 12 px floor, in the title card's
// own width at each screen that test uses. At 12 px a card line holds about 49 characters on a phone, 54 on a Mac and 77 on an upright iPad, so a true one line on a phone is not possible for a clinical sentence:
// the rule is "no more than two lines on any screen", and the drafted decks are held to it (the list of decks still over it only goes down).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { widthOf } from '../src/ui/layout/plan.ts';
import { cardPad } from '../src/ui/layout/rules2d.ts';
import { FLOOR_PX } from '../src/ui/cards/card-fit.ts';

const SCREENS: Record<string, { w: number; h: number; safe: [number, number, number, number] }> = {
  mac: { w: 1280, h: 800, safe: [0, 0, 0, 0] },
  'ipad-portrait': { w: 820, h: 1180, safe: [24, 0, 20, 0] },
  'iphone-portrait': { w: 393, h: 852, safe: [59, 0, 34, 0] },
  'iphone-se': { w: 375, h: 667, safe: [20, 0, 0, 0] },
  'iphone-landscape': { w: 852, h: 393, safe: [0, 59, 21, 59] },
};
/** Lines an objective takes at the 12 px floor in the narrowest card the screen plans (the same estimate as ui-fit-estimate.test.ts). */
function linesAt(text: string, sc: (typeof SCREENS)[string]): number {
  const vp = { w: sc.w, h: sc.h, safe: { top: sc.safe[0], right: sc.safe[1], bottom: sc.safe[2], left: sc.safe[3] } };
  const inner = widthOf(vp as never, false, 0) - 2 * cardPad(vp.w, vp.h).x - 2;
  return Math.max(1, Math.ceil((text.length * FLOOR_PX * 0.54 * 1.08) / inner));
}

/** The eight decks the owner approved (27 Nov), each objective as approved. */
const APPROVED: Record<string, string[]> = {
  prehepatic: ['Read acute PVT on Doppler; explain the normal HVPG and high PPG', 'Describe cavernous transformation: varices, normal liver stiffness', 'Do not delay anticoagulation in cirrhosis for variceal prophylaxis'],
  ncph: ['Recognize portal hypertension: preserved function, normal stiffness', 'Explain the near-normal HVPG in presinusoidal resistance', 'Name two causes: schistosomiasis, porto-sinusoidal vascular disorder'],
  pregnancy: ['Explain why pregnancy raises portal pressure; when bleeding risk peaks', 'Plan screening EGD and treatment: band ligation or a beta-blocker', 'Describe delivery management in a patient with varices'],
  'next-bleed': ['Explain why EVL alone fails; add carvedilol after a first bleed', 'Judge the response to a nonselective beta-blocker by the HVPG fall', 'Name when a TIPS follows failed secondary prophylaxis'],
  hyperdynamic: ['Describe hyperdynamic circulation: high output and rate, low pressure', 'Explain how splanchnic vasodilation adds inflow and retains sodium, water', 'Explain how blood loss and overtransfusion move arterial and portal pressure'],
  'meso-rex': ["Explain why a child's HVPG is normal and the PPG high", 'State the meso-Rex bypass requirements; contrast DSRS and mesocaval shunt', 'Name the options when meso-Rex is not feasible'],
  'landmark-trials': ['For each trial, name the decision it settled and who it applies to', "Test a patient against a trial's rules; say which the model cannot check", 'Say when Baveno VIII accepts an HVPG fall as a surrogate; match trials to statements'],
  ascites: ['Explain how sinusoidal pressure and lymph flow produce ascites', 'Read SAAG and ascitic protein: cirrhosis, heart failure or Budd–Chiari', 'Give albumin with large-volume paracentesis; treat recurrent, refractory ascites'],
};

const objectivesOf = async (id: string) => ((await loadBuiltin(id)) as unknown as { objectives: string[] }).objectives;

test('the eight approved decks carry their objectives exactly as approved', async () => {
  for (const [id, want] of Object.entries(APPROVED)) assert.deepEqual(await objectivesOf(id), want, id);
});

test('every approved objective takes at most two lines on every screen at the 12 px floor, and one on an upright iPad except the two that carry a second clause', async () => {
  const wide: string[] = [];
  for (const [id, list] of Object.entries(APPROVED)) {
    const got = await objectivesOf(id);
    got.forEach((o, i) => {
      for (const [n, sc] of Object.entries(SCREENS)) assert.ok(linesAt(o, sc) <= 2, `${id}.${i + 1} on ${n}: ${linesAt(o, sc)} lines (${o.length} characters)`);
      if (linesAt(o, SCREENS['ipad-portrait']!) > 1) wide.push(`${id}.${i + 1}`);
    });
    assert.equal(got.length, list.length);
  }
  // the ones the owner's drafts could not take to one line without dropping a clause (12.3, 14.3); the list only goes down
  assert.deepEqual(wide, ['landmark-trials.3', 'ascites.3']);
});

test('across every deck: no objective is over two lines on any screen at the 12 px floor, but the decks not yet shortened (the list only goes down)', async () => {
  const over: string[] = [];
  for (const { id } of UI.decks) {
    const objs = await objectivesOf(id as string);
    objs.forEach((o, i) => { if (Object.values(SCREENS).some((sc) => linesAt(o, sc) > 2)) over.push(`${id}.${i + 1}`); });
  }
  const approved = new Set(Object.keys(APPROVED));
  const stillLong = over.filter((x) => !approved.has(x.replace(/\.\d+$/, '')));
  // the objectives of the decks the owner has not yet asked to shorten (L3 drafted eight); shortening one removes it from this list, and the list never gains
  assert.deepEqual(stillLong, ['albumin.1','choose-treatment.1','choose-treatment.3','circuit.2','day.1','day.2','day.3','doppler.2','encephalopathy.1','encephalopathy.2','encephalopathy.3','gastric-varices.2','gastric-varices.3','gradients.2','kidney.1','kidney.2','lobule.2','masld.1','masld.3','outflow.3','shunts.3','stiffness.1','stiffness.3','tipping.2','tips-complete.2','tips-complete.3','two-lesions.2','two-lesions.3','variceal-bleed.2'], 'objectives over two lines in decks not yet shortened');
  assert.deepEqual(over.filter((x) => approved.has(x.replace(/\.\d+$/, ''))), [], 'an approved deck has an objective over two lines');
});
