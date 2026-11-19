// The model and the figure agree: the engine is up, and a pressure wears the colour its cut-offs give the number shown (the 2D app's pressure-colour rule, over the play bar's readouts).
import { registerRule } from '../core/rules.copied.js';
import { hvpgSev, ppgSev } from '../../../engine/hales/portal/pressure-cuts.js';

registerRule({ id: 'figure-engine', family: 'figure', owner: 'src/engine/boot.ts', why: 'The model is running: a crashed or silent engine leaves every number on the screen stale',
  check: (r: Record<string, any>) => {
    const f = r.figure, out: { what: string; where: string }[] = [];
    if (f?.status === 'crashed') out.push({ what: 'The engine crashed', where: String(r.health?.crash ?? 'no message') });
    if (f?.status === 'ready' && f.readings?.hvpg == null) out.push({ what: 'The engine is ready but has no HVPG', where: `patient ${f.patient}` });
    return out;
  } });

registerRule({ id: 'pressure-colour', family: 'pressure', owner: 'src/engine/hales/portal/pressure-cuts.js', why: 'A pressure wears the colour its cut-offs give the number shown: HVPG amber over 5, red 10; PPG amber 6, red 12',
  check: (r: Record<string, any>) => (r.readouts?.items ?? []).flatMap((x: { label: string; value: number | null; sev: string | null }) => {
    if (x.value == null || !x.sev) return [];
    const v = +x.value.toFixed(1);
    const want = /PPG/.test(x.label) ? ppgSev(v) : /HVPG/.test(x.label) ? hvpgSev(v) : null;
    return want && want !== x.sev ? [{ what: `${x.label} ${v} is coloured ${x.sev}`, where: `its cut-offs give ${want}` }] : [];
  }) });
