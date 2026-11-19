// The Trials pane (the Trials tab of the 2D Tests card): the landmark trials against the patient on screen. List: "Trials for this patient", the patient's own HVPG, varices and ascites, then Closest to this
// patient (a pip per key rule), Also possible, Not this patient (chips for the rules that keep trials out; a chip shows its trials), Needs history the model lacks; a tap opens a trial in place with its drawing,
// the entry rules as a checklist and its source. Forest: every trial's primary ratio on one scale, the closest in full ink. The decisions are trials-model.ts (the 2D app's, kept); the drawings are the B10 cards.
// The Tests card (B11) mounts this pane; it renders on its own too (?trials, src/ui/trials/mount.tsx).
import { useMemo, useState } from 'react';
import { useEngine, latest, patient } from '../../engine/index.ts';
import { PRESETS } from '../../engine/hales/portal/scenario.js';
import { TrialCard } from '../charts/trial/TrialCard.tsx';
import { ForestCard } from '../charts/forest/ForestCard.tsx';
import { TRIALS } from '../charts/trial/trials.generated.ts';
import {
  TRIAL_IDS, SECTIONS, MARK, MARK_WORD, patientFacts, sortTrials, closestOf, chipsOf, rowReason, ratesOf, comparisonOf, sourceLine, pipsOf, ruleRows, historyOf,
  type Placed, type Sections,
} from './trials-model.ts';
import { Icon } from '../shell/icons.tsx';
import './trials.css';

type FoldKey = 'also' | 'no' | 'unknown';

function Row({ p, open, onOpen }: { p: Placed; open: boolean; onOpen(): void }) {
  const { t, fit } = p;
  const [a, b] = ratesOf(t);
  const pips = pipsOf(fit);
  return (
    <div className="tr-item" data-open={open || undefined}>
      <button type="button" className="tr-row" aria-expanded={open} onClick={onOpen}>
        <span className="tr-name">{t.name}<span className="tr-pips" aria-hidden="true">{[...pips].map((c, i) => <i key={i} data-p={c} />)}</span></span>
        <span className="tr-rates"><b>{a}</b>{b}</span>
        <span className="tr-why">{rowReason(t, fit)}</span>
      </button>
      {open && (
        <div className="tr-open">
          <p className="tr-cmp">{comparisonOf(t)}</p>
          <TrialCard id={t.id} fit={fit as never} head={false} />
          <ul className="tr-rules" aria-label="Entry rules against this patient">
            {ruleRows(fit).map((r, i) => (
              <li key={i} data-state={r.state}><span className="tr-mark" aria-hidden="true">{MARK[r.state]}</span><span className="sr-only">{MARK_WORD[r.state]}: </span>{r.rule}<span className="tr-val"> · {r.value}</span></li>
            ))}
          </ul>
          <p className="tr-src">{sourceLine(t)}</p>
        </div>
      )}
    </div>
  );
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
  const toggle = (k: FoldKey) => setFolds((f) => ({ ...f, [k]: !f[k] }));
  const nearIds = sections.closest.map((p) => p.t.id);
  return (
    <div className="tr-pane" data-mode={mode}>
      <div className="tr-sw" role="group" aria-label="Trials view">
        {(['list', 'forest'] as const).map((v) => <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}>{v === 'list' ? 'List' : 'Forest'}</button>)}
      </div>
      <div className="tr-hd">
        <div className="tr-t">Trials for this patient</div>
        <div className="tr-s">{[facts.hvpg == null ? (facts.blocked ? 'HVPG not measurable' : '') : `HVPG ${facts.hvpg.toFixed(1)} mmHg`, facts.varix, facts.ascites].filter(Boolean).join(' · ')}</div>
      </div>
      {mode === 'forest' ? (
        <div className="tr-forest"><ForestCard ids={TRIAL_IDS} highlight={nearIds} selected={openId} onSelect={(id) => { setOpenId(id); setMode('list'); }} /></div>
      ) : (
        <div className="tr-list">
          {SECTIONS.map(([k, label]) => {
            const items = sections[k as keyof Sections];
            if (k === 'closest') {
              return (
                <section key={k} className="tr-sec" data-sec={k}>
                  <h3 className="tr-grp">{label}</h3>
                  {items.length ? items.map((p) => <Row key={p.t.id} p={p} open={openId === p.t.id} onOpen={() => setOpenId(openId === p.t.id ? null : p.t.id)} />) : <p className="tr-none">No trial&rsquo;s key rules are met by this patient yet.</p>}
                </section>
              );
            }
            if (!items.length) return null;
            const shown = k === 'no' && chip ? items.filter((p) => chips.find((c) => c.key === chip)?.ids.includes(p.t.id)) : items;
            const fold = folds[k as FoldKey];
            return (
              <section key={k} className="tr-sec" data-sec={k}>
                <button type="button" className="tr-fh" aria-expanded={fold} onClick={() => toggle(k as FoldKey)}><span>{label}</span><span className="tr-fc">{items.length}<Icon n={fold ? 'chev-down' : 'chev-right'} /></span></button>
                {fold && (
                  <>
                    {k === 'no' && chips.length > 1 && (
                      <div className="tr-chips" role="group" aria-label="What these trials need">
                        {chips.map((c) => <button key={c.key} type="button" aria-pressed={chip === c.key} onClick={() => setChip(chip === c.key ? null : c.key)}>{c.label} <b>{c.ids.length}</b></button>)}
                      </div>
                    )}
                    {shown.map((p) => <Row key={p.t.id} p={p} open={openId === p.t.id} onOpen={() => setOpenId(openId === p.t.id ? null : p.t.id)} />)}
                  </>
                )}
              </section>
            );
          })}
          {Object.keys(TRIALS).length === 0 && <p className="tr-none">No trials.</p>}
        </div>
      )}
    </div>
  );
}
