# Pathology spec, per preset

Plan 40, 22 Nov 2026 (audit: 04-pathology.md; base 4670194e). Written for Mohammad to correct cell by cell.
The node gate `tests/pathology-spec.test.ts` reads the JSON block at the foot of this file, so a corrected cell changes what the test enforces: every preset has a row (a new preset fails by name until its row is written),
and each row's thrombus, stenosis, fibrosis lead, open and closed collaterals, cavernoma channels, caudate, congestion, spleen, ascites and varix are checked against the engine's own state of that preset.
The clot's place along its vein (the `clotAnchor` table, the "ostium" rows) is Plan 34b/34c's; their world-space gate is added there. Here `clotAnchor` is only checked for being complete.

How to read the columns:
- **Clot**: the vein (engine edge id) and where along it the clot sits. "ostium" means the clot's proximal cap is at the vein's opening into the IVC and the clot grows upstream from there. "mid" means centred on the vein.
- **Fibrosis**: which lobule channel leads: septa (bridging, cirrhosis), tract (periportal, pipestem), CV (centrilobular ring), none. "Congestion" is zone-3 sinusoid dilation and the liver's dusk, which is separate from fibrosis.
- **Liver / spleen**: the drawn scale against healthy.
- **Collaterals**: must be drawn open, and must not be drawn.
- Numbers in brackets are what the code drew at the audit (node, base 4670194e), before Plan 40's fixes.

## Pre-hepatic

| Preset | Clot | Fibrosis | Liver | Spleen | Ascites | Collaterals open | Must not show |
|---|---|---|---|---|---|---|---|
| pvt-acute | PV_TRUNK, mid, occlusive | none | 1.0 | 1.0 (acute, no time to grow) | none | small preformed only | a cavernoma braid (today 2 to 3 C8 channels grow on day 0) |
| pvt-chronic | PV_TRUNK, mid, occlusive | none | 1.0 | enlarged [1.48] | none | cavernoma C8 (several channels), C1 varices | |
| svt | SV_CONF, mid | none | 1.0 | enlarged [1.42] | none | C2 short gastrics, C5, fundal varix | oesophageal varices [VAR 0, ok] |

## Presinusoidal

| Preset | Clot | Fibrosis | Liver | Spleen | Ascites | Collaterals open | Must not show |
|---|---|---|---|---|---|---|---|
| schisto | none | tract leads (pipestem) [tract 0.85, septa 0, CV 0] | 1.0 | enlarged [1.52] | none or trace | C1, C3, C4 | bridging septa, nodules |
| psvd | none | tract leads, lighter than schisto [0.81] | 1.0 | enlarged [1.49] | none or trace | C1, C3, C4 | bridging septa, nodules |

## Sinusoidal (cirrhosis)

Cirrhosis means complete bridging septa around nodules at every stage: the septa lead in every cirrhosis preset, and the tracts and CV ring are smaller than the septa.

| Preset | Fibrosis | Liver | Spleen | Ascites | Collaterals / varices |
|---|---|---|---|---|---|
| cirr-comp | septa lead [septa 0.20, tract 0.20, CV 0.22: not leading] | nodular, shrinking | mildly enlarged [1.16] | none | none open, no varices |
| csph | septa lead [0.60 / 0.17 / 0.18] | nodular | enlarged [1.41] | none | C1 small varices |
| masld-csph | septa lead [0.60 / 0.33 / 0.18] | nodular | enlarged | none | small varices |
| cirr-decomp | septa lead [1.00 / 0.11 / 0.11] | shrunken, nodular [scale 0.976: 2.4 %, barely seen] | enlarged [1.62] | yes [1.2 L] | large oesophageal varices |
| cirr-decomp-tips | septa lead | shrunken | falling [1.25] | cleared | TIPS stent; varices collapsed |
| cirr-hepatofugal | septa lead | shrunken | | none | C6 splenorenal; portal flow reversed |
| gastric-varix | septa lead | shrunken | enlarged | yes | C2, C5, fundal varix; no coronary→oesophageal route (today C1a/C1b drawn open, 4.9 mL/s) |
| pregnancy | septa lead [0.70] | nodular | enlarged | none | varices grow with weeks |

## Post-sinusoidal and post-hepatic

| Preset | Clot / lesion | Fibrosis | Congestion | Liver | Ascites | Collaterals | Must not show |
|---|---|---|---|---|---|---|---|
| sos | none (sinusoidal lining, zone 3) | CV ring leads [CV 0.82] | yes [0.73] | enlarged [1.02] | yes [2.3 L] | small | clot in any vein |
| budd-chiari | RHV_IVC, MHV_IVC, LHV_IVC at the **ostium** (proximal main trunk), occlusive, growing upstream [today in the outer half: RHV 0.18-0.56, MHV 0.15-0.23, LHV 0.18-0.45 of the vein from the periphery] | none or CV (decision below) | yes [1.0] | enlarged [1.03]; **caudate enlarged with its veins draining** [drawn only on a slide] | massive [8 L] | C9 lumbar-azygos | clot in the IVC; clot in distal HV branches |
| ivc-web | IVCS_RA narrowed (web) at the HV ostia level, no clot | none | yes [0.70] | enlarged | yes [3.4 L] | C9 | clot anywhere |

## Cardiac

| Preset | Fibrosis | Congestion | Liver | Ascites | Must not show |
|---|---|---|---|---|---|
| rhf | none at 60 days (decision below) | yes [1.0] | enlarged | yes [6.1 L] | clot, septa |
| constrictive | none at 60 days | yes [0.78] | enlarged | yes [4.1 L] | clot, septa |

## Sliders: what each must visibly change

| Slider | Must change in the body | Must change in the lobule / sinusoid |
|---|---|---|
| Cirrhosis | liver outline nodular and smaller, spleen grows over days, collaterals open | septa grow and lead; sinusoid capillarizes (fenestrae close, collagen in Disse) |
| Fibrosis · pre | portal pressure up, spleen, collaterals | portal tracts grow (pipestem) |
| Fibrosis · sin | portal pressure up | sinusoid collagen only; the lobule shows nothing (no perisinusoidal pattern) |
| Fibrosis · post | WHVP up, ascites | CV ring grows |
| Thrombus (any vein) | clot grows in that vein; for a vein that opens into the IVC it grows from the ostium upstream [today from the middle, cut back from the cava] | none |
| Splenic vein thrombosis | clot in SV_CONF, spleen grows, short gastrics open | none |
| Stenosis | smooth waist with two flat arrowheads | none |
| TR / Pericardial / Contractility | IVC and HVs dilate, liver dusk, ascites | zone-3 sinusoids widen |
| Albumin | ascites | lymph protein |

**IVC web: no caudate.** The web sits above the caudate veins' entry into the cava, so their outflow is blocked too: their flow does not rise, the lobe does not enlarge, and the figure draws none (caudateShown false, pinned by the gate).

## Decisions (Mohammad, 22 Nov 2026, 6:21 PM ET)
1. **Budd-Chiari lobule:** congestion only, no centrilobular ring.
2. **Cardiac lobule (rhf, constrictive):** congestion only, no ring.
3. **Budd-Chiari clot end:** the clot stops before the IVC (Plan 34c builds it).
4. **Liver size:** keep today's (2D's 2.4 % cirrhotic shrink; congested livers grow 2 to 3 %).

```json pathology-spec
{
  "clotAnchor": { "RHV_IVC": "ostium", "MHV_IVC": "ostium", "LHV_IVC": "ostium", "PV_TRUNK": "mid", "SV_CONF": "mid", "LRV_IVC": "mid", "RRV_IVC": "mid" },
  "presets": {
    "healthy":          { "thrombus": [], "lead": "none" },
    "postprandial":     { "thrombus": [], "lead": "none" },
    "pvt-acute":        { "thrombus": ["PV_TRUNK"], "lead": "none", "cavernomaChannelsMax": 1 },
    "pvt-chronic":      { "thrombus": ["PV_TRUNK"], "lead": "none", "open": ["C8"], "cavernomaChannelsMin": 3, "spleenMin": 1.2 },
    "svt":              { "thrombus": ["SV_CONF"], "lead": "none", "open": ["C2", "C5"], "varix": { "GV": [0.5, 1] } },
    "schisto":          { "thrombus": [], "lead": "tract", "spleenMin": 1.2 },
    "psvd":             { "thrombus": [], "lead": "tract", "spleenMin": 1.2 },
    "cirr-comp":        { "thrombus": [], "lead": "septa" },
    "csph":             { "thrombus": [], "lead": "septa" },
    "masld-csph":       { "thrombus": [], "lead": "septa" },
    "cirr-decomp":      { "thrombus": [], "lead": "septa", "ascitesMin": 500, "varix": { "VAR": [0.8, 1] } },
    "cirr-decomp-tips": { "thrombus": [], "lead": "septa" },
    "cirr-hepatofugal": { "thrombus": [], "lead": "septa", "open": ["C6"] },
    "gastric-varix":    { "thrombus": [], "lead": "septa", "open": ["C2", "C5"], "closed": ["C1a", "C1b"], "varix": { "GV": [0.8, 1], "VAR": [0, 0] } },
    "pregnancy":        { "thrombus": [], "lead": "septa" },
    "sos":              { "thrombus": [], "lead": "cv", "congestionMin": 0.4 },
    "budd-chiari":      { "thrombus": ["RHV_IVC", "MHV_IVC", "LHV_IVC"], "lead": "none", "congestionMin": 0.4, "caudateShown": true, "open": ["C9"] },
    "ivc-web":          { "thrombus": [], "stenosis": ["IVCS_RA"], "lead": "none", "congestionMin": 0.4, "caudateShown": false },
    "rhf":              { "thrombus": [], "lead": "none", "congestionMin": 0.4 },
    "constrictive":     { "thrombus": [], "lead": "none", "congestionMin": 0.4 }
  }
}
```
