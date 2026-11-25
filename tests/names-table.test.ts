// The name table (src/decks/names.ts) is the one place a cause, a place along the blood's route and an abbreviation get their names (capture 36b7deac review, items 3 and 6).
// This pins the general rule, not one slide: every deck, every chart, the generators and the table agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAUSES, LIVER_ZONES, STATION_SUBLABELS, ABBREVIATIONS, causeOfName } from '../src/decks/names.ts';
import { ZONES as PROFILE_ZONES, ZONE_SECOND } from '../src/ui/charts/profile/layout.generated.js';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { causeNames, defineFirst, namesEdits, zoneEdit, leaves, wordRe } from '../scripts/names-edits.mjs';

type Deck = { id: string; slides: Record<string, unknown>[] };
const decks: Deck[] = [];
for (const f of Object.values(RW_LOADERS)) decks.push(structuredClone(await f()) as unknown as Deck);
for (const id of AG_IDS) decks.push(structuredClone(await loadAgDeck(id)) as unknown as Deck);
for (const id of HP_IDS) decks.push(structuredClone(await loadHpDeck(id)) as unknown as Deck);

test('the zone strip over the profile says what the first slide\'s outline says, from the table, in the generated chart (the ladders draw the same strip)', () => {
  assert.deepEqual(LIVER_ZONES.map((z) => z.one), ['Before the liver', 'In the liver', 'After the liver']);
  for (const zones of [PROFILE_ZONES] as { one: string; top: string }[][]) {
    assert.deepEqual(zones.map((z) => z.one), LIVER_ZONES.map((z) => z.one.toUpperCase()));
    assert.deepEqual(zones.map((z) => z.top), LIVER_ZONES.map((z) => z.word.toUpperCase()));
  }
  assert.equal(ZONE_SECOND, LIVER_ZONES[0].second.toUpperCase());
  const sub = STATION_SUBLABELS.map((s) => s.replace(/-$/, '').toLowerCase());
  for (const z of LIVER_ZONES) for (const w of [z.word, z.one, ...z.one.split(' ')].filter((x) => x.length > 2 || x === 'In')) {
    assert.ok(!sub.includes(w.toLowerCase().replace(/-$/, '')), `a zone header word "${w}" is a station's sub-label`);
  }
  // (a generator and the file agree: running the edit on the file changes nothing)
  for (const f of ['../src/ui/charts/profile/layout.generated.js']) {
    const text = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.equal(zoneEdit(text), text, f);
  }
});

test('one cause, one long name and one short name: no alias survives in any copied deck', () => {
  for (const c of CAUSES) assert.equal(causeOfName(c.long), c);
  const names = new Set(CAUSES.flatMap((c) => [c.long, c.short, ...c.aliases]));
  assert.equal(names.size, CAUSES.reduce((n, c) => n + new Set([c.long, c.short, ...c.aliases]).size, 0), 'a name belongs to one cause');
  for (const d of decks) {
    const copy = structuredClone(d);
    assert.equal(causeNames(copy), 0, `${d.id}: a chip, point or row names a cause in a spelling the table does not give (npm: node scripts/apply-names.mjs)`);
  }
});

test('the right heart failure, SOS and the others read one way on every chip, ladder, plane and table of the Sites and causes talk', () => {
  const sites = decks.find((d) => d.id === 'sites')!;
  const seen = new Map<string, Set<string>>();
  const walk = (n: unknown, field = ''): void => {
    if (Array.isArray(n)) return n.forEach((x) => walk(x, field));
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    for (const f of ['label', 'name', 'title', 'short']) if (typeof o[f] === 'string') { const c = causeOfName(o[f] as string); if (c) (seen.get(c.id) ?? seen.set(c.id, new Set()).get(c.id)!).add(`${f}:${o[f]}`); }
    for (const [k, v] of Object.entries(o)) if (k !== 'mark' && k !== 'marks') walk(v, k);
  };
  for (const s of sites.slides) walk(s);
  for (const c of CAUSES) {
    const got = [...(seen.get(c.id) ?? [])];
    for (const g of got) assert.ok(g === `short:${c.short}` || g.endsWith(`:${c.long}`), `${c.id}: ${g}`);
  }
  assert.ok((seen.get('rhf')?.size ?? 0) >= 2 && seen.get('sos')!.has('short:SOS') && seen.get('sos')!.has(`name:${CAUSES[3]!.long}`));
});

test('the generators agree with the copied decks: the edit is idempotent on what is written', () => {
  for (const d of decks) { const j = JSON.stringify(d, null, 1); assert.equal(namesEdits(j), j, d.id); }
});

// A cause's abbreviation is spelled out where its talk first uses it ("Sinusoidal obstruction syndrome (SOS)"). Two talks print PVT first on a chip or a table row with no sentence naming it before;
// those two are listed, and the list only shrinks (a talk that now defines it must come off).
const KNOWN_UNPLACED = ['choose-treatment:PVT', 'lobule:PVT'];
test('a cause abbreviation is spelled out before its first use, in every talk', () => {
  const unplaced = decks.flatMap((d) => defineFirst(structuredClone(d)).map((u: unknown[]) => `${d.id}:${String(u[0])}`));
  assert.deepEqual(unplaced.sort(), [...KNOWN_UNPLACED].sort(), 'the unplaced list only shrinks: take a talk off it when it is fixed, never put one on');
  for (const d of decks) {
    const copy = structuredClone(d);
    assert.deepEqual(defineFirst(copy).length, KNOWN_UNPLACED.filter((k) => k.startsWith(d.id + ':')).length);
    assert.equal(JSON.stringify(copy), JSON.stringify(d), `${d.id}: an abbreviation is used before it is spelled out (node scripts/apply-names.mjs)`);
  }
});

// The other abbreviations of the table (HVPG, WHVP, RHV...) are not all spelled out in the talks yet. The count of talks that use one before any words for it only falls: that is the ratchet.
const WORDS: Record<string, RegExp> = {
  PV: /portal vein/i, RHV: /right hepatic vein/i, IVC: /inferior vena cava/i, RA: /right atri/i, HVPG: /hepatic venous pressure gradient/i, PPG: /portal pressure gradient/i,
  WHVP: /wedged hepatic venous pressure|wedged pressure/i, FHVP: /free hepatic venous pressure|free pressure/i, SAAG: /serum.{0,3}ascites albumin gradient/i,
  CSPH: /clinically significant portal hypertension/i, TIPS: /transjugular intrahepatic portosystemic shunt/i, PSVD: /porto-?sinusoidal vascular disorder/i, LSM: /liver stiffness measurement/i,
};
const LATE_BASELINE: Record<string, number> = { PV: 0, RHV: 0, IVC: 15, RA: 0, HVPG: 33, PPG: 20, WHVP: 9, FHVP: 6, SAAG: 3, CSPH: 17, TIPS: 27, PSVD: 1, LSM: 10 };
test('abbreviations used before any words for them: the count of talks per abbreviation only falls', () => {
  const late: Record<string, number> = {};
  for (const a of Object.keys(WORDS)) late[a] = 0;
  for (const d of decks) {
    const per = d.slides.map((s) => leaves(s) as { text: string }[]);
    for (const [a, re] of Object.entries(WORDS)) {
      const use = per.findIndex((ls) => ls.some((l) => wordRe(a).test(l.text)));
      if (use >= 0 && !per.slice(0, use + 1).some((ls) => ls.some((l) => re.test(l.text)))) late[a]!++;
    }
  }
  for (const a of Object.keys(WORDS)) assert.ok(late[a]! <= (LATE_BASELINE[a] ?? 0), `${a}: ${late[a]} talks use it before any words for it (baseline ${LATE_BASELINE[a]}); spell it out where the talk first uses it`);
  assert.ok(Object.keys(ABBREVIATIONS).every((a) => a in WORDS || CAUSES.some((c) => c.abbr === a)), 'every abbreviation in the table is audited');
});

// The SAAG plane names its points on one line with no room to wrap, so a cause takes its long name where the plot has room and its short name where it has not (never a name over a quarter of a
// phone's width broken or clipped): the same table, the same two names.
test('the SAAG plane says a cause\'s long name where it fits and its short name where it does not', async () => {
  const { saagLayout } = await import('../src/ui/charts/saag/model.ts');
  const { measure } = await import('../src/ui/charts/measure.ts');
  const rhf = CAUSES.find((c) => c.id === 'rhf')!;
  const pt = { name: rhf.long, short: rhf.short, saag: 1.3, tp: 4.5, own: true, modeled: true };
  const said = (W: number) => saagLayout(W, 12, measure, [pt]).texts.filter((t) => t.look === 'saag.pl').map((t) => t.t);
  assert.deepEqual(said(420), [rhf.long]);
  assert.deepEqual(said(220), [rhf.short]);
});
