// Reset everything: the 2D app clears the timeline, the comparisons and every change and reloads the simulator with a healthy patient; the preferences (look, Settings)
// are kept (main.js resetEverything). The 3D app keeps no timeline on the device, so the reset is the reload to the healthy patient, with no talk and no cache-busting.
export const resetUrl = (href: string): string => { const u = new URL(href); u.search = ''; u.hash = ''; u.searchParams.set('preset', 'healthy'); return u.href; };
export const resetEverything = () => location.replace(resetUrl(location.href));
