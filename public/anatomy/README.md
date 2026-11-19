# Anatomy assets, stage 1 (style frame)

The body in frontal view: organs, the main portal and hepatic veins, the IVC and the hepatic arteries. Built by code in
`art/anatomy/` (Blender 5.3 as the Python module `bpy`, no hand edits), so every file here can be rebuilt exactly.
Stage 1 only: no morph targets, collaterals, procedures, devices or lobule yet.

| File | What |
|---|---|
| `body-stage1.glb` | glTF 2.0 binary: organ meshes, one empty node per vessel (centreline in `extras`), three cameras, the lobule dive anchor |
| `vessels.json` | the same vessel data as a sidecar, plus the engine node points, the cameras and the dive anchor |

Source: `art/anatomy/body-stage1.blend` (vessels are real Blender curves there, one per ID, radius on every point).

## Units, axes, origin

- **Metres, real adult size.** The body plate is 0.36 m wide and 0.72 m tall. (The 3D app's scene units put the plate at about
  4.6 units wide, so the scene thread scales this file by about 12.8 if it keeps that scale.)
- **glTF axes: +X the patient's left, +Y up (cranial), +Z anterior.** The frontal view looks along -Z, so the patient's right is on the
  viewer's left. Blender's front view (looking along +Y) shows the same picture.
- **Origin: the portal confluence** (engine node `CONF`), behind the pancreatic neck at L1-L2.
- Each organ node has a translation (its bounding-box centre) and vertices relative to it: a sensible pivot. Vessel nodes and the
  group nodes sit at the origin with no transform, so vessel points are scene coordinates.

## Node tree

```
organs/   liver, gallbladder, spleen, stomach, duodenum, pancreas, small_bowel, appendix, colon,
          kidney_left, kidney_right, heart, right_atrium, aorta, diaphragm, falciform_ligament, umbilicus, body_plate
vessels/  one empty per engine edge ID (below)
cameras/  camera_body, camera_portal, camera_liver (glTF camera names: body, portal, liver), lobule_anchor
```

Each organ has one material named like the organ with a flat base colour (the Light look's tone) as a hint only; the app's shader sets
the colour. No textures, no UVs, smooth normals.

### Organs and triangle counts

| Mesh | Triangles | Notes |
|---|---:|---|
| `liver` | 22,076 | right and left lobes, caudate, gallbladder fossa and notch, umbilical notch and fissure, porta hepatis, IVC groove (open behind), impressions of the heart (through the diaphragm), stomach, oesophagus, right kidney, colon, duodenum. Attribute `_LOBE` (float): 0 right (with the quadrate), 1 left, 2 caudate |
| `gallbladder` | 1,306 | fundus just past the inferior border at the right costal margin, neck toward the porta |
| `spleen` | 3,398 | along the 10th rib, convex diaphragmatic surface, concave visceral surface, two superior-border notches, hilum facing anteromedially |
| `stomach` | 9,664 | stomach and lower oesophagus as one shape (the oesophagus runs up through the diaphragm to T7). Attribute `_ESOPHAGUS` (float): 1 on the oesophagus, 0 on the stomach |
| `duodenum` | 3,830 | D1 bulb to the DJ flexure, the C around the pancreatic head, D3 in front of the IVC and aorta, behind the SMV |
| `pancreas` | 4,694 | head in the C, uncinate behind the SMV, neck in front of the confluence, body and tail to the splenic hilum; grooves for the SMV, PV and splenic vein behind it |
| `small_bowel` | 23,754 | stylised mass: jejunal loops in rows behind, ileal loops in columns in front, terminal ileum into the caecum |
| `appendix` | 820 | from the caecum over the pelvic brim |
| `colon` | 13,484 | caecum, ascending, hepatic flexure, transverse (sagging, in front), splenic flexure (higher, behind), descending, sigmoid, rectum; haustra as a gentle ripple. Attribute `_SEGMENT` (float): 0 caecum, 1 ascending, 2 transverse, 3 descending, 4 sigmoid, 5 rectum |
| `kidney_left`, `kidney_right` | 2,804, 3,028 | left higher than right, upper poles medial and posterior, hila anteromedial |
| `heart` | 6,640 | ventricles (right ventricle forming the front), left atrium, pulmonary trunk stub |
| `right_atrium` | 2,212 | with its auricle; the IVC and SVC end inside it |
| `aorta` | 4,604 | landmark mesh (no engine edge): ascending, arch, descending, abdominal to the bifurcation at L4, iliac stubs |
| `diaphragm` | 5,000 | 3 mm sheet over the liver, stomach and spleen, under the heart; only its back two thirds (cut at a coronal plane) so it reads as the dome line in the frontal view without covering the liver; openings for the IVC, oesophagus and aorta |
| `falciform_ligament` | 428 | its line on the liver's anterior surface, from the umbilical notch up |
| `umbilicus` | 768 | small ring on the (undrawn) anterior abdominal wall, midline, L3-L4 |
| `body_plate` | 133 | flat torso silhouette in the coronal plane behind everything (z = -0.17 m in glTF) |
| **Total** | **108,643** | budget 150,000; liver budget 30,000 |

Custom attributes are glTF vertex attributes with a leading underscore; three.js's GLTFLoader names them in lower case (`_lobe`,
`_esophagus`, `_segment`).

## Vessels

One node per engine edge ID (topology from hales-engine `src/portal/topology.js`, identical in the 2D app). Node `extras`:

```json
{ "vessel": true, "label": "Portal vein", "group": "portal", "from": "CONF", "to": "PVH",
  "points": [[x, y, z], ...], "radii": [r, ...] }
```

- `points`: the centreline from the edge's `from` node to its `to` node (blood's nominal direction), resampled about every 5 mm, glTF axes,
  metres. `radii`: tube radius at each point, metres (the engine's nominal diameter / 2, tapered toward the periphery on the intrahepatic
  branches). Build the tube through the points (linear or Catmull-Rom both follow the course; the points are dense).
- **Joins:** every vessel end that names the same engine node sits on exactly the same point (`CONF` is shared by `SMV_CONF`, `SV_CONF`,
  `LGV_CONF` and `PV_TRUNK`; `IVCS` by the three hepatic veins, `IVC_IS` and `IVCS_RA`; and so on). `vessels.json` lists the node points under `nodes`.
- `group`: `portal`, `systemic` or `artery` (colour family).
- `vessels.json` also keeps each vessel's authored `control` points and `controlRadii` (6 or so per vessel), for editing.

Delivered: `SMV_CONF`, `V_SPL`, `SV_MID`, `SV_CONF`, `LGV_CONF`, `PV_TRUNK`, `PVH_R`, `PVH_L`, `RHV_IVC`, `MHV_IVC`, `LHV_IVC`, `IVC_IS`,
`IVCS_RA`, `ILI_IVC`, `LRV_IVC`, `RRV_IVC`, `SVC_RA`, `A_HEP`, `A_HR`, `A_HL`.

Notes on what the engine's edges mean here: `IVC_IS` runs from the renal veins (`IVCI`) to just below the diaphragm (`IVCS`), so it is the
infrahepatic and retrohepatic IVC; `ILI_IVC` is the infrarenal IVC. `A_HEP` runs from the aorta (`AO`, at the celiac level) to the hilum
(`HA`), so it covers the celiac trunk, common and proper hepatic arteries. `A_HR` and `A_HL` end inside the liver (`SIN_R`, `SIN_L`).

## Cameras

Perspective, vertical field of view 30° (as the mocks). glTF camera names `body`, `portal`, `liver`; nodes `camera_body` and so on
(a node cannot share the name `liver` with the mesh). Each camera node's `extras.target` is the point it looks at, for the ±25° orbit.

| Camera | Frames |
|---|---|
| `body` | the whole plate, frontal |
| `portal` | confluence, portal trunk, splenic vein to the spleen, the SMV, from 8° above |
| `liver` | the liver with its portal and hepatic veins, from 8° to the patient's right and 6° above |

## The dive into the lobule (stage 4)

- `lobule_anchor` (under `cameras/`, extras `point`, `normal`, `engine`) marks where the camera dives into the liver: on the anterior
  surface of the **right lobe**, between the right portal and right hepatic veins, because the 2D app reads its one representative
  lobule from the right lobe (`LOBE = { pv: RPV, sin: SIN_R, cv: CV_R, hv: RHV, q: SIN_RR, a: A_HR }`, `lobule-model.js`).
- The dive: from `liver`, fly along `-normal` to `point`, keep closing in until the surface fills the frame, then hand over to the lobule
  view (which stands apart in the scene at its own scale, `docs/lobule-sinusoid.md` on the lobule branch). A real lobule is about 1 mm
  across (radius about 0.5 mm), so the lobule file's `LOBULE_R` = 3 scene units stands for 0.0005 m here: a scale jump of about 6,000x
  that the dive hides in the hand-over, not something to model continuously.
- The liver's mesh is even quads about 3 mm on a side (2.7 to 3.4 mm), fine enough for the stage 2 nodule relief and the `lobule_cv` and `septa`
  attributes; lobule-sized spots (1 mm) are smaller than a vertex, so the shader should draw them from the base (unmorphed) `position`
  in object space, which morph targets leave untouched, so the pattern stays fixed to the tissue as the liver changes shape.

## Ready for the stage 2 disease looks (not built yet)

- **Liver:** one closed mesh of even quads (QuadriFlow), so congestion (swelling), cirrhosis (shrunken right lobe, larger left and
  caudate, nodular relief, blunt edge) and caudate hypertrophy can each be a morph target on the same vertices. `_LOBE` already tells the
  three lobes apart for the caudate and the right/left shifts.
- **Spleen:** even quads (3,398 triangles); its long axis runs along the 10th rib from the upper pole (back, up, medial) to the lower pole
  (front, down, lateral), and the colon's splenic flexure sits below the lower pole with room down the left flank, so the 1.8x target can
  grow the tip down and forward. The infarct vertex group goes on these vertices.
- **Bowel and colon:** single meshes with free space around them toward the flanks and pelvis for the ascites morph to float them to
  the midline. `_SEGMENT` names the colon's parts.

## Rebuild

```
python -m venv .venv && .venv/bin/pip install -r art/anatomy/requirements.txt   # Python 3.13 for bpy 5.3
cd art/anatomy
../../.venv/bin/python check_layout.py      # organ overlaps and which vessels run inside which organ (about 2 min)
../../.venv/bin/python build_stage1.py      # writes the .blend, the .glb and vessels.json (about 6 min)
python3 check_stage1.py                     # names, budgets, joins and engine IDs (seconds, plain Python)
../../.venv/bin/python render_stage1.py OUTDIR   # review stills, Cycles on the CPU (about 1 min)
```

The shapes are signed distance fields (`anatomy.py`: landmarks, vessel courses, organs and the impressions they make on each other),
meshed by marching cubes, then re-meshed into even quads by Blender's QuadriFlow (the small bowel, whose many loops QuadriFlow refuses,
gets Blender's voxel quads at the same budget) and relaxed.
