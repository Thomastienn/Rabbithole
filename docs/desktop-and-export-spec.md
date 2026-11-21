# Desktop app, first-run setup and video export

Decided with the project owner on 2026-11-17 (grilling session). Terms follow `GLOSSARY.md`; **export**, **first-run setup** and **download** were added in this session. Decisions are recorded in [ADR 0011](adr/0011-tauri-desktop-for-linux-and-windows.md) (desktop app) and [ADR 0012](adr/0012-export-videos-on-demand.md) (export on demand, amending ADR 0001). Delivered in order: A export, B first-run setup and downloads, C desktop app. Everything not named here keeps its current behaviour.

## Problem Statement

Rabbithole runs only from a terminal with `npm start`. Setting it up means installing Node, uv, Cairo/Pango headers, a full LaTeX distribution and a provider CLI by hand, so the owner cannot hand it to someone for a quick demo, and a less technical learner cannot start at all.

A fresh install opens straight into the app with nothing chosen. The learner has to discover Settings, sign in somewhere and pick models before anything works.

Every finished video renders a full MP4 in the background, even though it already plays live. That render takes minutes and most of the machine for a file the learner rarely needs.

## Solution

- **Export on demand.** A finished video is saved as its playable cuts and plays live everywhere, including the video library. An icon at the top right of the player exports it: the MP4 renders with progress on the button, then saves through a save dialog. The exported MP4 is kept, so exporting again is instant.
- **First-run setup.** A fresh install opens on a short screen: sign in to Claude or Codex, confirm the chat model, done. The video tools download in the background afterwards.
- **Downloads.** A Downloads icon in the sidebar and sidebar rail shows tool downloads while they run, fail or have just finished.
- **Desktop app.** A one-click Tauri app for Linux (AppImage) and Windows, wrapping the existing Node server, with model-written code sandboxed on both.
- **Narration stays Edge TTS.** It already runs online with nothing to download.

## User Stories

### Export

1. As a learner, I want a finished video to play at once without waiting for a file to render, so that I can watch it as soon as it is made.
2. As a learner, I want saved videos in the video library to play live too, so that the library works without any MP4.
3. As a learner, I want an export icon at the top right of the player, so that I can save the video as an MP4 when I need a file.
4. As a learner, I want export progress shown on the icon, so that I know how long the render will take.
5. As a learner, I want a save dialog when the export finishes, so that I choose where the file goes.
6. As a learner, I want a second export of the same video to be instant, so that I never wait for the same render twice.
7. As a learner, I want "Show in folder" only on exported videos, so that the action never points at a file that does not exist.
8. As a learner with videos saved before this change, I want them treated as already exported, so that nothing I had is lost or re-rendered.
9. As a learner, I want an unexported video to stay in the video library after its learning tree is deleted, so that the library still keeps every video until I trash it.
10. As a learner, I want a failed export to show its error with Retry, so that the video itself stays playable and I can try again.

### First-run setup

11. As a new learner, I want the app to open on first-run setup, so that I know the one or two steps before I can ask.
12. As a new learner, I want setup to find Claude Code or Codex if I already installed them, even where my desktop's PATH misses them, so that I am not told to install what I have.
13. As a new learner without either CLI, I want a link to each official installer and a "Check again" button, so that I can install one and continue without restarting.
14. As a new learner, I want setup to run the provider's own browser sign-in, so that I sign in with my Claude or ChatGPT account and no API key.
15. As a new learner, I want the chat model prefilled, with the smart and quick thinking models following it, so that confirming is one click.
16. As a new learner on Linux, I want one copy-paste install line when `bwrap` or the Cairo/Pango build packages are missing, with "Check again", so that video making can work.
17. As a new learner on Windows, I want one admin prompt that enables the sandbox, and an explanation if I decline, so that I know video making stays off until I allow it.
18. As a new learner, I want setup to finish without waiting for the video tools, so that I can start chatting at once.
19. As a learner, I want first-run setup shown only once, so that later changes happen in Settings as before.
20. As an existing learner, I want no first-run setup after upgrading, so that my saved choices are untouched.

### Downloads

21. As a learner, I want the video tools downloaded for me in the background, so that I never install Python, Manim or LaTeX by hand.
22. As a learner, I want a Downloads icon with a progress ring while anything downloads, so that I know the app is fetching something.
23. As a learner, I want the Downloads list to show each tool's name, size and progress, so that I see what is left.
24. As a learner, I want a failed download to show Retry, so that a network hiccup does not leave video making broken.
25. As a learner, I want a finished download shown as Ready until I open the list once, so that I notice when video tools become available.
26. As a learner, I want the Downloads icon hidden when there is nothing to show, so that it does not clutter the sidebar.
27. As a learner, I want an interrupted download to restart on the next launch, so that closing the app never leaves a tool half-installed.
28. As a learner who asks for a video before the tools are ready, I want "Video tools are still downloading (n%)", so that I know why it cannot start yet.
29. As a learner adding a custom endpoint, I want to be offered the web search download, so that the tutor can search the web when my endpoint has no search of its own.

### Desktop app

30. As someone trying Rabbithole, I want one installer for Linux or Windows that runs with no terminal, so that a demo takes a download and a click.
31. As a learner on the desktop app, I want the same app as `npm start`, so that features and saved data behave the same.
32. As a learner, I want model-written code sandboxed on Windows as it is on Linux, so that generated code cannot read my files or reach the network.
33. As a Windows learner, I want to know that SmartScreen will warn about an unsigned installer and that "More info → Run anyway" is expected, so that I am not alarmed.

## Implementation Decisions

### A. Export

- **Saved video.** `finishVideo` publishes once every cut is playable and audited. The per-cut Remotion render loop and the multi-cut concat in `generateVideo` (`server/media/videos.mjs`) move into a separate export job; generation no longer renders a video MP4. Manim clips, narration, set-piece code and audit stills still happen during generation, because playback and audits need them.
- **Kept production work.** A saved video's `video-work` folder keeps what live playback needs: cut code, `public/` (narration, timing, captions), Manim clips and the video's own set pieces as they were when it was made. The `finally` cleanup still removes `bundle`, `tmp`, `out` and `.remotion`.
- **Library ownership.** Deleting a learning tree keeps the `video-work` of a library video, as it keeps its MP4 today (`server/http/routes/trees.mjs`). Trashing a video removes both its `video-work` and any MP4.
- **Library playback.** Library cards for unexported videos mount the live player. The cut routes need a library-video form keyed by video id, because the tree may be gone; the current `/api/trees/:conversation/artifacts/:id/cuts` form stays for videos still in a tree. `VideoCard` plays the MP4 when one exists and the live player otherwise.
- **Exported flag.** A video counts as exported when its MP4 exists at `mediaPath(dir, id)`. Existing MP4s therefore count as exported with no migration. "Show in folder" appears only when the file exists.
- **Export job.** `POST` export starts or joins one job per video; progress streams like video phases. The job renders each cut in the sandbox, concatenates, validates with `validateOutput` and moves the file to `mediaPath`. It never rewrites cut code: a render failure ends the export with the renderer's path-free error and Retry, since the learner has already watched this version. Closing the app cancels a running export.
- **Delivery.** A finished export answers with the MP4 as `Content-Disposition: attachment`. Under `npm start` the browser downloads it; the desktop app handles webview downloads with a native save dialog (part C).
- **Export button.** An icon button at the top right of the player, labelled "Export MP4", showing a progress ring while rendering and returning to the icon afterwards. It is the same component in the inline card, the large player and the video library.

### B. First-run setup and downloads

- **When it shows.** A single setting records that first-run setup finished. A fresh database shows setup; a database that already has any model profile, chosen model or learning tree is marked finished on upgrade. Setup ends when the learner confirms a chat model. A "Set up later" link also ends it and falls back to the existing Send gate ("Choose a chat model in Settings"); setup then never shows again.
- **Finding CLIs.** Detection checks PATH, then the usual install folders: `~/.local/bin`, `~/.claude/local`, npm's global bin and Homebrew on Linux; `%LOCALAPPDATA%`, `%APPDATA%\npm` and `%USERPROFILE%\.local\bin` on Windows. Found paths are remembered and passed to the provider launchers in `server/providers/claude.mjs` and `codex.mjs`. On Windows, npm installs `.cmd` shims, which `spawn` cannot run without a shell; the launcher resolves the shim to its real executable or `node` script instead of enabling a shell.
- **Install links.** Each missing CLI shows its official install page and command. The app never installs or bundles either CLI.
- **Sign-in.** Codex uses the existing app-owned ChatGPT consent flow. Claude runs the CLI's own login in the browser. "Check again" re-runs detection and the auth status check.
- **Models.** Setup prefills the provider's default chat model and effort, and sets the smart and quick thinking models to follow it, as Settings already allows. It creates no model profile beyond what Settings would create for the same choice.
- **Linux line.** When `bwrap`, `pkg-config`, Cairo or Pango headers are missing, setup shows one line: `sudo apt install bubblewrap libcairo2-dev libpango1.0-dev pkg-config python3-dev build-essential`. Other distros get the same package list in words. Chat works without them; video making waits for them.
- **Windows sandbox prompt.** Setup runs the sandbox's one-time elevated setup (part C) behind one UAC prompt. If declined, setup says video making stays off until it is enabled, with a button to try again from Settings.
- **Download manager.** A server-side download manager runs each tool as one download: uv, Python, Manim (in `.venv`), TinyTeX plus Manim's documented LaTeX packages including `dvisvgm`, and the video browser. These replace the terminal steps in `scripts/start.mjs`, `manim-setup.mjs` and `python-setup.mjs`, which `npm start` keeps calling so terminal runs behave as before. uv itself is downloaded from its official release when missing. Downloads start after setup ends and run one at a time.
- **Download state.** Each download is queued, running (bytes, total, percent), failed (message, Retry) or ready. State is held in memory and streamed to the client. A ready download stays listed until the learner opens the list once. On launch, any tool that is not ready is queued again from the start.
- **Video gate.** A video request while a needed download is not ready gives the video card its `unavailable` state with "Video tools are still downloading (n%)". Once ready, the learner asks again; nothing starts by itself.
- **Web search.** SearXNG is not downloaded by default. Adding a custom endpoint offers "Download web search", which queues SearXNG as a download; the existing setup in `scripts/searxng-setup.mjs` does the work.
- **Downloads icon.** An icon in the sidebar and the sidebar rail, shown only while a download is queued, running, failed or newly ready. It shows a progress ring for the running total. Clicking it opens a small list with each tool's name, size, progress and Retry when failed.

### C. Desktop app

Replaced on 2026-11-21 by [the Electron desktop spec](electron-desktop-spec.md) and [ADR 0019](adr/0019-electron-desktop-with-bundled-video-tools.md); the Windows sandbox, data folders and Windows desktop actions below still apply.

- **Shell.** A Tauri 2 app in `desktop/`. It bundles a Node 24 runtime and the built app (`dist`, `server`, production `node_modules`) as resources, starts `server/main.mjs` as a sidecar on a free loopback port, and points the webview at that address once the server is listening. Closing the window stops the server. The server's existing Host, Origin and CSRF checks apply unchanged.
- **Per-OS builds.** Linux and Windows are built from the same source, each on its own OS, because npm installs per-OS binaries (Remotion's compositor, chrome-headless-shell, `onnxruntime`). Linux ships an AppImage that uses the system `bwrap`; Windows ships an NSIS installer. Neither is signed.
- **Data folder.** Linux keeps `$XDG_DATA_HOME/rabbithole`. Windows uses `%APPDATA%\rabbithole`. `npm start` and the desktop app on the same machine share it.
- **Linux sandbox.** Unchanged `bwrap` (`server/media/video-sandbox.mjs`, `server/tools/python.mjs`).
- **Windows sandbox.** Model-written code runs through OpenAI's `codex-windows-sandbox` crate from `openai/codex`, as a git dependency pinned to a Codex release tag and updated only on purpose. Its Apache-2.0 notice ships in the app's licences file. It runs in elevated mode, with its one-time setup run from first-run setup. Rules match `bwrap`: no network, the learner's home and app data hidden, writes only to the job's workspace, reads of the workspace and runtime folders. The sandbox is exposed to the Node server through one small launcher executable built from the Tauri workspace, with the same argument shape `sandboxRender`, `sandboxSnapshot`, Manim and `run_python` already pass. If the sandbox is not set up, video making and `run_python` report unavailable; chat, visuals and diagrams work.
- **Manim on Windows.** `checkManimDependencies` accepts Windows, where `pycairo` and `manimpango` install from wheels and LaTeX comes from TinyTeX.
- **Desktop actions.** "Show in folder" and Trash (`server/desktop.mjs`) gain Windows forms: Explorer's `/select,` and the Recycle Bin through PowerShell, both with argument arrays and no shell string.
- **Webview.** Linux uses WebKitGTK and Windows uses WebView2. We assume the Remotion player and WebGL visuals work in both; problems found later are fixed then.
- **Export save dialog.** The desktop shell handles webview downloads with a native save dialog.
- **Builds on GitHub Actions.** `.github/workflows/desktop-build.yml` runs only on manual trigger (`workflow_dispatch`), with one Linux and one Windows job, cached npm, Cargo and Tauri dependencies, and no runs on push or pull request. It uploads both installers to a draft GitHub Release that the owner publishes by hand. The owner triggers it; Ralph runs stay local, per `AGENTS.md`.

## Testing Decisions

- Good tests assert what the learner or the server observes: which state a video card shows, what a route returns, which downloads are listed, which command a launcher would run. They do not assert component internals or file layouts beyond the public paths.
- **Seams.** (1) `generateVideo` with fake render and narration, for a video saved without any render call (prior art in `test/media`). (2) The export job with a fake renderer: one job per video, a second export reuses the MP4, failure leaves the video playable. (3) `createApp` routes: library playback of an unexported video after its tree is deleted, "Show in folder" only when the MP4 exists, attachment headers. (4) The download manager as a unit, with fake steps: queue order, failure and Retry, restart after relaunch, "ready until seen". (5) CLI detection as a unit, with a fake filesystem and environment for Linux and Windows paths, including `.cmd` shim resolution. (6) First-run setup decision as a unit: fresh, upgraded and finished databases. (7) Component tests for the export button, the Downloads icon and list, and first-run setup.
- No browser scripts, no cross-OS tests and no Windows CI tests. The Tauri shell and the Windows sandbox have no automated tests in this spec.

## Out of Scope

- macOS builds, code signing and notarisation for any OS.
- Bundling the Claude Code or Codex CLIs.
- A local text-to-speech model (Kokoro, Qwen3-TTS); narration stays Edge TTS.
- Auto-update of the desktop app.
- Pause or cancel for downloads, and downloads other than tools.
- Export formats other than MP4, and export of anything other than videos.
- Rewriting cut code during export.
- Automatic tests on Windows, and checks of the Linux webview.

## Further Notes

- **Open risks.** SearXNG's support on Windows is unchecked. TinyTeX's size with Manim's LaTeX packages is unchecked. Whether `codex-windows-sandbox` elevated mode runs Chromium and Manim inside its sandbox is unchecked; it is the first ticket of part C. Edge TTS is an unofficial Microsoft endpoint that can break or be blocked; narration already fails with "Check your connection and Retry".
- ADR 0001 still says the MP4 renders in the background; ADR 0012 amends it.
