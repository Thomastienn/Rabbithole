# The desktop app is Tauri around the Node server, for Linux and Windows only

Superseded in part by [ADR 0019](0019-electron-desktop-with-bundled-video-tools.md): the shell is Electron, not Tauri.

Rabbithole ran only from a terminal with `npm start`, which rules out quick demos and non-technical learners. We decided to ship a one-click desktop app built with Tauri, with the existing Node server bundled unchanged beside it as a sidecar and the webview loading its loopback address, so no server code moves to Rust. Linux (AppImage) and Windows are built together from one source on GitHub Actions, triggered by hand. Model-written code keeps running in an OS sandbox: the system `bwrap` on Linux, and on Windows OpenAI's open-source `codex-windows-sandbox` crate in elevated mode, pinned to a Codex release tag, after one admin prompt during first-run setup. The app does not bundle the Claude Code or Codex CLIs; first-run setup points to their official installers. Nothing is code-signed. We accepted WebKitGTK's and WebView2's differences from Chrome, an unsigned SmartScreen warning on Windows and no macOS build, in exchange for a light app, an unchanged server and no signing costs.

## Considered Options

- Electron. It contains Node and the same Chromium on every OS, but the owner chose Tauri for speed and size.
- macOS. Gatekeeper blocks unsigned apps and signing needs a paid Apple Developer account, so macOS is out until the project has one.
- Writing our own Windows sandbox, Anthropic's `sandbox-runtime` Windows alpha, WSL2 with `bwrap`, or Windows Sandbox. These were more code, alpha, too heavy to install for a demo, or limited to Pro editions.
- Running model-written code unsandboxed on Windows. That would give it the learner's files and network.
- Bundling the Codex CLI. Codex is Apache-2.0 and bundling would make ChatGPT sign-in a single step, but the owner preferred that learners install it from the official source.
