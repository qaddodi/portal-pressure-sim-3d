// The top bar's fit, ported from 2D main.js (publish: "the top bar keeps one row when everything fits"). Off a phone the bar first compacts step by step
// (data-fit 1 to 3: shorter patient name, icon-only buttons) so the view and the lens stay on one row; two rows (.two-rows) only if even step 3 fails.
// The thumb layout is two corner chips and always one row. The patient's name takes the first of its forms that fits: the full name on one line (l), the short form
// on one line (s), the short form on two lines at 12 px (s2), then the compact form on two lines (c2); an upright phone starts at s2 (fitScenarioName).
// Pure steps here, so a test can run the rule; the page reads its boxes in barFit() (on a resize or a change of the bar, never per frame).

export const NAME_FORMS = ['l', 's', 's2', 'c2'] as const, NAME_FORMS_NARROW = ['s2', 'c2'] as const;
export type NameForm = (typeof NAME_FORMS)[number];

/** The step a bar settles at: the first step whose need fits, with 24 px to spare when stepping down from a coarser one (so it does not flip back and forth). */
export function pickFit(need: (fit: number) => number, avail: number, steps: number, was: number): { fit: number; twoRows: boolean } {
  let fit = 0;
  for (; fit <= steps; fit++) if (need(fit) <= avail - (fit < was ? 24 : 0)) return { fit, twoRows: false };
  return { fit: steps, twoRows: true };
}

/** What the bar needs in one row: the patient pill, the view switch when it sits in the bar, the figure's pill and the actions pill, six gaps of 8 and 16 more (2D `need`). */
export const barNeed = (w: { id: number; seg: number; right: number; actions: number }): number => w.id + w.seg + w.right + w.actions + 6 * 8 + 16;

/** The first of the forms that fits its room, widest first. */
export function pickForm(forms: readonly NameForm[], fits: (f: NameForm) => boolean): NameForm {
  for (const f of forms) if (fits(f)) return f;
  return forms[forms.length - 1];
}

/** Measure and set the bar's step and the name's form. Reads layout; call it from a resize or a ResizeObserver task, never in a frame. */
export function barFit(bar: HTMLElement, thumb: boolean, wide: boolean, prevWas?: number): number {
  const q = (s: string) => bar.querySelector<HTMLElement>(s);
  const name = q('#scenarioName');
  const cs = getComputedStyle(bar);
  const avail = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const was = prevWas ?? (+(bar.dataset.fit || 0) + (bar.classList.contains('two-rows') ? 1 : 0));
  if (avail <= 0) return was;   // (a bar not laid out keeps the step it had)
  if (name?.dataset.form) name.dataset.form = 'l';   // (measured with the full name, so the name's form never moves the bar's step)
  bar.classList.remove('two-rows');
  const steps = wide || matchMedia('(orientation: landscape)').matches ? 3 : 0;
  const need = () => barNeed({ id: q('.tb-id')?.scrollWidth ?? 0, seg: bar.querySelector('#viewSeg') ? (q('#viewSeg')?.offsetWidth ?? 0) : 0, right: q('.sb-right')?.offsetWidth ?? 0, actions: q('.top-right')?.scrollWidth ?? 0 });
  if (thumb) bar.dataset.fit = '0';
  else {
    const r = pickFit((f) => { bar.dataset.fit = String(f); return need(); }, avail, steps, was);
    bar.dataset.fit = String(r.fit);
    if (r.twoRows) bar.classList.add('two-rows');
  }
  if (name?.querySelector('.sn-c') && name.offsetParent) {
    const forms = matchMedia('(max-width: 480px)').matches ? NAME_FORMS_NARROW : NAME_FORMS;
    const f = pickForm(forms, (x) => { name.dataset.form = x; return name.scrollWidth <= name.clientWidth + 0.5 && name.scrollHeight <= name.clientHeight + 0.5; });
    name.dataset.form = f;
  }
  return +(bar.dataset.fit || 0) + (bar.classList.contains('two-rows') ? 1 : 0);
}

/** 2D util.js PHONE_MQ: a phone upright or on its side, and a tablet held upright. A laptop or an iPad on its side is "wide". */
export const PHONE_MQ = '(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape), (max-width: 1100px) and (orientation: portrait)';
