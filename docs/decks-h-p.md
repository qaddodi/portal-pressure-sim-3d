# Decks H to P (batch B13b)

Twelve 2D decks whose ids run from H to P, 138 slides: hvpg, hyperdynamic, kidney, landmark-trials, lobule, masld, meso-rex, ncph, next-bleed, outflow,
pregnancy, prehepatic. (Split by id with B13a A to G and B13c R to W; the id is the rule, not the title.)

| Piece | File | What it does |
|---|---|---|
| Copy | `scripts/port-decks-hp.mjs --from <2D checkout> [--check] [--numbers]` | Writes `src/decks/hp/data/<id>.copied.ts` (every field of every slide, verbatim), `regions.copied.ts`, `ids.copied.ts`; `--numbers` writes `tests/fixtures/decks-hp-numbers.json` (the 2D engine's reading of every slide and how each `{token}` prints). Words are never retyped. |
| Camera | `src/decks/hp/cams.ts` | A 2D `cam` (region, box, list, `fit`, lobule or sinusoid) becomes a scene `Shot` in the shared body frame; the room solver fits it into the room the cards leave. |
| Needs | `src/decks/hp/hooks.ts` | Each slide's needs (a tool, a visual, a procedure, a lens, callouts, compare, a slider, a time-lapse…) as features with ONE owner batch and a `landed` flag. Slide is present when words, numbers and shot are here, wired when all its needs have landed. `tests/decks-hp-data.test.ts` fails a need nobody owns and a landing whose file is missing. |
| Plan | `src/decks/hp/plan.ts` | Per slide: shot, view, lens, stations, model step, needs. All derived from the copied fields. |
| Numbers | `src/decks/hp/numbers.ts`, `calc.ts` | The 2D presenter's step chain (outline first, then every slide), run in a second engine worker; a slide's `{tokens}` print as 2D prints them. Tiles card: `TilesCard.tsx`. |
| Claims | `src/parity/b13b.ts` | `deck:` and `slide:` rows, wired from `readiness`. Camera rows are B13c's. |

Tests: `node --test tests/decks-hp-data.test.ts tests/decks-hp-numbers.test.ts` (seconds). `DECKS_HP_FULL=1` replays all 138 slides through the pinned engine (about a minute; for the Mac).
After a 2D deck changes: `node scripts/port-decks-hp.mjs --from <2D> --numbers`, then the tests.
