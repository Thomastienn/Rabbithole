# Electron desktop app with bundled video tools

Decided with the project owner on 2026-11-21 (grilling session). Terms follow `GLOSSARY.md`; no term changed meaning. The decision is recorded in [ADR 0019](adr/0019-electron-desktop-with-bundled-video-tools.md), which supersedes the Tauri shell of ADR 0011. This spec replaces part C of [the desktop and export spec](desktop-and-export-spec.md) and changes part B only for the desktop app; `npm start` keeps parts A and B as they are.

## Problem Statement

The owner wants someone to try Rabbithole quickly on Linux or Windows, and the Tauri app does not allow that. The Linux AppImage is 758 MB. On first launch it shows "Starting Rabbithole…" on a blank window for minutes, because it first copies 1.6 GB of its own files (49,572 of them) into the data folder; it measured 42 s on the owner's machine with warm caches and repeats after every update. Once it opens, WebKitGTK draws the app without its icons and lags. After that, video making still waits for Python, Manim, TinyTeX and the video browser to download. The Windows build has never run, and the owner has no Windows machine to try it on.

## Solution

- **Electron shell.** The desktop app is an Electron window showing the same app `npm start` serves, in the same Chromium the owner tests with. The server is unchanged and runs beside it on the bundled Node 24.
- **Opens in seconds.** The app runs from where the installer put it. Nothing is copied on first launch or after an update.
- **Video tools included.** Python, Manim, TinyTeX and the video browser come inside the installer, so a video can be made on first launch with no tool downloads. Web search stays an optional download.
- **Same on Linux and Windows.** An AppImage and a per-user Windows installer, both unsigned. Model-written code stays sandboxed on both.
- **Windows checked without a Windows machine.** The release workflow installs the Windows build on GitHub's Windows runner and runs a smoke test with fixture data.
- **`npm start` unchanged.** A clone still runs with `npm start`, including its background tool downloads.

## User Stories

### Trying the app

1. As someone trying Rabbithole, I want to download one file for Linux or Windows and open it with no terminal, so that a demo takes a download and a click.
2. As someone opening the app for the first time, I want the app to appear within a few seconds, so that I do not stare at a blank "Starting" window.
3. As a learner who updated the app, I want it to open as fast as before the update, so that updates never bring back a long wait.
4. As a learner, I want the desktop app to look and behave exactly like the app in a browser, icons included, so that nothing is missing on my OS.
5. As a learner on Linux, I want scrolling, the map and video playback to be smooth, so that the desktop app is not slower than the browser.
6. As a learner on Windows, I want the same features as on Linux, so that my OS does not decide what I can do.
7. As a Windows learner, I want to install without admin rights, so that I can try the app on a machine I do not administer.
8. As a Windows learner, I want to know that SmartScreen will warn about an unsigned installer and that "More info → Run anyway" is expected, so that I am not alarmed.

### Videos from the first launch

9. As a new learner, I want video making to work as soon as setup ends, so that I do not wait for downloads before my first video.
10. As a new learner, I want no Downloads icon for video tools in the desktop app, so that nothing suggests the app is unfinished.
11. As a learner without internet beyond my provider, I want Manim, LaTeX and the video browser already on my machine, so that only the model and narration need the network.
12. As a learner adding a custom endpoint, I want web search still offered as a download, so that the installer stays smaller for a feature most learners never use.
13. As a learner on Linux without `bwrap`, I want one short install line and "Check again", so that video making and offline Python can start.
14. As a learner on Linux, I want no request to install Cairo, Pango or build headers in the desktop app, so that the only package I install is the sandbox.
15. As a Windows learner, I want the one admin prompt that enables the sandbox, and an explanation if I decline, so that I know video making and offline Python stay off until I allow it.
16. As a learner, I want model-written code sandboxed in the desktop app exactly as under `npm start`, so that generated code cannot read my files or reach the network.
17. As a learner, I want exported MP4s to open a native save dialog, so that I choose where the file goes.

### Safety of the window

18. As a learner, I want the app window to show only Rabbithole's own address, so that a link in a reply cannot take over the app window.
19. As a learner, I want outside links to open in my normal browser, so that I can read sources without leaving the app.
20. As a learner, I want the page inside the window to have no access to my computer beyond what the server allows, so that a bad page cannot run code on my machine.
21. As a learner, I want closing the window to stop the server, so that nothing keeps running in the background.
22. As a learner, I want a clear message when the server cannot start, such as when another copy is already running, so that I know what to do.

### Developer and owner

23. As the owner, I want a clone to keep running with `npm start` and its background downloads, so that development does not need an installer.
24. As the owner, I want my saved trees, videos and sign-ins shared between `npm start` and the desktop app, so that I can switch between them.
25. As the owner, I want both installers built by one hand-triggered workflow into a draft release, so that I publish when I choose.
26. As the owner without Windows, I want the workflow to install the Windows build and prove a sandboxed render and a sandboxed Python run with fixture data, so that I know Windows works before anyone tries it.
27. As the owner, I want the same smoke test on the Linux build, so that both installers are proven the same way.
28. As the owner, I want the smoke test to use no models and no accounts, so that it costs nothing and never needs my sign-in.
29. As the owner, I want each installer to carry only its own OS's binaries, so that the download is no bigger than it must be.

## Implementation Decisions

### Shell

- **Electron replaces Tauri.** The Tauri shell, its config, its webview launcher page and its staging step are removed. The Windows sandbox launcher (the small Rust program around `codex-windows-sandbox`, with its Codex helpers) stays as its own crate and keeps its argument shape.
- **Separate desktop package.** Electron and `electron-builder` are dependencies of the desktop package only, so `npm ci` in a clone does not download Electron.
- **Server as a child process.** Electron's main process starts the bundled official Node 24 (pinned version and SHA-256, as today) on the server entry with port 0, reads its output until the `Rabbithole: <url>` line, then loads that URL. The server does not run inside Electron's own Node. Until the line arrives the window shows a short "Starting Rabbithole…" page; if the server exits first, the window shows its output as the error, as the Tauri shell did. On Linux the server is tied to the shell's life (it gets SIGTERM if the shell dies); quitting the app stops it on both OSes.
- **Window locks.** No Node integration, context isolation on, sandboxed renderer, no preload API. Navigation is allowed only to the server's own origin. Any other `http` or `https` link opens in the default browser; every other scheme is refused. New windows are refused and their links handed to the default browser.
- **Downloads.** A download from the page (an exported MP4) opens Electron's native save dialog. "Show in folder" and Trash keep their server-side forms.
- **Environment passed to the server.** The data folder stays the server's default (`$XDG_DATA_HOME/rabbithole` on Linux, `%APPDATA%\rabbithole` on Windows), shared with `npm start`. The shell tells the server where the bundled tools are and, on Windows, where the sandbox launcher is (it already reads the launcher's location from the environment).

### Running in place

- **No copy step.** The shell runs the server from the installed resources: the AppImage's read-only mount on Linux, the install folder on Windows. The `.build` stamp and the unpack logic go away.
- **Read-only app folder.** At runtime nothing is written under the app folder. Every write the server, Remotion, Python, Manim or LaTeX makes goes to the data folder or a job's own workspace: Remotion bundles, Python bytecode, LaTeX font and format caches, Manim media, temporary files. The webpack cache already stays off.
- **Tool root.** The server resolves its tools (uv, TinyTeX, the Manim Python, the offline Python, yt-dlp and the video browser) from one tool root. By default the tool root is the project folder, so `npm start` behaves as today. The desktop app sets it to the bundled tools. The video browser's path is chosen per OS, since it is currently fixed to the Linux build.
- **Download manager.** It reads readiness from the tool root. With every bundled tool present, it has nothing to queue for video tools, and the Downloads icon only ever shows web search. SearXNG still downloads into the data folder, as today.

### Bundled tools

- **Python without a venv.** A venv records absolute paths, and the AppImage mount path changes on every launch. The bundle therefore ships a relocatable standalone Python (the build uv already installs), with Manim at its pinned version, the offline Python packages and yt-dlp installed straight into it. The server runs it as an interpreter and calls `python -m …` instead of venv scripts. If the Manim and offline-Python package pins clash, the bundle ships two standalone Pythons instead.
- **Built on the oldest supported OS.** Linux tools and wheels are built on the CI's Ubuntu 22.04 image, so the AppImage runs on older glibc. Manim's Cairo and Pango come from wheels or the system's runtime libraries, never from build headers on the learner's machine.
- **TinyTeX** with Manim's documented LaTeX packages and `dvisvgm`, installed at build time. Its variable data points at the data folder.
- **Video browser.** Remotion's headless Chromium for the build's OS, installed at build time.
- **Clips.** yt-dlp ships in the bundled Python. If ffmpeg is missing, clip exhibits report unavailable, exactly as they do today; the desktop app adds no ffmpeg of its own.
- **Pruned dependencies.** Production dependencies only, with other OSes' native binaries removed (above all `onnxruntime-node`'s, which take most of its 548 MB) and packages used only at build time left out. The staging step fails if the bundle contains another OS's native binaries or is missing a bundled tool.
- **Not bundled.** The Claude Code and Codex CLIs (first-run setup still links their official installers) and SearXNG.

### First-run setup in the desktop app

- **Linux line.** With bundled tools, the Linux line asks only for what is missing at runtime: `sudo apt install bubblewrap` when `bwrap` is absent. It no longer checks `pkg-config` or headers. Under `npm start` the existing full line stays.
- **Windows.** The one-time elevated sandbox setup behind one admin prompt stays as built. Declining keeps video making and offline Python off, with a way to try again from Settings.
- **Downloads.** Downloads still start after setup ends; in the desktop app the queue starts empty unless the learner asks for web search.

### Installers and release

- **`electron-builder`** builds an AppImage on Linux and a per-user NSIS installer on Windows (into `%LOCALAPPDATA%\Programs`, no admin rights), each on its own OS. No code signing, no auto-update. The app icon is the existing Rabbithole mark.
- **Windows resources.** The sandbox launcher and its Codex helpers ship beside each other in the app's resources. The Windows sandbox's read rules cover the install folder that now holds Node, the server and the tools.
- **Workflow.** The hand-triggered desktop build workflow switches from Tauri to `electron-builder` on Ubuntu 22.04 and `windows-latest`, and uploads both installers to a draft release, as today. Agents edit the workflow locally; the owner pushes and triggers it (`AGENTS.md`).
- **Smoke test.** After building, each job installs or opens its own installer's output without a display where possible, starts the bundled server on an empty temporary data folder, and checks that it answers. It then runs the sandbox setup on Windows (runners have admin rights), renders one fixture cut through the video sandbox to a validated MP4, and runs one fixture `run_python` call in the sandbox. It uses no models, no accounts and no network for the checks. A failed check fails the job and the release.
- **Old Tauri leftovers.** No migration code. The owner's data folder holds no Tauri app files; the Tauri build output was removed by hand on 2026-11-21.

## Testing Decisions

- Good tests assert what the learner, the server or the shell observes: which URL the window may load, which address a server output line yields, which tool path the server uses, what first-run setup asks for, what a route returns. They do not assert Electron internals or file layouts beyond the public tool paths.
- **Seams.**
  1. Tool resolution as a unit, with a fake filesystem and platform: the default tool root is the project folder, a given tool root wins, Python resolves to a standalone interpreter, and the video browser path follows the OS. Prior art: the `checkManimDependencies` and CLI detection tests in `test/media` and `test/providers`.
  2. The shell's decisions as plain functions in the desktop package, tested in `node --test` without starting Electron: reading the server address from output lines, the navigation allow-list (own origin allowed, other `http(s)` sent outside, other schemes refused), and the error text when the server exits early.
  3. First-run setup's Linux line as a unit: bundled tools ask only for `bwrap`; `npm start` keeps the full line. Prior art: the existing first-run setup decision tests.
  4. The download manager with bundled tools present: no video tool is queued, and web search can still be queued. Prior art: the download manager unit tests.
  5. A read-only check as an integration test: the server runs from a read-only copy of the project with a temporary data folder, opens, and serves a saved video's cut, with nothing written outside the data folder.
  6. The workflow's smoke test on both OSes, which is the only check of Electron packaging, the bundled tools and the Windows sandbox.
- No browser scripts and no tests that start Electron locally.

## Out of Scope

- A hosted website, Google sign-in and any server-side storage of learner data.
- A Docker image (it may come back later as a development setup).
- macOS builds, code signing and notarisation.
- Auto-update.
- Bundling the Claude Code or Codex CLIs, SearXNG or ffmpeg.
- Running model-written code without a sandbox on any OS.
- Migration or cleanup code for Tauri installs.
- Changes to `npm start` beyond honouring the tool root.

## Further Notes

- **Open risks.** Whether `codex-windows-sandbox` elevated mode runs Chromium and Manim inside its sandbox is still unproven; the smoke test is its first real check. Whether the bundled Manim runs on a Linux desktop missing Cairo or Pango runtime libraries is unchecked; if it does not, the Linux line gains those runtime packages (not headers). The TinyTeX size with Manim's packages is unchecked; the whole installer is expected near 1 GB.
- **Startup measurement.** The 42 s was a headless run of the Tauri AppImage on the owner's machine with an empty data folder: 42 s from launch to the server's first line, then 1 s until it listened.
