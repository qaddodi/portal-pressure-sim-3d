// Deep links, for a syllabus or a class page, as the 2D app reads them (main.js openDeepLink):
//   ?script=<id> (&slide=<n>)   opens that talk at that slide (the first when absent)
//   ?preset=<id>                opens that patient in free play
//   ?home=explore|present       opens the menu, at Patients or at Present
// `script` wins over `preset`, which wins over `home`. A mistyped link never opens a different patient: it says so and opens Patients, searching for the link's first word.
export interface DeepLink { script?: { id: string; slide: number }; preset?: string; home?: 'present' | 'patients' }

export function parseDeepLink(search: string): DeepLink {
  const q = new URLSearchParams(search);
  const get = (k: string) => q.get(k) || null;
  const script = get('script');
  if (script) return { script: { id: script, slide: Math.max(0, (parseInt(get('slide') ?? '', 10) || 1) - 1) } };
  const preset = get('preset');
  if (preset) return { preset };
  const home = get('home');
  if (home) return { home: home === 'present' ? 'present' : 'patients' };
  return {};
}

/** The first word of a mistyped id, the search the Patients list opens with (at most 40 characters). */
export const queryFromId = (id: string): string => id.split(/[-_\s]/).find(Boolean)?.slice(0, 40) || '';
