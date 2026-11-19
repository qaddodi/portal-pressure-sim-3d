// The patients "Work backward from readings" made ("Yours", engine/hales/portal/yours.js): their ids are not in the generated preset list, so the name the shell shows for one comes from here
// (set when the scenario is opened as a patient). 2D keeps them in the engine's preset list; the 3D menu's list is generated, so this is the one place that knows them.
const labels = new Map<string, string>();
export const noteYours = (id: string, label: string): void => { labels.set(id, label); };
export const yoursLabelOf = (id: string | null): string | undefined => (id ? labels.get(id) : undefined);
export const isYours = (id: string): boolean => labels.has(id);
