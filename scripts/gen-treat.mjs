// Writes the Treat card's words and the 2D app's answers the 3D port is tested against, from a checkout of the 2D app (never retyped):
//   src/ui/treat/treat.generated.ts   tabs, drugs' notes, the fluids, the procedure table, the surgical shunts' records, the toasts and the other lines of chart.js
//   tests/fixtures/changes-2d.json     the Changes list (inspector.js activeInterventions) and the count of treatments running (chart.js treatCount), for every
//                                      preset and for edits that exercise each branch, as the 2D app words them
// Usage: node scripts/gen-treat.mjs --from <2D checkout, preview branch>
// Every string taken from chart.js's code (a toast, a title) is looked for in the source first: the generator stops if 2D no longer says it, so the 3D words cannot drift.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const from = resolve(argv[argv.indexOf('--from') + 1] || '../portal-pressure-simulator');
const at = (p) => pathToFileURL(resolve(from, p)).href;

await import(at('tests/dom-shim.js'));
const chartSrc = readFileSync(resolve(from, 'src/ui/chart.js'), 'utf8');
const mainSrc = readFileSync(resolve(from, 'src/ui/main.js'), 'utf8');
const sources = chartSrc + '\n' + mainSrc + '\n' + readFileSync(resolve(from, 'src/ui/surgical-shunts.js'), 'utf8') + '\n' + readFileSync(resolve(from, 'src/ui/treat-page.js'), 'utf8');
const said = (s) => { if (!sources.includes(s)) throw new Error(`2D no longer says: ${s}`); return s; };

const { PROCEDURES } = await import(at('src/ui/procedure-names.js'));
const { SURGICAL } = await import(at('src/ui/surgical-shunts.js'));
const { DRUGS, PRESETS, defaultParams } = await import(at('src/engine/portal/scenario.js'));
const { DRUG_NOTE } = await import(at('src/ui/actions.js'));
const { activeInterventions } = await import(at('src/ui/inspector.js'));
const { createChart } = await import(at('src/ui/chart.js'));

// ── the words ──
const surgical = SURGICAL.map((s) => ({ id: s.id, key: s.key, edge: s.edge, proc: s.proc ?? null, label: s.label, the: s.the, short: s.short ?? null, sub: s.sub, kw: s.kw, done: s.done }));
const procedures = Object.fromEntries(Object.entries(PROCEDURES).map(([k, v]) => [k, { label: v.label, long: v.long }]));
const drugs = Object.keys(DRUGS).map((k) => ({ id: k, label: DRUGS[k].label, note: DRUGS[k].info || DRUG_NOTE[k] || '' }));
const lines = {
  tabs: [['drugs', 'Drugs'], ['fluids', 'Fluids'], ['procs', 'Procedures']],
  anticoag: ['Anticoagulation', said('Thrombosed veins recanalize gradually.')],
  diuretics: ['Diuretics', said('Spironolactone + furosemide: natriuresis mobilizes ascites.')],
  fluids: [
    ['crystalloid', said('1 L crystalloid'), said('about 25% stays intravascular')],
    ['prbc', said('1 unit PRBC'), said('packed red cells')],
    ['albumin', said('Albumin'), said('raises oncotic pressure')],
  ],
  procSubs: {
    band: said('on the esophageal varices'), balloon: said('gastric balloon first, then esophageal'), tips: said('right portal vein → right hepatic vein'),
    dips: said('portal vein → intrahepatic IVC'), brto: said('occlude the gastrorenal shunt'), paracentesis: said('drain ascites'),
    splenicEmbolization: said('partial splenic artery embolization'), splenectomy: said('spleen removed'),
  },
  spleenOrders: [[1, said('Splenic embolization'), said('partial splenic artery embolization'), said('Partial splenic embolization')], [2, said('Splenectomy'), said('spleen removed'), said('Splenectomy')]],
  toasts: {
    balloonUp: said('The gastric balloon is already up; the esophageal balloon is the second step, in the varices card.'),
    balloonDone: said('Gastric balloon inflated. The esophageal balloon is the second step, in the varices card.'),
    tipsHave: said('The TIPS is already in place.'), tipsDone: said('TIPS placed: right portal vein → right hepatic vein.'),
    dipsHave: said('The DIPS is already in place.'), dipsDone: said('DIPS placed: portal vein → IVC, through the caudate lobe.'),
    brtoNone: said('There is no gastrorenal shunt (see Advanced › anatomical variants).'),
    brtoHave: said('The gastrorenal shunt is already occluded; the Fundal varices card takes it down.'),
    brtoDone: said('BRTO: the gastrorenal shunt is occluded and the fundal varices are obliterated.'),
  },
  labels: {
    gastricBalloon: said('Gastric balloon'), tips: said('TIPS'), dips: said('DIPS'), brto: said('BRTO'), spleenUntreated: said('Spleen untreated'),
    clearAll: said('Clear all changes'), clear: said('Clear all'),
    nothing: [said('Nothing changed yet.'), said(' Move a slider or treat, and it shows here.')],
    aboutThis: said('About this patient'), yours: said('Your changes'), changes: said('Changes'), treat: said('Treat'), showIt: said('Show it on the figure'), undoThis: said('Undo this change'),
  },
  surgicalToasts: {
    have: (the) => `The ${the} is already in place.`, none: (the) => `There is no ${the} to take down.`,
    pcNone: 'There is no portocaval shunt to take down.',
  },
  rex: { had: 'A Meso-Rex bypass is already in place.', patent: 'The portal trunk is patent: a Meso-Rex bypass is for a thrombosed trunk.', leftClot: 'The left portal vein is thrombosed: there is no patent Rex recess for the anastomosis.' },
};
const sg = readFileSync(resolve(from, 'src/ui/proc-anim.js'), 'utf8');
for (const s of [lines.rex.had, lines.rex.patent, lines.rex.leftClot]) if (!sg.includes(s)) throw new Error(`2D no longer says: ${s}`);
for (const s of [`The \${s.the} is already in place.`, `There is no \${s.key === 'portocaval' ? 'portocaval shunt' : s.the} to take down.`]) if (!sources.includes(s)) throw new Error(`2D no longer says: ${s}`);

const gen = `// GENERATED by scripts/gen-treat.mjs from the 2D app (qaddodi/portal-pressure-simulator, chart.js, surgical-shunts.js, procedure-names.js, scenario.js). Do not edit.
// Treat's words: every string the 2D Treat card, its Changes list and its toasts say.
export const TREAT_WORDS = ${JSON.stringify({ drugs, procedures, surgical, lines: { ...lines, surgicalToasts: undefined } }, null, 2)} as const;
`;
mkdirSync(resolve(root, 'src/ui/treat'), { recursive: true });
writeFileSync(resolve(root, 'src/ui/treat/treat.generated.ts'), gen);

// ── 2D's answers ──
const treatCount = (() => { const c = createChart({ onWhy() {}, flash() {}, onScenarios() {}, action() {}, startShunt() {}, select() {}, timeline: null, pinned: () => null }); return c.treatCount; })();
const read = (p) => activeInterventions(p).map((a) => ({ key: a.key, label: a.label }));
const cases = [];
for (const pr of PRESETS) cases.push({ name: `preset:${pr.id}`, preset: pr.id, edit: null });
// edits, as patches on the default patient: each branch of activeInterventions and of treatCount
const edits = {
  fibrosis_both: { fibrosis: { R: { pre: 4.5, sin: 1, post: 1 }, L: { pre: 4.5, sin: 1, post: 1 } } },
  fibrosis_right_only: { fibrosis: { R: { pre: 1, sin: 3, post: 1 }, L: { pre: 1, sin: 1, post: 1 } } },
  fibrosis_post_20: { fibrosis: { R: { pre: 1, sin: 1, post: 20 }, L: { pre: 1, sin: 1, post: 20 } } },
  sten_thr: { stenosis: { PV_TRUNK: 0.4, SV_CONF: 0.123 }, thrombus: { RHV_IVC: 1 } },
  drugs: { drugs: { propranolol: true, octreotide: true } },
  spleen1: { splenicRx: 1 }, spleen2: { splenicRx: 2 },
  tips: { tips: { on: true, d: 9.5 } }, dips: { dips: { on: true, d: 8 } },
  pc_es: { portocaval: true }, pc_ss: { portocaval: true, portocavalSide: true }, dsrs: { dsrs: true }, mesocaval: { mesocaval: true }, rex: { rex: true },
  custom: { customShunts: { X_SMV_RHV: 10.5 } },
  balloons: { balloonGas: true, balloonEso: true }, occ: { occluded: { C5: true, C2: true } },
  tone: { splanchnicTone: 0.6, systemicTone: 1.25, habrStrength: 0.5 }, meal: { meal: 1 },
  heart: { contractility: 0.55, tr: 0.35, pericardial: 0.2 }, ap: { apShunt: 0.25 }, preg: { gestation: 24 }, alb: { albumin: 3.1 },
  diuretics_anticoag: { diuretics: true, anticoag: true }, noC5: { spontaneous: { C5: false } }, c6: { spontaneous: { C6: true } },
  everything: { cirrhosis: 0.7, drugs: { carvedilol: true }, anticoag: true, diuretics: true, tips: { on: true, d: 8 }, balloonGas: true, occluded: { C5: true } },
};
for (const [name, edit] of Object.entries(edits)) cases.push({ name: `edit:${name}`, preset: 'healthy', edit });
const { deepMerge } = await import(at('src/engine/portal/scenario.js'));
const paramsOf = (c) => { const base = PRESETS.find((x) => x.id === c.preset).apply(defaultParams()); return c.edit ? deepMerge(base, c.edit) : base; };
const out = cases.map((c) => { const p = paramsOf(c); return { ...c, changes: read(p), count: treatCount(p) }; });

// the surgical shunts' placement checks and edits, as 2D runs them
const shunts = [];
for (const pr of PRESETS) {
  const p = paramsOf({ preset: pr.id, edit: null });
  shunts.push({ preset: pr.id, blocked: Object.fromEntries(SURGICAL.map((s) => [s.id, s.blocked(structuredClone(p))])), on: Object.fromEntries(SURGICAL.map((s) => [s.id, s.on(p)])),
    applied: Object.fromEntries(SURGICAL.map((s) => { const q = s.apply(structuredClone(p)); return [s.id, { rex: q.rex, dsrs: q.dsrs, portocaval: q.portocaval, portocavalSide: q.portocavalSide, mesocaval: q.mesocaval }]; })) });
}
mkdirSync(resolve(root, 'tests/fixtures'), { recursive: true });
writeFileSync(resolve(root, 'tests/fixtures/changes-2d.json'), JSON.stringify({ generatedFrom: '2D preview branch, chart.js + inspector.js + surgical-shunts.js', cases: out, shunts }, null, 1) + '\n');
console.log(`treat.generated.ts, changes-2d.json (${out.length} cases, ${shunts.length} shunt rows)`);
