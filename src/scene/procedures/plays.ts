// Which procedure kinds a slide's Play button plays on the figure today (ui/deck/procs-link.ts), and why the rest wait. The readiness tables (decks/ag/needs.ts, decks/hp/hooks.ts, decks/rw/hooks-builtin.ts)
// read this; tests/deck-procs-link.test.ts holds every kind here to a spec, and a device the scene draws it on (a catheter on its route, the echoendoscope, or the graft's vessel).
/** The kinds (a slide's `procedure.kind`, before its target) that play. */
export const PROCEDURE_PLAYS: ReadonlySet<string> = new Set(['tips', 'tipsgrad', 'brto', 'bato', 'hvpgcath', 'irivc', 'irpv', 'eus', 'eusglue', 'rex']);
/** The kinds that do not, and what is missing. */
export const PROCEDURE_OPEN: Readonly<Record<string, string>> = {};
