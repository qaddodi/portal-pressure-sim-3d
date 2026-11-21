# Device checklist (Mohammad runs it; one pinned build, one device at a time)

Open `/preview/build-info.txt` first and note the commit; use that build for every step. Paste results into the thread: `Device, iOS/macOS version, commit, step, what you saw`.

1. **Shaders.** Open `/preview/?gl` on iPhone, iPad and Mac. Expect 0 refused programs. Tap Copy and paste it.
2. **Stalls.** `/preview/?audit=here` on the iPhone and the iPad (bare `?audit` on the Mac), Full, Speed 1x. Expect 0 stalls (your rule). Copy JSON and paste it. Frame rates count only at 1x.
3. **Cold start.** Close the app, switch to cellular, open `/preview/`. Note how long until the figure is drawn (a stopwatch is enough). Then add it to the Home Screen.
4. **Offline.** After the figure has been up for about a minute (the rest is filled when the page is quiet), turn on airplane mode and open it from the Home Screen icon. Expect the figure and the talks; the Lobule's tubes may have round ends if you never opened it online (its weld file loads after the first picture).
5. **Background.** Start a talk, send the app to the background for 5 minutes, come back. Expect the same slide and a drawn figure. (Mid-session context loss is not handled yet: if the figure is black or frozen, say so; that is the finding.)
6. **Version.** Settings > Help > About shows "Version 1.0.0-beta.1 · build <commit>". If the feedback address is set (`FEEDBACK_EMAIL`): Settings > Send feedback opens a draft whose `Build:` line carries the version.
7. **Old links.** Open a talk link from a lecture slide or an earlier share link you saved. Expect the same talk and slide.
8. **Debug tools on /preview/.** `?audit`, `?inspect`, `?joins=debug` and `?dust` still open. (Not on the live site: when `/` becomes the app, `?inspect` must do nothing there.)
9. **Look.** Glance at Settings, one talk and the Tests card on `/preview/` (the stylesheet lost about 95 kB of rules for classes the app never makes: nothing should look different).
10. **VoiceOver.** Open a talk, step 3 slides, open one instrument. Say what is not announced.
