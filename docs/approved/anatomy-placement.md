# Anatomy placement (approved spec, frozen round 21, 25 Nov)

Status: Mohammad approved the mock on 24 Nov ("i like the mock now"; "let's implement based on the plan too; I agree with the recs of the plan"). The integration follows `/mnt/project-files/anatomy-integration-plan.md` (all 8 recommendations approved). 

**Source of truth.** The files in `/mnt/project-files/anatomy-placement-mocks/frozen/round-21/` are the frozen spec: round 16 with the right portal and right hepatic veins' branches re-aimed (round 17) and the hepatic veins' openings on the cava (round 18) and their final form (round 21: mock F); `CHANGES.md`. Later rounds of the mock never change this folder.
- **Data:**
  - `placement-data.json` is the mock's data block: organs A, vessels A and today, vjoin joins, gut, pack, caudate, collaterals and shunts.
  - `pack.json` and `organsA.json` hold the inflated organ vertices as the page builds them. The caudate is not in `organsA.json`; it is built in `page/script2.js` from `placement-data.json` `caudate`.
- **Page:** `page/` holds `geom.js`, `script2.js`, the inlined `index.html`, and the app's organ file copy.
- **Tools:** `tools/` holds `mkdata.py`, which writes the data block, the checks `check2.mts`, `c3.mts` and `bend.mjs`, and the packer.
- **Checksums:** `SHA256SUMS`.
- **Live page:** the artifact https://claude.ai/artifact/Kz6JYsrEeYm2Bq3XS8ZqSw, version 16 (round 16; round 17's and 18's courses are not on it yet, and `stills/` are round 16's).

## What he asked for and approved (rounds 1 to 15)
- **The view and depth:**
  - The front view is kept as today's.
  - Real, rounded depth: organs re-inflated (Poisson dome) at their own depth and thickness.
  - The abdomen is pulled 16% toward the middle; the liver keeps its right lobe width.
- **Stomach and duodenum:**
  - The oesophagus is part of the stomach mesh.
  - The antrum tapers into the duodenum with no line: one gut surface (depth pre-pass, stencil, inks last).
  - The funnel's edges leave at the stomach's own slope, and the antrum shades round the funnel's axis by the cut.
- **Small bowel and colon:**
  - The small bowel is tubes packed under the colon.
  - The splenic flexure and descending colon are moved in and back.
  - Only the rectum's end fades.
- **Spleen and kidney:**
  - The spleen sits toward the stomach.
  - The kidney is further back (zc -0.26), and its renal vein leaves the hilum.
- **Portal veins:**
  - The portal vein and hepatic artery split toward the right lobe.
  - The hepatic artery runs between the portal vein (in front) and the IVC.
  - The right portal vein has two branches (round 17, Mohammad 24 Nov: "RPV need to be posterior and anterior and from front look less 90 degree and appropriate"): the **anterior** one (rpva) runs forward and up-lateral toward segments 5 and 8, the **posterior** one (rpvp) back, lateral and down toward segments 6 and 7; from the front they leave as a Y (about 48 degrees apart), not a T.
  - The left portal vein climbs, then runs on into the left lobe as one vessel that fades there, with no fork (round 16: the upper branch was too long and too prominent, and hid the caudate lobe).
- **Right hepatic vein:** a short trunk with two fading branches (round 17, Mohammad 24 Nov: "RHV branch shouldn't be going upwards"): both drain the right lobe from lateral and below, up and medially into the trunk; neither runs toward the head from the split. The anterior one (rhva) runs lateral and level, in front; the posterior one (rhvb) lateral and down, behind it.
- **The hepatic veins' openings (round 21, Mohammad 25 Nov, mock F: "F but are you sure the openings will be joined smoothly right? No kinks or sharp turns"):** two mouths on the cava at the SAME vertical level (y 1.19 and 1.21, within a mouth's radius), the cava's wall visible between them. The right hepatic vein opens on its own on the cava's right wall; the middle and left hepatic veins share a short trunk (3 of its radii, 0.060) that opens on its own on the cava's left wall. The middle hepatic vein drains the RIGHT lobe: it starts at (-0.400, 0.913, 0.080), crosses the cava's front face at about y 1.00 on one smooth diagonal, and joins the left one in the trunk at (-0.119, 1.125, -0.073). Smooth: worst turn per 0.01 of arc 3.8 (rhv), 4.2 (mhv), 5.6 degrees (lhv), the app's bar 8.5; the middle one meets the trunk at 55 degrees (bar 60). No ink in the cava's lumen (0.45 % at a turned view, bar 0.5).
- **Two crossings apart in depth (round 18):** the left hepatic artery ends higher on the left lobe's inflow bed, (0.068, 0.775, -0.020), so its last stretch stays 0.013 behind the left portal vein where they overlap on the screen (it stays behind the vein); the spontaneous splenorenal shunt (C6) comes down at -0.128 to -0.135 in depth, so the gastrorenal shunt (C5) passes 0.013 behind it on its way onto the renal vein, not at its depth (`tests/vessel-crossings.test.ts`).
- **Splenic vein:** it leaves the hilum straight, with **no branches** into the spleen (round 13).
- **Coronary (left gastric) vein:** it hugs the lesser curve, 0.016 outside the stomach's border (round 13).
- **Oesophageal varices:**
  - C1a and C1b run on the oesophagus's right front wall.
  - They then make one wide bend above the heart into the top of the azygos arch (round 14).
  - **One run along the oesophagus (Mohammad, 25 Nov: "make the esophageal varices one vein not two ... I want the 3 varices on the esophageal"):** the three strands run unbroken from the cardia to where the vein turns off the oesophagus toward the azygos (height 1.50), and gather only there. They no longer pinch together mid-oesophagus (height 1.40, the engine's VAR station). In the placement the coronary vein's course (C1a, the strands' vessel) is carried on along the drain (C1b) to that height (placed-network.ts); the engine's two edges and their numbers are unchanged.
  - **One opening front (Mohammad, 25 Nov: "I don't want it to start growing from azygous towards varices. I want the opening to be realistic. Coronary vein into varices then into azygous. That's how the varices open."):** the varices open as one front in flow order: the coronary vein into the varices, then on into the azygos. Nothing ever draws from the azygos end back toward the varices, and no piece starts before the one that feeds it is whole. They close the other way, the azygos end first. The whole run takes the same time as any collateral (about 1.15 s). Rejected: the two pieces drawing on at the same moment, each from its own start (presence-track.ts `frontsOf`, `alongFronts`, tests/presence-front.test.ts).
  - **Width follows pressure (Mohammad, 25 Nov: "the varices need to more prominent/thick with such high pressure"):** on top of the size, the varix's wall pressure thickens the strands: nothing under 10 mmHg, whole by 15, then about twice the width of the left gastric vein that feeds them (shape.ts `varixPressRamp`, `VARIX_PRESS_THICK` 1.9). They still lie on the oesophagus without touching each other, and a band still closes them to the same thin cord.
- **Splenorenal shunts:** the spontaneous and distal shunts come down medial to and in front of the kidney into the renal vein, never through it (round 14).
- **Caudate lobe (round 15, plan question 3):**
  - **Shape and place:** an upright soft egg on the liver's back, just left of the IVC, which lies in its groove. It sits between the hepatic vein confluence (above) and the portal fork (below), behind the left portal vein and the left hepatic artery.
  - **Numbers:** centre (-0.105, 0.79, -0.13), half-axes (0.066, 0.19, 0.06). It is fuller toward the papillary end, and the IVC side is drawn in.
  - **Veins:** three short caudate veins enter the IVC's left wall.
  - **Look and visibility:** liver tones with the rim light. Shown in A only.
- **Looks:** all five looks (Light, Soft, Dark, Navy, Black) from the app's tokens.

## Rules the checks enforce (all pass on round 16; on rounds 17 and 18 the app's node checks hold them for the changed courses)
- **No passing through:** no vessel passes through another vessel, the gut or an organ, except at joins and intended entries.
  - **Intended entries:**
    - the IVC into the liver and heart;
    - the splenic vein into the spleen hilum;
    - the renal vein into the kidney hilum;
    - the coronary vein onto the stomach;
    - the rectal varices into the rectum;
    - the caudate veins into the IVC;
    - the IVC in the caudate's groove.
  - **Close pairs that are joins or intended contacts:**
    - ivc/svc, smv/sv, rpv/lpv, rpva/rpvp, rhva/rhvb, rha/lha and the hepatic veins at the confluence;
    - ivc/DIPS, the stent into the cava;
    - ha/DIPS at 0.005 and sv/S_DSR at 0.006, both positive clearance.
- **Gut:** the small bowel has 0 self hits.
- **Smooth courses:** every course bends no tighter than about 3 of its radii.
  - Main tree: r/R is at most 0.35, set by the refine and flare joins.
  - Collaterals and shunts: r/R is at most 0.27 on the page's own curve. They are relaxed with fixed ends; the root cause of their elbows was depth ramped over one short stretch.
- **Organs:** they overlap only at the heart and right atrium, which is pre-existing.

## Not in the mock (derived in the app, listed for him: plan risk 5)
Liver beds, branch fans, caput medusae and ascites. The app's junction skins replace the mock's flare joins. Vessels stay crisp over organs, per plan question 1 (REPLACED 25 Nov by `docs/approved/organ-veil.md`: an organ lets itself cover the vessels deep inside it, gone at 2x zoom).

## Rejected along the way
- **The middle hepatic vein joining the left one in a common trunk that crosses the cava's face (2a54261a, round 18; Mohammad 25 Nov: "the hepatic veins look bad now. Move the middle hepatic vein to be separate from left").**
- **The middle hepatic vein rising on the cava's left and hooking into its wall (c89f37f0 / 981c9d60, rounds 19 and 20; Mohammad: "MHV sucks. It was much better earlier", "It comes from the right lobe not left", "I feel you fucked up this entire junction").** Mocks that showed all three veins as one opening were rejected too ("The way you're mocking it shows they all share one opening").
- His downloaded GLB ("doesn't look good, keep working on ours").
- The anatomy editor (removed).
- Three branches off the splenic vein in the spleen.
- The left portal vein's fork and its upper branch.
- Varices floating in front of the oesophagus.
- Shunts through the kidney.

Stills (headless, software GL): `stills/`, front, right side and top in five looks, plus close-ups.

## Rulings in the app (after the freeze; scripts/copy-placement.mjs appends this file to the sheet)
- **Caudate lobe and its veins (Mohammad, 24 Nov 3:17 PM ET: "caudate lobe and its vessels same rules; only appears when we want (like BCS etc)"):** hidden by default, like the other conditional anatomy (the collaterals); they ease in only when a case or slide calls for them (Budd-Chiari, the caudate slides) and ease out after, by the same show and fade path. Never shown on a healthy figure.
- **Smooth everywhere (Mohammad, 24 Nov 3:08 PM ET: "make sure all the joins are smooth and all blood vessels run organically smoothly obviously, and organs look smooth"):** held by `tests/anatomy-smooth.test.ts` (one bar for every vessel, join and organ; what is rougher today is listed in `tests/anatomy/smooth-allow.json`, which only shrinks).
- ~~**Vessels stay crisp over the organs** (plan question 1)~~ replaced, 25 Nov, Mohammad: "organs cover ... vessels going inside them" (`docs/approved/organ-veil.md`; switch: `ORGAN_VEIL.on`); **TIPS on the portal and hepatic vein trunks** (question 5); **HVPG wedge in the MAIN right hepatic vein, not its branch** (Mohammad 24 Nov 5:22 PM, replacing question 4's lower branch); **bowel and colon painted art retired** (question 7).
- **The right portal vein's two branches (Mohammad, 24 Nov: "RPV need to be posterior and anterior and from front look less 90 degree and appropriate"; frozen round 17):** an ANTERIOR branch (rpva) that runs forward and up-lateral toward segments 5 and 8, and a POSTERIOR one (rpvp) back, lateral and down toward segments 6 and 7, with real depth between them. From the front they leave the split as a Y (48 degrees apart over their first 0.05; tip to tip 74), not a T. Held by `tests/placed-branches.test.ts`.
- **The right hepatic vein's branches never run upward (Mohammad, 24 Nov: "RHV branch shouldn't be going upwards"; frozen round 17):** both drain the right lobe from lateral and below, up and medially into the trunk: from the split the anterior one (rhva) runs lateral and level, in front, the posterior one (rhvb) lateral and down, behind it. No point of either is above the split. Held by `tests/placed-branches.test.ts`.
- **Cut-over (25 Nov 2026):** this placement is the app's only anatomy (Mohammad, 24 Nov 5:31 PM ET: "make this the default and remove the old"). The 2D figure's placement was last the default at f17b151a.
- **The left portal vein tapers and fades early (Mohammad, 25 Nov: "make the left portal vein taper a bit more and fade earlier than appear going too far into the left lobe same caliber doesn't look good"):** past the umbilical vein's root (0.14 along its second piece) and the meso-Rex landing (0.31) it narrows progressively to 0.4 of its width at its tip, and it fades from 0.34 to nothing at 0.74 of that piece (before: full width, fading 0.4 to 1). Held by `tests/lpv-taper.test.ts`.
- **The hepatic veins' two openings (Mohammad, 25 Nov, mock F; frozen round 21):** the right hepatic vein opens on its own on the cava's right wall; the middle hepatic vein joins the left one in a short common trunk (3 of its radii, 0.060, 1 to 1.5 cm) that opens on its own on the cava's left wall; **both mouths at the same vertical level** (within a mouth's radius, the cava's wall showing between them). The middle one drains the right lobe: it starts at (-0.400, 0.913, 0.080), crosses the cava's front face at about y 1.00 on one smooth diagonal and meets the left one in the trunk. **Smooth, no kinks (Mohammad: "are you sure the openings will be joined smoothly right? No kinks or sharp turns"):** every course turns at most the app's bar (8.5 degrees per 0.01 of arc: measured 3.8, 4.2, 5.6), the middle one meets the trunk at 55 degrees (bar 60), and the cava's junction draws no ink in its lumen (0.45 %, bar 0.5, tests/skin-weld-shade.test.ts). The engine still ends all three at IVCS (the cava's cut is the trunk's ostium). The Budd-Chiari clot sits at each vein's own outflow and ends a vein width BEFORE each join (25 Nov, Q+, `docs/approved/budd-chiari-clot.md`): the left one's fills the trunk and runs on past the middle one's mouth into the left vein; the middle one's is a plug a width short of the trunk. Held by `tests/hv-ostia.test.ts` and `tests/hv-junction-smooth.test.ts`. **Rejected, do not return:** the trunk crossing the cava's face and the three veins sharing one opening (2a54261a, 25 Nov: "the hepatic veins look bad now"); the middle vein rising on the cava's left and hooking into its wall (c89f37f0 and 981c9d60: "MHV sucks", "I feel you fucked up this entire junction"); mock pictures that make the two mouths read as one opening.
- **The left hepatic artery behind the left portal vein, further (25 Nov, frozen round 18):** it stays behind the vein, as ruled, now 0.013 behind it where they overlap on the screen (0.003 in round 17): its end is placed higher on the left lobe's inflow bed. In the same round the gastrorenal shunt passes 0.013 behind the spontaneous splenorenal one, which comes down in front of the renal vein's depth, instead of crossing it at its depth.


_Copied into the repo by `scripts/copy-placement.mjs` from `/mnt/project-files/anatomy-placement-mocks/frozen/round-21` (round 21); its data is `art/anatomy-placement/`._
