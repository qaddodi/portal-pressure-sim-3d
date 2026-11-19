import { useCallback, useLayoutEffect, useState } from 'react';
import { reconcile, drop, type Entry, type Wanted } from './stack.ts';

/** The entries of one slot: follow `wanted` before paint (the old card is marked leaving in the same commit the new one mounts in). */
export function useStack(wanted: Wanted | null): { entries: Entry[]; gone: (key: string) => void } {
  const [entries, setEntries] = useState<Entry[]>([]);
  const key = wanted ? wanted.key : '';
  const id = wanted ? wanted.id : null;
  useLayoutEffect(() => { setEntries((e) => reconcile(e, key && id ? { key, id } : null)); }, [key, id]);
  const gone = useCallback((k: string) => setEntries((e) => drop(e, k)), []);
  return { entries, gone };
}
