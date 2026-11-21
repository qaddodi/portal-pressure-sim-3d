// What a slide's cards write into shared state while they stand: the devices an instrument puts on the figure (the ultrasound probe, the FibroScan probe, the scope), the numbers it is pinned to,
// the buttons' patch, the HVPG card's Next/Back. A card that LEAVES stays mounted until its exit ends, which is after the card that came in has mounted and written its own. Each card used to clear
// what it had written when it unmounted, so on a slide whose instrument is the same kind as the one before (Doppler 2 of 3, then the hepatic vein's) the old card's cleanup, running last, took the new
// slide's probe off the figure again (owner, 21 Nov, iPhone: "No US probe" on "Hepatic vein flow is phasic"). The rule: the card that claimed last owns the state; a claim's release clears only while it is
// still the latest of its kind, so a leaving card never undoes the one that arrived.
import { useProbes } from '../../scene/devices/probes/state.ts';

const latest = new Map<string, number>();
let n = 0;

/** Claims `kind` of the slide state for the card that calls it. The returned release runs `clear` only if no later card has claimed that kind since (it is a no-op for a card that has been replaced). */
export function claimSlide(kind: string, clear: () => void): () => void {
  const me = ++n;
  latest.set(kind, me);
  return () => { if (latest.get(kind) === me) { latest.delete(kind); clear(); } };
}

/** The instrument devices a slide's data card asks the figure for (bind-tests.ts keeps them on whatever the Tests card does). Returns the release for the card's effect. */
export function holdSlideDevices(on: { doppler: boolean; fibro: boolean; endoscope: boolean; points: boolean }): () => void {
  const p = useProbes.getState();
  p.setSlide({ doppler: on.doppler, fibro: on.fibro, endoscope: on.endoscope }); p.setDopplerPoints(on.points);
  return claimSlide('devices', () => { const q = useProbes.getState(); q.setSlide({ doppler: false, fibro: false, endoscope: false }); q.setDopplerPoints(false); });
}
