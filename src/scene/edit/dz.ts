// The depth the edit mode adds to a vessel's tier (frame2d.ts TIER_Z), in scene units. Empty unless Edit shapes is on and a vessel was moved in depth: then every read of it is 0.
export const editDz = new Map<string, number>();
export const dzOf = (id: string): number => editDz.get(id) ?? 0;
