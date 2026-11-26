// The 14 decks A to G as the copy wrote them (nothing laid over them): one lazy loader each, so the app opens without carrying them. Read them through source.ts `loadSource`, which
// lays the 3D overlay on (decks/overlay.ts); a deck read from here is the 2D deck and nothing else.
import type { CopiedDeck } from './types.ts';

export const AG_IDS = ['albumin', 'ascites', 'budd-chiari', 'carvedilol', 'cause-treated', 'choose-treatment', 'circuit', 'circulation', 'day', 'doppler', 'encephalopathy', 'endoscopy', 'gastric-varices', 'gradients'] as const;
export type AgId = (typeof AG_IDS)[number];

export const AG_LOADERS: Record<AgId, () => Promise<CopiedDeck>> = {
  albumin: async () => (await import('./albumin.copied.ts')).ALBUMIN,
  ascites: async () => (await import('./ascites.copied.ts')).ASCITES,
  'budd-chiari': async () => (await import('./budd-chiari.copied.ts')).BUDD_CHIARI,
  carvedilol: async () => (await import('./carvedilol.copied.ts')).CARVEDILOL,
  'cause-treated': async () => (await import('./cause-treated.copied.ts')).CAUSE_TREATED,
  'choose-treatment': async () => (await import('./choose-treatment.copied.ts')).CHOOSE_TREATMENT,
  circuit: async () => (await import('./circuit.copied.ts')).CIRCUIT,
  circulation: async () => (await import('./circulation.copied.ts')).CIRCULATION,
  day: async () => (await import('./day.copied.ts')).DAY,
  doppler: async () => (await import('./doppler.copied.ts')).DOPPLER,
  encephalopathy: async () => (await import('./encephalopathy.copied.ts')).ENCEPHALOPATHY,
  endoscopy: async () => (await import('./endoscopy.copied.ts')).ENDOSCOPY,
  'gastric-varices': async () => (await import('./gastric-varices.copied.ts')).GASTRIC_VARICES,
  gradients: async () => (await import('./gradients.copied.ts')).GRADIENTS,
};

