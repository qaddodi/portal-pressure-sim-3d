# Surgical shunt width and joins (ruling, 28 Nov)

Status: ruled by Mohammad. No reference picture; the rule is the spec.

## His words
- 28 Nov: "Portocaval shunt is not smoothly connected to cava seems big compared to vessel connected from".
- 28 Nov: "No. They all should draw 1x or less they're origin vein" (every shunt, not only the portocaval one).

## The rule
- A surgical shunt (portocaval S_PC, mesocaval S_MC, distal splenorenal S_DSR, Meso-Rex REX) is DRAWN at 1x the width of its origin vein as drawn, or less. Origin veins: S_PC the portal trunk, S_MC and REX the superior mesenteric vein, S_DSR the splenic vein (`SHUNT_ORIGIN` in `src/scene/vessels/network.ts`).
- The cap is on the drawn width, not the engine's diameter: the engine's numbers and the cards are unchanged (S_PC still says 14 mm). One rule for the vessel texture and the clots (`src/engine/shunt-source.ts`).
- A sewn end (the cava end of S_PC, the renal end of S_DSR) never flares wider than the vein it is sewn into: the flare is cut at the host's width on the rings and on the round cap (`capped`).
- Pinned by `tests/shunt-size-join.test.ts` for every shunt.

## Rejected
- The portocaval shunt drawn 1.12 times the portal trunk, with its cava heel 1.25 times the cava (before 28 Nov).
