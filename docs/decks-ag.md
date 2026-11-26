# Decks A to G (batch B13a)

> **Authoring note (superseded in part).** How to write or change a slide is now in [`docs/deck-authoring.md`](deck-authoring.md): one overlay, one loader, one author path, templates and in-talk questions. This page stays as the record of how this batch of decks was copied and what its files do.


The 14 decks whose ids run albumin to gradients (albumin, ascites, budd-chiari, carvedilol, cause-treated, choose-treatment, circuit, circulation, day,
doppler, encephalopathy, endoscopy, gastric-varices, gradients): 167 slides. H to P and R to W are other batches.

| What | Where | How it is made |
|---|---|---|
| The decks, every slide field | `src/decks/ag/<id>.copied.ts` | `node scripts/copy-decks-ag.mjs --from <2D checkout>` (never typed; `--check` compares) |
| The 2D camera regions | `src/decks/ag/regions.generated.ts` | the same script |
| The engine's numbers per slide, and every `{brace}` value as 2D prints it | `tests/fixtures/deck-numbers-ag.json` | the same script (2D `tests/deck-states.js`, `valueText`) |
| A slide's camera | `src/decks/ag/shots.ts` | derived: the 2D `cam` to a box to a Shot by `scene/frame2d.ts`; lobule cams are the lobule batch's; Circuit slides carry the circuit box (B7) |
| What a slide needs, and who owns each need | `src/decks/hp/hooks.ts` | one readiness table for every deck (`readiness(slide)`); see `docs/deck-authoring.md` |
| The model chain (what the engine host's `sequence` plays) | `src/decks/hp/numbers.ts` (`chainOf`) | the 2D presenter's rule, one copy for every deck |
| `{pv}`, `{pv:0}`, `{co@slide}`, `{6 to 8 g}`, `{>=10 mmHg}`, `{#2}` | `src/ui/text/tokens.ts` | `valueText` = the 2D formatter |
| Parity rows | `src/parity/b13a.ts` | `deck:*` and `slide:*` rows, derived |

**Present and wired.** A slide is present when its words, steps and camera are here. It is wired when every feature it needs has landed (`readiness(slide).wired`, `src/decks/hp/hooks.ts`). All 516 slides of the 42 decks are wired, and `tests/deck-readiness.test.ts` holds that, and that no slide needs a feature nobody owns.

**Loading.** `loadAgDeck(id)` imports one deck on demand, with the 3D overlay laid on. To show a slide the presenter plans it (`src/decks/hp/plan.ts`).

**Checks.** `node --test tests/decks-ag.test.ts` (6 s): ids and order equal the 2D inventory, one test per slide (needs known, owned, equal to the golden list, no field of
a 2D slide dropped), the words equal 2D when a 2D checkout is beside this one, every `{number}` equals the 2D print, and the first model step of five decks replays to the
fixture's digits. The whole 14-deck replay is slow (about 90 s); run it on the Mac: `node scripts/copy-decks-ag.mjs --from <2D> --check`.
