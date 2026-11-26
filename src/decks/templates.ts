// Slide templates: the slides a talk keeps writing the same way, written once. A slide in a deck of your own says `template: 'name'` and gives the template's few arguments; the rest of the slide
// (its id, kicker, title, line, notes, ask, camera, lens, site and every other field) is written as usual and kept. A template does not draw anything itself: it expands to ordinary slide fields
// (the ones in decks/hp/fields.ts), so what a template slide can do is exactly what any slide can do, and nothing downstream knows templates exist.
//
// Every template carries an example, and tests/deck-templates.test.ts expands and plays each one, so the guide's examples cannot go stale (docs/deck-authoring.md lists them from here).
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export interface Template {
  name: string;
  /** what the slide is for, in one sentence */
  what: string;
  /** the arguments it needs, and the arguments it may have (everything else on the slide is an ordinary slide field and stays) */
  required: readonly string[];
  optional: readonly string[];
  /** the slide's fields once expanded (the arguments removed); a problem with an argument is pushed to `bad` and the slide plays without that part */
  expand(slide: Obj, bad: string[]): Obj;
  /** a small, complete slide that uses it */
  example: Obj;
}

/** One state of the patient a button or a patient argument names: a patient (`preset`), settings changed over it (`params`), or the colours (`lens`). */
const stateOf = (o: Obj): Obj => ({ ...(str(o.preset) ? { preset: o.preset } : {}), ...(isObj(o.params) ? { params: o.params } : {}), ...(str(o.lens) ? { lens: o.lens } : {}), ...(typeof o.days === 'number' ? { days: o.days } : {}) });
const patientOf = (p: unknown, bad: string[], arg: string): Obj => {
  if (!isObj(p) || !str(p.preset)) { bad.push(`“${arg}” needs a patient: { preset: 'csph' }`); return {}; }
  return { preset: p.preset, ...(isObj(p.params) ? { params: p.params } : {}), ...(typeof p.days === 'number' ? { presetDays: p.days } : {}) };
};
const tilesOf = (s: Obj, bad: string[]): Obj => {
  const tiles = Array.isArray(s.tiles) ? s.tiles.filter((t): t is string => typeof t === 'string') : [];
  if (!tiles.length) { bad.push('“tiles” needs the readings to show, such as [\'pv\', \'hvpg\']'); return {}; }
  const key = Array.isArray(s.key) ? s.key.filter((t): t is string => typeof t === 'string') : [];
  return { data: 'tiles', tiles, key, ...(s.delta !== undefined ? { delta: s.delta } : {}) };
};
const without = (s: Obj, names: readonly string[]): Obj => Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'template' && !names.includes(k)));

/** Buttons that switch the live model between states (2D `compare`): each option has a label, its state, and at most one is the slide's own. */
const compareOf = (options: unknown, bad: string[]): Obj[] => {
  const list = Array.isArray(options) ? options.filter(isObj) : [];
  if (list.length < 2) { bad.push('“options” needs at least two buttons: [{ label, params }, { label, params }]'); return []; }
  const own = list.filter((o) => o.own).length;
  if (own > 1) bad.push('more than one option is marked “own”; the last one is used');
  const ownAt = own ? list.map((o) => !!o.own).lastIndexOf(true) : list.length - 1;
  return list.map((o, k) => ({ label: str(o.label) || `Option ${k + 1}`, ...(str(o.short) ? { short: o.short } : {}), ...stateOf(o), ...(k === ownAt ? { own: true } : {}) }));
};

export const TEMPLATES: Readonly<Record<string, Template>> = {
  compare: {
    name: 'compare', what: 'One patient, with buttons that switch the live model between states (a treatment on and off, two doses, two time points) and the readings that change.',
    required: ['patient', 'options', 'tiles'], optional: ['key', 'delta'],
    expand(s, bad) {
      const compare = compareOf(s.options, bad);
      return { ...without(s, ['patient', 'options', 'tiles', 'key', 'delta']), ...patientOf(s.patient, bad, 'patient'), ...tilesOf(s, bad), ...(compare.length ? { compare } : {}) };
    },
    example: { template: 'compare', id: 'dose', kicker: 'Dose', title: 'Two doses of the same drug', line: 'The portal pressure is {pv}.', notes: 'Press each button and say what moves.', ask: ['', ''],
      patient: { preset: 'csph' }, options: [{ label: 'Low dose', params: { nsbbGain: 0.5 } }, { label: 'Usual dose', own: true, params: { nsbbGain: 1 } }], tiles: ['pv', 'hvpg'], key: ['pv'] },
  },
  'before-after': {
    name: 'before-after', what: 'The same patient before and after one change, with a button for each and the change in the readings shown.',
    required: ['patient', 'before', 'after', 'tiles'], optional: ['key'],
    expand(s, bad) {
      const after = isObj(s.after) ? s.after : {}, before = isObj(s.before) ? s.before : {};
      if (!isObj(s.before) || !isObj(s.after)) bad.push('“before” and “after” each need a label and a state: { label: \'Untreated\', params: { … } }');
      const p = patientOf(s.patient, bad, 'patient');
      const ap = isObj(after.params) ? { params: { ...(isObj(p.params) ? p.params : {}), ...after.params } } : {};
      return {
        ...without(s, ['patient', 'before', 'after', 'tiles', 'key', 'delta']), ...p, ...ap, ...tilesOf({ ...s, delta: true }, bad),
        ...(isObj(s.before) && isObj(s.after) ? { compare: [{ label: str(before.label) || 'Before', ...(str(before.short) ? { short: before.short } : {}), ...stateOf(before) }, { label: str(after.label) || 'After', ...(str(after.short) ? { short: after.short } : {}), ...stateOf(after), own: true }] } : {}),
      };
    },
    example: { template: 'before-after', id: 'ba', kicker: 'Treatment', title: 'Before and after the beta-blocker', line: 'The portal pressure falls from {pv@before} to {pv}.', notes: 'Compare the two.', ask: ['', ''],
      patient: { preset: 'csph' }, before: { label: 'Untreated', params: { nsbbGain: 0 } }, after: { label: 'Treated', params: { nsbbGain: 1 } }, tiles: ['pv', 'hvpg'], key: ['pv'] },
  },
  'case-question': {
    name: 'case-question', what: 'A patient is described, one short question is asked, and the slide that follows is the answer.',
    required: ['case', 'question', 'answer'], optional: [],
    expand(s, bad) {
      for (const a of ['case', 'question', 'answer'] as const) if (!str(s[a]).trim()) bad.push(`“${a}” is empty`);
      return { ...without(s, ['case', 'question', 'answer']), ...(str(s.case) ? { vignette: s.case } : {}), ...(str(s.question) ? { caseQ: s.question } : {}), ...(str(s.answer) && !str(s.line) ? { line: s.answer } : {}) };
    },
    example: { template: 'case-question', id: 'cq', kicker: 'Case', title: 'What would you do?', notes: 'Let the room answer first.', ask: ['', ''],
      case: 'A man with cirrhosis has a portal pressure gradient of 14 mmHg.', question: 'Does he have clinically significant portal hypertension?', answer: 'Yes: a gradient of 10 mmHg or more is clinically significant.' },
  },
};

/** The slide with its template laid out as ordinary fields, and what was wrong with the template's arguments in plain words. A slide with no `template` is returned as it is. */
export function expandTemplate(slide: Obj): { slide: Obj; problems: string[] } {
  if (!('template' in slide)) return { slide, problems: [] };
  const name = str(slide.template), t = TEMPLATES[name];
  if (!t) return { slide: without(slide, []), problems: [`there is no template “${name}” (the templates are ${Object.keys(TEMPLATES).join(', ')})`] };
  const bad: string[] = [];
  for (const r of t.required) if (slide[r] == null) bad.push(`the “${name}” template needs “${r}”`);
  return { slide: t.expand(slide, bad), problems: bad };
}
