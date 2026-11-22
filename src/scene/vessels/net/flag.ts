// `?geom=net` (WP4): the vessels drawn from the skeleton's network meshes (net/network-object.ts) instead of the tubes and skins. Off by default: with no flag the scene builds and draws exactly what it did before, and no byte of net/ is fetched or run.
// The page flag is read once through the debug flag table (ui/debug/flags.ts: gate 'local', so the preview copy and a local run only, never the live site).
import { flagValue } from '../../../ui/debug/flags.ts';

/** Whether the address asks for the network vessels. A test passes its own search string. */
export const geomNet = (search?: string): boolean => flagValue('geom', search ?? undefined) === 'net';
