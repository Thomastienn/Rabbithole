# The desktop app is Electron, runs in place and ships its video tools

Superseded in part by ADR 0020: video tools, offline Python and web search are now add-ons installed on request, not bundled.

The Tauri app from ADR 0011 was hard to try. The Linux AppImage was 758 MB and showed "Starting Rabbithole…" for minutes on first launch, because it copied 1.6 GB of its own files into the data folder before starting the server (42 s on the owner's machine with warm caches, again after every update). WebKitGTK then drew the app without its icons and lagged, and nothing had run on Windows yet. We decided to replace the Tauri shell with Electron, so every learner sees the same Chromium the owner tests with in `npm start`. The Electron window only shows the server's loopback address; the server still runs as a child process on its own pinned official Node 24, unchanged. The app runs straight from where its installer put it and never writes into its own folder: everything that changes lives in the data folder. The installer carries Python, Manim, TinyTeX and the video browser, so video making works on first launch with no tool downloads; only web search stays an optional download. Model-written code stays sandboxed: the system `bwrap` on Linux and the `codex-windows-sandbox` launcher from ADR 0011 on Windows. `electron-builder` makes an AppImage and a per-user NSIS installer, still unsigned, and a Windows smoke test with fixture data runs on GitHub's Windows runner because the owner has no Windows machine. We accepted a download of about 1 GB, about 100 MB more than a webview shell, and keeping `bwrap` and the Windows admin prompt as one-time setup steps, in exchange for a first launch in seconds, one browser engine everywhere and videos that work without waiting.

This supersedes ADR 0011's Tauri shell and its webview. ADR 0011's choices of Linux and Windows only, no code signing, no bundled Claude Code or Codex CLI, and the Windows sandbox still stand.

## Considered Options

- Keeping Tauri and fixing WebKitGTK. It leaves two browser engines to test, and the owner tests only in Chromium.
- A launcher that opens the learner's default browser. It is lighter, but Firefox and Safari-based engines would differ from the owner's Chromium again.
- A Docker image for every OS. Every tester would first have to install Docker, and Docker Desktop on Windows needs WSL2, which ADR 0011 already rejected as too heavy for a demo. Docker may return later as a development setup.
- A hosted website with Google sign-in. Learners could not use their own Claude or ChatGPT subscriptions there, and the server would run strangers' model-written code and hold their data.
- Running the server inside Electron's own Node. Its Node version and native-module ABI differ from the pinned Node 24 the server is tested on.
- A small installer that downloads the video tools after install. Videos would not work until the downloads finished, and the owner wants the app to work as soon as it opens.
