// Where every field of a 2D slide goes in the 3D app. A copied slide (src/decks/*/…copied.ts, the 2D deck's own fields) is read by several places; this table names, for each field,
// the one that carries it, so a field nobody carries cannot appear unnoticed: tests/deck-card-fields.test.ts reads every slide of every deck, fails on a field this table
// does not list, and holds each `slide` field to the Slide `slideOf` builds (a field of a copied slide that did not reach the Slide would be dropped quietly).
//
//   slide    carried onto the Slide (hp/deck.ts slideOf, src/decks/schema.ts) and printed by a card (src/ui/cards/*, the chart cards)
//   model    steps the engine runs (ag/steps.ts, hp/numbers.ts): the patient, its days, its ramp
//   scene    the camera, view, lens and labels the figure is asked for (hp/plan.ts), or a figure part the words name
//   chart    read by a chart or instrument card from the copied slide itself (ui/talk/ToolCard.tsx hands it over whole)
//   figure   drawn on the figure by another stream (glow, marks, callouts, the procedures): the slide's hooks list them until they land
//
// Nothing is typed per slide: the lists below are per FIELD NAME of the 2D deck format (src/ui/decks.js).

export type FieldHome = 'slide' | 'model' | 'scene' | 'chart' | 'figure';

/** The Slide property a `slide` field is carried as (when it differs from the field's own name). */
export const FIELD_HOME: Record<string, FieldHome> = {
  // words and identity
  id: 'slide', kicker: 'slide', title: 'slide', line: 'slide', notes: 'slide', ask: 'slide', caveat: 'slide', cite: 'slide', vignette: 'slide', caseQ: 'slide', question: 'slide',
  eq: 'slide', terms: 'slide', site: 'slide', rail: 'slide', sides: 'slide', pill: 'slide', causes: 'slide', causesHead: 'slide',
  // the data card and the controls on the teaching card
  visual: 'slide', tool: 'slide', lapse: 'slide', cath: 'slide', beats: 'slide',
  data: 'slide', tiles: 'slide', key: 'slide', delta: 'slide',
  compare: 'slide', whatIf: 'slide', response: 'slide', hvpgResp: 'slide', scales: 'slide',
  cols: 'slide', of: 'slide', vs: 'slide', asc: 'slide', rowHead: 'slide', foot: 'slide', note: 'slide', calm: 'slide', focusRow: 'slide',
  // the model
  preset: 'model', presetDays: 'model', params: 'model', action: 'model', days: 'model', relax: 'model', ramp: 'model',
  // the camera, view and lens
  cam: 'scene', view: 'scene', kMax: 'scene', zone: 'scene', lens: 'scene', labels: 'scene', tint: 'scene', cathKeep: 'scene', wash: 'scene', layers: 'scene', since: 'scene', sinceLabel: 'scene',
  // read whole by a chart or instrument card
  plane: 'chart', cohort: 'chart', chartFoot: 'chart', graph: 'chart', dataTitle: 'chart', column: 'chart', tick: 'chart', milestone: 'chart', when: 'chart', hold: 'chart',
  // the figure's own marks and glow
  glow: 'figure', glowSeq: 'figure', lapseGlow: 'figure', mark: 'figure', marks: 'figure', callout: 'figure', sites: 'figure', span: 'figure', spot: 'figure', stented: 'figure',
  calipers: 'figure', ripple: 'figure', normalOutline: 'figure', steps: 'figure', strain: 'figure', wave: 'figure', procedure: 'figure',
};

/** The Slide property each `slide` field is carried as; a field absent here is carried under its own name. */
export const SLIDE_PROP: Record<string, string> = {
  tiles: 'tiles', key: 'tiles', delta: 'tiles', data: 'tiles',
  compare: 'controls', whatIf: 'controls', response: 'controls', hvpgResp: 'tiles', scales: 'controls',
  cols: 'table', of: 'table', vs: 'table', asc: 'table', rowHead: 'table', foot: 'table', note: 'table', calm: 'table', focusRow: 'table',
  ask: 'ask',
};
