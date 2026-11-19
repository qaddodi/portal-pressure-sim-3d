// Platform words: the key a person presses is Ctrl on Windows and ⌘ on a Mac (the 2D app's keyLabel, platform-keys.js).
export const isMac = (): boolean => { try { return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent); } catch { return false; } };
export const keyLabel = (s: string, mac: boolean = isMac()): string => s.replace('Ctrl/⌘', mac ? '⌘' : 'Ctrl');
