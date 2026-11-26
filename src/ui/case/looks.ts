// The looks a bleed's stops offer by default (docs/approved/play-the-case.md; Mohammad, 26 Nov: "we have that endoscopically, yes do it", and for the gastric varix "we have the EUS glue animation"):
// where the bleed is decides which scope there is. An esophageal varix is seen from the esophagus (the Endoscopy card: the jet, the pool, the bands). A fundal varix is not: the esophageal scope
// shows a distal esophagus with no varix in it, so its stops look at the fundus on the figure and watch the EUS coils and glue that treat it (the figure's own EUS scope, under the fundus).
// Pure data: the stops read them (stops.ts), and a course may name them (courses.ts).
import type { CaseLook } from './types.ts';

/** The Endoscopy card: the esophageal varices and a bleed from them, as the scope sees them. */
export const SCOPE_LOOK: CaseLook = { tool: 'endoscopy', label: 'Endoscopy' };
/** The EUS-guided coils and cyanoacrylate glue, played on the figure (the IR card's Watch row, the slides' own animation). It changes nothing in the patient: the course has done it. */
export const GLUE_LOOK: CaseLook = { tool: 'hvpg', label: 'Watch EUS coils and glue', watch: 'eusglue' };

/** What a bleed stop says of the bleeding, by where it is (no word of the engine's). */
export const BLEED_SAY = {
  VAR: 'The varix has torn and is bleeding into the esophagus. Look closer shows it through the scope: the jet from the tear, and the blood pooling below it.',
  GV: 'A fundal varix has torn and is bleeding into the stomach. A band cannot close a varix this large: it is treated through the scope with EUS-guided coils and cyanoacrylate glue.',
} as const;
