// Words the 3D shell says that are not in the 2D inventory's tables, each with its source. Two kinds: the 2D app's own toasts and notes (copied from the file and
// function named beside them; tests/shell-words.test.ts keeps them against the 2D source when PPS_2D_REPO points at a checkout), and the 3D app's own few
// lines (the view or feature that is not in the 3D app yet). No clinical wording here.

/** 2D: src/ui/main.js openDeepLink */
export const noPatientCalled = (id: string) => `No patient called “${id.slice(0, 60)}”. Pick one from Patients.`;
/** 2D: src/ui/main.js settle() */
export const SETTLED = 'Settled to equilibrium.';
/** 2D: src/ui/keyboard.js ([ and ]) */
export const speedToast = (lapse: boolean, long: string, v: number) => (lapse ? `Time-lapse ${long}` : `Speed ${v}×`);
/** 2D: src/ui/keyboard.js (L) */
export const lensToast = (name: string, note: string) => `Colored by ${name.charAt(0).toLowerCase()}${name.slice(1)}. ${note}.`;
/** 2D: src/ui/palette.js */
export const noMatch = (q: string) => (q ? `Nothing matches “${q}”.` : 'No commands yet.');
export const NO_MATCH_HELP = 'Try a vessel (“portal vein”), a patient, a presentation or a treatment (“tips 8”).';
/** 2D: src/ui/main.js fullscreenControl() */
export const FULLSCREEN = { enter: 'Enter full screen', exit: 'Exit full screen', hint: 'Hide the browser bars (Esc leaves)', iphone: 'For full screen on iPhone: Share › Add to Home Screen.' } as const;
/** 2D: src/ui/main.js resetEverything() */
export const RESET = { title: 'Reset everything?', body: 'This clears the timeline, comparisons and every change, and reloads the simulator with a healthy patient. Your preferences are kept.', cancel: 'Cancel', go: 'Reset and reload' } as const;

// ---- the 3D app's own lines -------------------------------------------------------------------------------------------------
/** A view or feature the 3D app does not have yet (the control is there, as in the 2D app; it says so when tapped). */
export const notYet = (what: string) => `${what} is not in the 3D app yet.`;
export const NO_WEBGL = { title: 'The 3D app needs WebGL 2', body: 'This browser cannot draw it. The 2D simulator works here.', link: 'Open the 2D simulator', href: 'https://qaddodi.github.io/portal-pressure-simulator/' } as const;
/** The engine could not start (src/main.tsx, BootCrash.tsx). 2D says "The model stopped. Reload, or restart this patient." once it runs; at start there is no patient to restart. */
/** Figure menu > Image: the figure as a picture (figure-image-dom.ts). */
export const FIGURE_IMAGE = { section: 'Image', copy: 'Copy figure', copyHint: 'As a picture, with its labels', save: 'Save figure', saveHint: 'A PNG file', copied: 'Figure copied', saved: 'Figure saved', failed: 'The figure could not be made into a picture' } as const;
export const BOOT_CRASH = { title: 'The simulation could not start', body: 'Its engine did not load. Reload to try again.', reload: 'Reload' } as const;
/** The app-level safety net (AppBoundary.tsx): a render error outside a card never blanks the app. */
export const APP_CRASH = {
  title: 'Something went wrong', body: 'The simulator hit an unexpected error. Reload to pick up where you were.',
  figureTitle: 'The 3D figure stopped', figureBody: 'The controls still work. Reload to bring the figure back where you were.',
  engineTitle: 'The simulation stopped', engineBody: 'The figure no longer follows the patient. Reload to pick up where you were.',
  reload: 'Reload', copy: 'Copy details', copied: 'Copied', twoD: 'Open the 2D simulator',
} as const;
/** The figure's graphics context was lost after the first picture (scene/context-loss.ts, ContextNote.tsx). */
export const GL_LOSS = { redrawing: 'Redrawing the figure…', stuck: 'The figure could not be redrawn.', reload: 'Reload' } as const;
/** The quiet note when the app is left broken by errors no boundary sees (ErrorNote.tsx, boot/crash-net.ts). */
export const ERROR_NOTE = { text: 'Something went wrong behind the scenes.', reload: 'Reload', copy: 'Copy details', copied: 'Copied', keep: 'Keep going' } as const;
/** Settings › Blur effect in the 3D app today */
export const FIGURE_DETAIL_TITLE = 'Figure detail';

/** 2D: src/ui/timeline.js (titles of the play bar's controls) */
export const PLAY_TITLES = {
  playPause: 'Play / pause (Space)', speed: 'Playback speed', ffwd: 'Fast forward', restart: 'Restart this patient',
  history: 'History: every change and event, with a way back to each', compare: 'Freeze this moment and compare the live model with it (P)', stopCompare: 'Stop comparing',
} as const;
/** 2D: src/ui/main.js ZOOM_TITLES (the sinusoid reads other words) */
export const ZOOM_TITLES = { in: 'Zoom in (or scroll / pinch)', out: 'Zoom out', fit: 'Fit the figure to the view (0)' } as const;

/** Flow marks A to D (the owner picks one after trying them; the scene reads the setting). 3D only. */
export const PATIENT_FAILED = 'That patient did not load.';
/** 2D: src/ui/main.js sendFeedback() */
export const FEEDBACK = { subject: 'Portal Pressure Simulator feedback', ask: 'What happened, and what did you expect to happen?', keep: 'Please keep these details:' } as const;

/** The corner credit of the 2D page (index.html, `.stage-credit`). */
export const CREDIT = '© 2026 Mohammad Almeqdadi, MD';
