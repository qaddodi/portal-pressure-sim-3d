// The app's code has arrived and begun to run: the first import of main.tsx, so it is the first thing that runs of it. index.html's cover reads `ppsBootStarted`: before it, a wait is a wait for BYTES
// (so "nothing new arrived for 8 s" is a fair thing to say); after it, what the cover waits on is the app itself (its engine, fonts, scene and first frame, seconds of CPU on a phone with no file
// arriving), and "Still loading… a slow connection" would be untrue (the iPhone on good Wi-Fi, 22 Nov).
Object.assign(window, { ppsBootStarted: true });
