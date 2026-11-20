// The Trials pane (the Trials tab of the 2D Tests card): the landmark trials against the patient on screen. List: "Trials for this patient", the patient's own HVPG, varices and ascites, then Closest to this
// patient (a pip per key rule), Also possible, Not this patient (chips for the rules that keep trials out; a chip shows its trials), Needs history the model lacks; a tap opens a trial in place with its drawing,
// the entry rules as a checklist and its source. Forest: every trial's primary ratio on one scale, the closest in full ink. The decisions are trials-model.ts (the 2D app's, kept); the drawings are the B10 cards.
// The Tests card (B11) mounts this pane; it renders on its own too (?trials, src/ui/trials/mount.tsx).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEngine, latest, patient } from '../../engine/index.ts';
import { PRESETS } from '../../engine/hales/portal/scenario.js';
import { TrialCard } from '../charts/trial/TrialCard.tsx';
import { ForestCard } from '../charts/forest/ForestCard.tsx';
import { ratiosOf, ratioText } from '../charts/forest/model.ts';
import { fmt } from '../charts/fmt.ts';
import { TRIALS } from '../charts/trial/trials.generated.ts';
import {
  TRIAL_IDS, SECTIONS, MARK, MARK_WORD, NOT_IN_MODEL, patientFacts, sortTrials, closestOf, chipsOf, rowReason, ratesOf, comparisonOf, sourceLine, pipsOf, ruleRows, historyOf,
  modelRx, modelLineOf, bavenoLines, lcFirst, type Placed, type Sections, type WhatIf,
} from './trials-model.ts';
import { whatIf, settledFor } from './what-if.ts';
import { hvpgSev } from '../../engine/hales/portal/pressure-cuts.js';
import { D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from '../tests/copied/motion.copied.js';
import './trials.css';

type FoldKey = 'also' | 'no' | 'unknown';

type Facts = ReturnType<typeof patientFacts>;
interface Ctx { facts: Facts; bleeding: boolean; params: unknown; presetId: string; live: { ppg?: number; map?: number; hr?: number } }

/** The Model line: the model's numbers for this patient settled with the trial's treatment (2D paintModel). It asks the second engine once per patient and treatment and reads the answer when it is in. */
function ModelLine({ t, c }: { t: Parameters<typeof modelLineOf>[0]; c: Ctx }) {
  const rx = modelRx(t);
  const key = useMemo(() => `${c.presetId}|${rx?.name}|${JSON.stringify(c.params)}`, [c.presetId, c.params, rx?.name]);
  const [got, setGot] = useState<{ key: string; r: WhatIf | null } | null>(null);
  const result: WhatIf | null | undefined = got?.key === key ? got.r : settledFor.get(key) ?? undefined;
  const alb = (c.params as { albumin?: number } | null)?.albumin;
  const line = modelLineOf(t, { facts: c.facts, albumin: alb, params: c.params, hidden: null, result, live: c.live });
  useEffect(() => {
    if (line.state !== 'wait' || !rx?.patch) return;
    let live = true;
    void whatIf(key, rx.patch).then((r) => { if (live) setGot({ key, r }); });
    return () => { live = false; };
  }, [line.state, key, rx]);
  const n = line.nums;
  return (
    <div className="tr-model" data-state={line.state}>
      <span className="k">{line.head}</span>
      <span className="v" key={line.state}>
        {n ? <>{n.lead}<b data-sev={n.sevFrom}>{fmt(n.from, 1)}</b><s> → </s><b data-sev={n.sevTo}>{fmt(n.to, 1)}</b> mmHg{n.more}</> : line.text}
      </span>
      {line.sub ? <span className="s">{line.sub}</span> : null}
    </div>
  );
}

/** A strip that folds open and shut instead of popping (2D util.js foldHidden): it opens from nothing and fades in, or fades and folds shut and is hidden once gone, so what stands under it eases to its
 *  place. Reduce Motion: a fade only. A second change mid-way turns round from where it has got to. The strip stays mounted (2D keeps the node, `hidden`). */
function Fold({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const anim = useRef<{ hide: boolean; a: Animation } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (first.current) { first.current = false; el.hidden = !open; return; }
    const hide = !open, cur = anim.current;
    if (cur ? cur.hide === hide : el.hidden === hide) return;
    const PROPS = ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom'] as const;
    let now: Record<string, string | number> | null = null;
    if (cur) {
      const c = getComputedStyle(el);
      now = { opacity: +c.opacity, height: `${el.offsetHeight}px`, ...Object.fromEntries(PROPS.map((k) => [k, c[k]])) };
      cur.a.cancel(); anim.current = null; el.style.overflow = '';
    }
    if (!el.animate || !el.isConnected) { el.hidden = hide; return; }
    if (!hide) el.hidden = false;
    const c = getComputedStyle(el);
    const full = { opacity: 1, height: `${el.offsetHeight}px`, ...Object.fromEntries(PROPS.map((k) => [k, c[k]])) };
    const shut = { opacity: 0, height: '0px', ...Object.fromEntries(PROPS.map((k) => [k, '0px'])) };
    const from = now || (hide ? full : shut), to = hide ? shut : full;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) el.style.overflow = 'hidden';
    const a = el.animate(still ? [{ opacity: from.opacity }, { opacity: to.opacity }] : [from, to], hide ? { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' } : { duration: D_SMALL, easing: EASE_ARRIVE });
    const me = { hide, a };
    anim.current = me;
    void a.finished.then(() => {
      if (anim.current !== me) return;
      anim.current = null; el.style.overflow = '';
      if (hide) el.hidden = true;
      a.cancel();
    }, () => {});
  }, [open]);
  return <div ref={ref} className={className}>{children}</div>;
}

/** A row, as 2D's rowOf builds it: line 1 the name and the two rates, line 2 the pips (the closest only) and why it is here. */
function Row({ p, hero, open, onOpen }: { p: Placed; hero: boolean; open: boolean; onOpen(): void }) {
  const { t, fit } = p;
  const [a, b] = ratesOf(t);
  const pips = hero ? pipsOf(fit) : '';
  return (
    <button type="button" className={`tr-row${hero ? ' hero' : ''}`} data-id={t.id} aria-expanded={open} aria-controls={`tr-x-${t.id}`} onClick={onOpen}>
      <span className="tr-l1"><span className="tr-nm">{t.short ?? t.name}</span><span className="tr-rs">{a}<span className="tr-vs">{b}</span></span></span>
      <span className="tr-l2">{hero ? <span className="tr-pips" aria-hidden="true">{[...pips].map((c, i) => <i key={i} className={c} />)}</span> : null}<span className="tr-why">{rowReason(t, fit)}</span></span>
    </button>
  );
}

/** The open trial under its row (2D blockFor): the lesson, the drawing, the other results, the entry rules as a checklist, the Model line, Baveno VIII in short and the source. */
function Open({ p, c }: { p: Placed; c: Ctx }) {
  const { t, fit } = p;
  const rules = ruleRows(fit);
  const kids: ReactNode[] = [];
  let minor = false;
  rules.forEach((r, i) => {
    if (!r.defining && !minor) { minor = true; kids.push(<div key={`sep${i}`} className="tr-rsep" aria-hidden="true" />); }
    const v = r.state === 'na' ? (r.value && r.value !== NOT_IN_MODEL ? r.value : NOT_IN_MODEL) : r.value;
    kids.push(
      <div key={i} className={`tr-rule${r.defining ? '' : ' minor'}`} role="listitem" data-state={r.state} aria-label={`${r.rule}: ${MARK_WORD[r.state]}, ${v}`}>
        <span className="g" aria-hidden="true">{MARK[r.state]}</span><span className="r">{r.rule}</span><span className="v">{v}</span>
      </div>,
    );
  });
  if (!kids.length) kids.push(<div key="none" className="tr-rule"><span className="g" /><span className="r">Its entry rules are not listed yet</span><span className="v" /></div>);
  const more = ratiosOf(t).slice(1);
  return (
    <div className="tr-exp" id={`tr-x-${t.id}`} role="region" aria-label={t.name}>
      {typeof t.lesson === 'string' && t.lesson ? <div className="tr-lesson">{t.lesson}</div> : null}
      <TrialCard id={t.id} fit={fit as never} head={false} />
      {more.length ? <div className="tr-also">Also: {more.map((r) => `${ratioText(r)}${r.of ? ` for ${lcFirst(r.of)}` : ''}`).join(' · ')}</div> : null}
      <div className="tr-lab">This patient against its entry rules</div>
      <div className="tr-rules" role="list" aria-label="Entry rules against this patient">{kids}</div>
      <ModelLine t={t} c={c} />
      {t.bav?.length ? (
        <div className="tr-bav">
          {bavenoLines(t, c.facts, c.bleeding).map((b) => <div key={b.k}><b>Baveno VIII {b.k}. </b>{b.text}{b.today ? <span className="tr-today"> {b.today}</span> : null}</div>)}
        </div>
      ) : null}
      <div className="tr-src">{sourceLine(t)}</div>
    </div>
  );
}

/** The head's second line (2D paintLine): the HVPG in its band's colour, then the varix and ascites words. */
function headLine(f: ReturnType<typeof patientFacts>): ReactNode {
  const parts: ReactNode[] = [];
  if (f.blocked) parts.push(<span key="h">HVPG not measurable</span>);
  else if (f.hvpg == null) parts.push(<span key="h">HVPG not measured</span>);
  else parts.push(<span key="h">HVPG <b data-sev={hvpgSev(f.hvpg)}>{fmt(f.hvpg, 1)}</b> mmHg</span>);
  for (const w of [f.varix, f.ascites]) if (w) parts.push(<span key={`d${w}`} className="tr-dot"> · </span>, <span key={w}>{w}</span>);
  return parts;
}

export function TrialsPane() {
  // (the pane reads again when the patient's numbers change: the HVPG, the preset)
  useEngine((s) => s.hvpg);
  const presetId = useEngine((s) => s.presetId);
  const [mode, setMode] = useState<'list' | 'forest'>('list');
  const [openId, setOpenId] = useState<string | null>(null);
  const [folds, setFolds] = useState<Record<FoldKey, boolean>>({ also: false, no: false, unknown: false });
  const [chip, setChip] = useState<string | null>(null);
  const m = (latest.frame?.metrics ?? null) as Record<string, unknown> | null;
  const params = patient.params;
  const facts = useMemo(() => patientFacts(m, params), [m, params]);
  const sections: Sections = useMemo(() => {
    const preset = (PRESETS as { id: string; facts?: { decompensated?: boolean } }[]).find((x) => x.id === presetId);
    return closestOf(sortTrials(TRIAL_IDS, m, params, facts, historyOf(preset?.facts)));
  }, [m, params, facts, presetId]);
  const chips = useMemo(() => chipsOf(sections.no), [sections.no]);
  const ctx: Ctx = { facts, bleeding: !!m?.bleeding, params, presetId: presetId ?? '', live: { ppg: m?.ppg as number | undefined, map: m?.map as number | undefined, hr: m?.hr as number | undefined } };
  const toggle = (k: FoldKey) => { setFolds((f) => ({ ...f, [k]: !f[k] })); if (k === 'no') setChip(null); };
  const nearIds = sections.closest.map((p) => p.t.id);
  return (
    <div className="instrument-view trials-view" data-pane="trials" data-mode={mode}>
      {/* 2D's own mount (trials-pane.js createTrialsPane): the view, its List | Forest switch (the control Pressure and Scope use), the head, and the body that holds the one shown */}
      <div className="pressure-switch" role="group" aria-label="Trials view">
        {(['list', 'forest'] as const).map((v) => <button key={v} type="button" className="ps-btn" data-view={v} aria-pressed={mode === v} onClick={() => setMode(v)}>{v === 'list' ? 'List' : 'Forest'}</button>)}
      </div>
      <div className="tr-hd">
        <div className="tr-t">Trials for this patient</div>
        <div className="tr-s">{headLine(facts)}</div>
      </div>
      <div className="tr-body">
      {mode === 'forest' ? (
        <div className="tr-forest"><ForestCard ids={TRIAL_IDS} highlight={nearIds} selected={openId} onSelect={(id) => { setOpenId(id); setMode('list'); }} /></div>
      ) : (
        <div className="tr-list">
          {SECTIONS.map(([k, label]) => {
            const items = sections[k as keyof Sections];
            const shown = k === 'no' && chip ? items.filter((p) => chips.find((c) => c.key === chip)?.ids.includes(p.t.id)) : items;
            const rowsOf = (hero: boolean) => shown.flatMap((p) => [
              <Row key={p.t.id} p={p} hero={hero} open={openId === p.t.id} onOpen={() => setOpenId(openId === p.t.id ? null : p.t.id)} />,
              ...(openId === p.t.id ? [<Open key={`x:${p.t.id}`} p={p} c={ctx} />] : []),
            ]);
            if (k === 'closest') {
              return (
                <section key={k} className="tr-sec" data-sec={k}>
                  <div className="tr-grp" role="heading" aria-level={3}>{label}</div>
                  {!items.length ? <div className="tr-none">No trial&rsquo;s key rules are met by this patient yet.</div> : null}
                  <div className="tr-items" id={`tr-items-${k}`}>{rowsOf(true)}</div>
                </section>
              );
            }
            if (!items.length) return null;
            const fold = folds[k as FoldKey];
            return (
              <section key={k} className="tr-sec tr-fold" data-sec={k}>
                <button type="button" className="tr-fh" data-fold={k} aria-expanded={fold} aria-controls={`tr-items-${k}`} onClick={() => toggle(k as FoldKey)}>
                  <span className="tr-ft">{label}</span><span className="tr-fc"><span className="tr-fn">{items.length}</span><span className="tr-chev" aria-hidden="true" /></span>
                </button>
                {k === 'no' ? (
                  <div className="tr-chips" role="group" aria-label="What these trials need">
                    {chips.map((c) => <button key={c.key} type="button" className="tr-chip" data-chip={c.key} aria-pressed={chip === c.key} onClick={() => { setChip(chip === c.key ? null : c.key); setFolds((f) => ({ ...f, no: true })); }}>{c.label}<b>{c.ids.length}</b></button>)}
                  </div>
                ) : null}
                <Fold className="tr-fb" open={fold}><div className="tr-items" id={`tr-items-${k}`}>{rowsOf(false)}</div></Fold>
              </section>
            );
          })}
          {Object.keys(TRIALS).length === 0 && <p className="tr-none">No trials.</p>}
        </div>
      )}
      </div>
    </div>
  );
}
