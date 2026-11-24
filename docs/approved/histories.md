# Approved: the Histories tab (model patients with a treated history)

**Reference:** `/mnt/project-files/model-patients-mocks/` (tab names `0-tab-names.png`; the menu `1-menu-*`; a row folded open `2-menu-preview-iphone-light.png`; a patient opened `3-open-*`; the chart `4-chart-*`; generator `gen.mjs.txt`). Mohammad picked **1B** on 23 Nov: the tab is named **Histories**, and each row folds open to a small course with "Open patient" and "Open as a chart" (look B).

## Traits
- A third tab beside Present and Patients, named **Histories**, with a clock icon. Same menu, same sheet or popover, same search field ("Find a presentation, patient or history"). A sideways swipe and the arrow keys go round the three lists.
- Rows are grouped like Patients: a group name and where it sits ("After a bleed · Varices and banding"). A row is two lines: the name, and under it the patient **as they are today** in the model's own numbers ("TIPS 8 mm, PPG 10.3"; a gradient over 12 says "high" in the danger ink). At the right, how long the course ran ("4 months in"), then the ⓘ.
- The ⓘ folds the card open under the row (a mouse resting on a row shows it beside the panel): the group line, the name in the serif title, "Portal vein pressure over N months (0 to M mmHg)", the little course (the pressure line with the steps of the course in words above it, each on its own line), a sentence of what happened with the real day numbers, and two buttons: **Open patient** (primary) and **Open as a chart** (plain).
- **Open patient**: the model is at the end of the course, the figure shows the patient as they are today (a TIPS in place, a clot half gone), and History holds the whole course: the start, the model's own events, the learner-style changes (carvedilol, terlipressin, a band, a tap with albumin, a TIPS), and a last line "Day N, today" that Undo can come back to. **Open as a chart** does the same and then opens the timeline chart ("Over time"): the pressures, HVPG, ascites, shunt, the medicine bars and the procedure lines for the whole history.
- No pill with a dot, no chips, no badges. Everything eases (the row's state does not pop; the card folds). Plain words for US physicians; Baveno VIII is the only guideline that may be named on screen.

## The five patients (each played on the real engine; every number, event and day is the model's)
1. Cirrhosis, first bleed: carvedilol once portal hypertension is clinically significant; a bleed on it; a vasoactive drug and a band the same day; a pre-emptive TIPS within 72 hours; PPG under 12 after.
2. Refractory ascites: on diuretics, three large taps with albumin as the fluid comes back, then a TIPS.
3. Acute portal vein thrombosis: anticoagulation at once; the clot clears under it and the gradient comes down.
4. Budd-Chiari syndrome: anticoagulation, then an angioplasty of a hepatic vein; the ascites clears and no TIPS is needed.
5. A TIPS that has narrowed: a TIPS for ascites, then months of stenosis; the gradient is over 12 again, the fluid is back, and Doppler picks it up.

## Seven more (24 Nov, not yet seen by him: built on his word "do like 7 of those that the model supports")
6. Bleed, TIPS in 24 hours (Child-Pugh B, active bleeding at endoscopy). 7. Hepatitis C cured, pressure persists (carvedilol, DAA, SVR12, HVPG still 10 or more). 8. Alcohol cirrhosis, recompensated (abstinence, carvedilol, diuretics off, a year on). 9. PSVD: a bleed with a normal HVPG. 10. Gastric varix bleed, BRTO (esophageal varices after it). 11. Cirrhosis in pregnancy (propranolol and bands in the second trimester). 12. Cardiac cirrhosis (HVPG normal, wedged pressure high, tricuspid repair).
Not built from the 12 proposed (the model cannot yet): MASH on a GLP-1, ACLF, JAK2 PVT, a Budd-Chiari TIPS history. See the thread's list of what the model would need.

## How it is built (so it stays true)
- `src/ui/histories/courses.ts` is the script, `play.ts` plays it on the engine (the same Treat words, History words and day record as the page makes), `scripts/gen-histories.mjs` bakes it to `baked/*.generated.ts` and `index.generated.ts`. `tests/histories.test.ts` fails when a course or the engine changes and the files were not baked again, and holds each history to Baveno VIII's order.
- A course with `still: true` takes its daily look at the model with the breath and pulse held still. Live steps moved the fluid by litres over months (a cirr-comp patient with no drug and no change formed 9 L of ascites in 540 days), so any course where the fluid must follow only the disease and the treatments sets it. The first five do not: their fluid coming back is that drift.
- The days record is the patient's: only a replaced state (a new patient, a restore) empties it, never an action or a change of clock (`tests/histories-open.test.ts`).

## Rejected
- The mock's placeholder numbers (a bleed on Day 63, a TIPS widened to 10 mm): the real course comes out of the engine. A histories row without the patient's state under its name. A scrolling card.

## Never
- Type a number, an event or a day into a history by hand; change a course without baking again; name AASLD or EASL on screen.
