# Add-ons, app updates, video mode and desktop polish

Owner feedback of 2026-11-22, settled in a grilling session. ADR 0020 records the add-on
decision; GLOSSARY.md defines **Add-on**, **Download**, **Video mode** and the add-ons step of
**First-run setup**. Mockups are still to come for the three new screens: the desktop loading
screen, the Add-ons page in Settings and the add-ons step of first-run setup.

## Problem Statement

The desktop installers are about 1 GB (1.08 GB AppImage, 940 MB Windows installer), because
they carry Python, Manim, TinyTeX, the video browser and the offline Python packages. A learner
who only wants to chat downloads all of it. Once installed, the app never learns about a newer
build: the learner has to find the release page and reinstall by hand. Opening the desktop app
shows "Starting Rabbithole…" as plain text on white, which looks like a broken build. Every
video pays for cut audits and piece improvements, and a learner who would rather save tokens
cannot turn them off. In Settings, switching between pages makes the scroll jump down and
stutter even when the learner was at the top.

## Solution

The installer carries only what chatting needs. Video tools, offline Python and web search are
add-ons. The learner can pick them in a last, skippable step of first-run setup, or later on a
new Add-ons page in Settings that shows each add-on's state and the sandbox status. A video asked
for without video tools still gets made and waits with an Install button. Installed add-ons
update themselves when a new app version needs newer ones.

The desktop app checks for a newer published release on launch and offers it in a banner. One
click downloads it, and another restarts into it.

While the server starts, the desktop app shows a branded loading screen with an animation.

A Video mode setting offers Quality (the default) or Saving. Saving skips the steps a playable
video does not need.

Switching Settings pages no longer moves the scroll.

## User Stories

### Smaller installer and add-ons

1. As a learner, I want the desktop installer to be a few hundred MB, not about 1 GB, so that trying Rabbithole is quick on a slow connection.
2. As a learner who only chats, I want the base app to work fully without any add-on, so that I never download tools I do not use.
3. As a learner on first launch, I want a last setup step that lists every add-on with what it enables and its size, so that I can decide what to install before I need it.
4. As a learner on first launch, I want to install add-ons one by one or all at once, so that I can get everything in one click or only what I want.
5. As a learner on first launch, I want to skip the add-ons step, so that I can start chatting at once.
6. As a learner who skipped add-ons, I want the step to tell me they are in Settings under Add-ons, so that I know where to find them later.
7. As a learner, I want add-on downloads to run in the background while I chat, so that installing never blocks me.
8. As a learner, I want an Add-ons page in Settings that lists video tools, offline Python and web search with their state (Installed, Not installed, Downloading with percent, Updating, Failed), so that I can see at a glance what works.
9. As a learner, I want Install and Retry buttons on the Add-ons page, so that I can fix a missing or failed add-on myself.
10. As a learner, I want the Add-ons page to say that video tools need offline Python, so that I am not surprised when installing video tools also installs offline Python.
11. As a learner, I want the Add-ons page to show whether the code sandbox is ready (bwrap on Linux, the Windows sandbox on Windows), so that I know why the tutor's code may not run.
12. As a learner, I want running, failed and newly finished add-on downloads to keep showing in the sidebar, so that I see progress wherever I am.
13. As a learner who asks for a video without video tools, I want the tutor to still make the video and its card to wait with an Install button and the download size, so that I see what I would get and can install it in place.
14. As a learner who installs video tools from a waiting video card, I want that video to render once the tools are ready, so that nothing I asked for is lost.
15. As a learner, I want an installed add-on to update itself after an app update needs a newer version, so that my videos keep working without me doing anything.
16. As a learner, I want add-ons I never installed to stay uninstalled after an app update, so that an update never downloads tools I did not choose.
17. As a learner, I want add-ons to install into my data folder, so that the app's own folder stays untouched and an app update never deletes them.
18. As a Linux learner, I want video tools to install without a compiler or development packages, so that installing them works on an ordinary desktop.
19. As a Windows learner, I want video tools to install the same way, so that both platforms behave alike.
20. As a learner whose add-on download fails, I want a short reason and Retry, so that a flaky connection does not leave me stuck.
21. As the owner running `npm start`, I want the same add-on rule and setup code as the desktop app, so that what I test is what learners get.
22. As the owner, I want my existing project-folder tools to count as installed, so that nothing re-downloads on my machine.

### App updates

23. As a learner, I want the desktop app to check for a newer release on launch, so that I learn about fixes without visiting GitHub.
24. As a learner, I want a banner saying "Rabbithole X.Y.Z is available" with an Install button, so that I decide when to update.
25. As a learner, I want nothing to download until I click Install, so that an update never uses my bandwidth unasked.
26. As a learner, I want to see the update's download progress, so that I know it is working.
27. As a learner, I want the app to restart into the new version with one more click once the update is downloaded, so that updating takes no reinstall.
28. As a learner, I want my pending map layout saved before the restart, so that updating never loses my work.
29. As a learner, I want a failed update check or download to stay quiet or show a short reason with Retry, so that being offline never breaks the app.
30. As the owner, I want only releases I publish to reach learners, never drafts, so that I control when an update goes out.
31. As the owner, I want each desktop build to stamp its own version, so that I never bump a version by hand and the updater always sees a newer number.
32. As a learner using the README's download links, I want the fixed installer names to keep working, so that old links still download the latest build.

### Loading screen

33. As a learner opening the desktop app, I want a loading screen with the Rabbithole logo and a looping animation, so that the app looks alive while its server starts.
34. As a learner, I want the loading screen to follow my system's light or dark theme, so that it does not flash white on a dark desktop.
35. As a learner whose server fails to start, I want the loading screen to still show the error text, so that I can report what went wrong.
36. As a learner who prefers reduced motion, I want the animation calmed or stilled, so that the screen respects my system setting.

### Video mode

37. As a learner, I want a Video mode setting with Quality and Saving, so that I can trade video polish for fewer tokens.
38. As a learner, I want Quality to be the default, so that videos keep today's quality unless I choose otherwise.
39. As a learner, I want Video mode on the Models page next to the smart model, so that I find it where video models are set.
40. As a learner in Saving mode, I want videos made without cut audits and their fixes, so that the smart model is not called for each cut.
41. As a learner in Saving mode, I want no piece improvements, so that saving a video does not also pay to redraw library pieces.
42. As a learner in Saving mode, I want no reference photos fetched or shown to the set piece writer, so that those image tokens are not spent.
43. As a learner in Saving mode, I want a cut that fails to render to still be repaired, so that I still get a playable video.
44. As a learner, I want exhibits to stay in both modes, so that real images and clips still appear.
45. As a learner, I want a video to use the mode set when it starts, including a Retry, so that changing the setting is predictable.
46. As a learner, I want videos already made to keep how they were made, so that switching modes never changes my library.

### Settings scroll

47. As a learner, I want switching Settings pages to leave the scroll where it is, so that the page never jumps or stutters.
48. As a keyboard or screen reader learner, I want focus to still move to the new page's heading without scrolling, so that I know which page I am on.
49. As a learner, I want opening Settings at a specific section (for example from a link elsewhere in the app) to still bring that section into view, so that deep links keep working.

## Implementation Decisions

### Add-ons

- The installer stages only the pinned Node, the built app with its production dependencies and, on Windows, the sandbox launcher and its helpers. The stage stops installing uv, LaTeX, Python, Manim, yt-dlp, the offline Python packages and the video browser. Its check for missing bundled tools is removed, and the foreign-binary check stays.
- The desktop shell points the tool root at a `tools` folder inside the data folder instead of its own resources. Under `npm start` the tool root stays the project folder, so the owner's installed tools count as ready.
- The download manager's tool list is grouped into three add-ons with stable ids and names: video tools (uv, LaTeX, Manim with clips, the video browser), offline Python and web search. Each add-on reports the existing per-tool states as one add-on state plus percent. Video tools depend on offline Python: installing video tools queues offline Python first.
- Every add-on is on request, as web search already is. Nothing queues automatically after first-run setup. An add-on counts as requested once the learner installs it. That choice is remembered in the data folder, so after an app update it is checked again and queued for update when its pinned version no longer matches. An add-on never requested is never checked or queued.
- The downloads API gains an add-on listing for the Add-ons page and the first-run step: id, name, what it enables, approximate download size, dependency, state and percent. It also gains install and retry by add-on id. The existing download stream to the sidebar stays.
- Sources follow ADR 0020. Python comes through uv as a standalone build, packages come from PyPI, TinyTeX from its official release and the video browser through Remotion, every version pinned as the setup scripts already do. On Linux, Manim's install points uv at the project's own manylinux wheels of pycairo and manimpango with `--find-links`, so nothing compiles. On Windows, PyPI's wheels are used. The Linux Cairo and Pango development-package check no longer applies to the desktop.
- A new manually triggered workflow builds manylinux wheels of pycairo and manimpango for the pinned versions with `auditwheel` and attaches them to a fixed GitHub release. The setup scripts pin those wheels' URLs and SHA-256 hashes.
- A video asked for while video tools are not installed is still created and planned as today. Its card shows "Video tools aren't installed" with an Install button and the size instead of the existing "still downloading" reason, and it renders when the tools become ready. The existing "Video tools are still downloading (n%)" state stays for an install in progress.
- The Add-ons page is a new Settings page beside Interface, Models, Connections and Usage. It reuses the existing sandbox status from the sandbox settings component as its last row. There is no Remove action.
- First-run setup gains a last step after the provider and chat model steps. It lists the same add-ons with Install per row, Install all and Skip, and a note that the Add-ons page in Settings has them any time. Leaving the step never waits for downloads.

### App updates

- The desktop shell uses `electron-updater` with the GitHub provider against this repository's published releases. It checks once on launch, without auto-download or auto-install-on-quit. A newer version becomes an in-app banner through a small bridge from the shell to the page. Install starts the download and reports progress. When the update is downloaded, the banner offers Restart, which first runs the existing pending-layout save, then quits and installs.
- The update decision (no update, available, downloading with percent, ready, failed with reason) is a plain function or state machine in the shell module, beside the existing navigation and start-error helpers.
- The desktop build workflow stamps the app version as `1.0.<run_number>` before building, tags the release `v1.0.<run_number>` and uploads the updater's metadata files and blockmaps with the installers. Installer artifact names are set to the fixed README names directly, so the metadata and the files agree. Releases stay drafts until the owner publishes them; the updater only sees published ones.
- Builds stay unsigned. The Windows updater skips publisher verification when there is no signature.

### Loading screen

- The desktop shell's starting page becomes a self-contained branded page: the logo, a looping CSS animation honouring `prefers-reduced-motion` and colours from the house light and dark themes through `prefers-color-scheme`. It shows no real progress, and the server stays unchanged. The page keeps the element the shell writes start errors into, and errors keep showing as preformatted text. The visual follows the owner's mockup.

### Video mode

- A new app-wide setting, `videoMode`, with values `quality` (default) and `saving`, is stored with the other server settings and edited on the Models page next to the smart model.
- When a video job starts, the pipeline reads the mode once and passes it to its steps. In Saving mode the pipeline skips the cut audit and its fix for every cut, starts no piece improvement and fetches no reference photos. It keeps the plan, exhibits, set pieces (reused from the piece library when one matches), cut writing and narration. It also keeps the repair of a cut that fails to render, limited to that failure. A Retry reads the mode at the time of the Retry.

### Settings scroll

- Switching pages from the Settings nav no longer scrolls the section heading into view. It moves focus to the heading with scrolling prevented. A Settings request that names a section or control still scrolls to it, as today.

## Testing Decisions

- Test behaviour a learner or caller notices, through the highest existing seam, never by grepping source or snapshotting markup (`docs/agents/testing.md`, "Banned tests").
- **Video mode**: extend the pipeline test that drives `generateVideo` with one fake model call and engine (`test/media/video-pipeline.test.mjs`). In Saving mode it asserts that no audit, fix, piece improvement or reference photo call happens, that a broken cut is still repaired and that the video is saved. Quality keeps today's sequence. The setting's default and validation join the existing settings route tests.
- **Add-ons**: extend `test/media/downloads.test.mjs` for add-on grouping, on-request only (nothing queued at start), the dependency order (video tools queue offline Python first), and the update of a requested add-on whose version no longer matches. Setup-script argument tests (`test/scripts/tools-setup.test.mjs`, `test/scripts/manim.test.mjs`) cover the Linux `--find-links` wheel source and the tool root in the data folder. `test/scripts/desktop-stage.test.mjs` covers that the stage holds no tools.
- **Add-ons UI**: component tests for the Add-ons page (states, Install, Retry, dependency note, sandbox row) and for the first-run step in `test/shell/first-run.test.mjs` (Install all, per-row Install, Skip with its note). A video card test covers the Install prompt when video tools are missing.
- **App updates**: unit tests for the shell's update decision in `test/desktop/shell.test.mjs`, and a component test for the banner's states. The workflow tests in `test/scripts/desktop-workflow.test.mjs` cover version stamping, updater metadata uploaded with the installers, fixed artifact names and the wheels workflow's manual trigger.
- **Settings scroll**: a component test that switching pages does not call `scrollIntoView` and moves focus to the new heading, while a Settings request still reveals its section.
- **Loading screen**: no automated test; it is static markup. The existing start-error helper tests stay.

## Out of Scope

- Removing an installed add-on.
- Health checks beyond add-ons and the sandbox, such as provider connection, which the Connections page already shows.
- Real startup progress from the server.
- Automatic background update downloads or install on quit.
- Code signing.
- A Saving mode for chat replies or visuals; only videos have a mode.
- Integration tests in CI and a docs audit, both dropped in the session.
- macOS.

## Further Notes

- Each new screen ticket (loading screen, Add-ons page, first-run add-ons step) needs a mockup at `docs/mockups/<issue-id>.html` or `.png`, the `new-ui` label and a `Mockup:` line.
- Open risks: unsigned Windows updates may trigger a SmartScreen prompt, and AppImage self-update needs the AppImage file to be writable. Manylinux wheels built against an old glibc should be checked on a current distro when the wheels workflow first runs.
- To see the fresh-install flow without touching real data, run `RABBITHOLE_DATA_DIR=<empty folder> npm run serve`, or launch the AppImage with the same variable.
