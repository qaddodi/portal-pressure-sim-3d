// Where a portal vein's trace stops being "Phasic" and reads "Monophasic" (23 Nov 2026, TIPS Doppler review, item 15a).
// The 2D app cut at 0.15, below every patient the model makes, so a cirrhotic portal vein read "Phasic", the normal pattern (a trace that has lost its
// phasicity is the sign of a stiff liver). The index is the median whole beat's (max - min) / the larger extreme (doppler-marks.js pulsatility), the number the
// Doppler's calipers read. The model's own beats: a healthy portal vein 0.27, the compensated and decompensated cirrhotic 0.17 to 0.21, clinically significant
// portal hypertension 0.10, a periportal vein with no sinusoidal block 0.04 (tests/doppler-portal-phasic.test.ts runs them). 0.24 sits between them.
export const PORTAL_PHASIC_PI = 0.24;
