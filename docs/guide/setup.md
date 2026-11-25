# Setup

Back to [README](../../README.md).

## Install and start

Install [Node.js 24 or newer](https://nodejs.org/) with npm. Download or copy this project, open a terminal in its folder, and run:

```sh
npm start
```

On first run this installs missing dependencies with `npm ci --include=dev`, installs Manim 0.22.1 into the project's git-ignored `.venv` using [uv](https://docs.astral.sh/uv/getting-started/installation/), provisions Remotion's headless browser and bundled audio tools, and builds the app. uv provisions Python 3.12 if needed; activate no environment by hand. When uv or LaTeX/dvisvgm is missing, startup downloads uv's official release and TinyTeX with Manim's LaTeX packages into the git-ignored `.tools`. On x86_64 Linux, Manim's pycairo and manimpango come from the project's prebuilt wheels (the `linux-wheels` release, SHA-256 pinned), so nothing compiles; Windows uses PyPI's wheels. On macOS, startup checks Cairo/Pango development headers, stopping with the exact Homebrew command if missing; it never installs system packages. See [Manim's installation guide](https://docs.manim.community/en/stable/installation/uv.html). Later starts reuse usable Manim and rebuild the app when source, build configuration, the dependency lockfile or built assets change. Installation may need internet access. Keep the terminal open. In an interactive terminal `npm start` opens the address printed after **Rabbithole:**, normally **http://127.0.0.1:4317**, in your default browser; otherwise open it yourself. `npm run serve` starts the same way without opening a browser, for scripts and coding agents. No provider is required to open saved trees.

The Edge TTS narration client is included; it needs no voice-model download or paid narration account/API key. Manim is used only for videos; chat and visuals have no Python dependency. If repairing Manim later prevents `npm start`, `node server/main.mjs` serves an already-built app while you fix the printed setup problem.

The server always binds to `127.0.0.1`. If the port is busy, the message explains how to choose another:

```sh
npm start -- --port 4318
# Or let the operating system choose an available loopback port:
npm start -- --port 0
```

`RABBITHOLE_PORT` also sets the port; `--port` takes precedence. Use the printed address, including its port. Keep the app on loopback; hosted deployment is outside its scope.

Stop with **Ctrl+C** and wait for the terminal command to exit. Active replies end as interrupted, keeping their partial text; unfinished videos also become interrupted. Closing a browser tab leaves the server and its work running. Reopening never automatically restarts an interrupted or failed generation.

## Linux desktop app

`npm run desktop:build` stages the desktop resources and builds an AppImage in `desktop/dist/` with Electron and `electron-builder`, which live in `desktop/package.json` so `npm ci` in a clone never downloads them. The AppImage holds Node 24 and the built app with its production dependencies, and runs them in place from its mount: nothing is copied on launch. It bundles no tools: video tools, offline Python and web search are add-ons installed on request from first-run setup or **Settings → Add-ons**, into the `tools` folder of the data folder, with the same setup code as `npm start`, so the app never writes into its own folder. Opening it needs no terminal: it starts the server on a free loopback port and shows it in a window. It uses the same data folder as `npm start`, so stop one before opening the other; a second copy shows the already-running message. Closing the window stops the server. Links to other sites open in your browser. Downloads such as an exported MP4 ask where to save. Video making still needs the system `bwrap`.

## Windows desktop app

On Windows, `npm run desktop:build` stages Node, the app and the sandbox launcher with its Codex helpers (it needs Rust for the launcher); the Windows installer is not built yet. The app keeps its data in `%APPDATA%\rabbithole`.

## Downloads

The **Desktop build** GitHub Actions workflow (`.github/workflows/desktop-build.yml`) runs only when started by hand. It builds the AppImage on Linux and the installer on Windows, then attaches both to a draft release, which is published by hand. On Linux, mark the AppImage executable (`chmod +x`) and open it. The Windows installer is not signed, so SmartScreen shows "Windows protected your PC" the first time. Choose **More info**, then **Run anyway**.

## Providers and sign-in

Startup reports the Node requirement, whether each CLI can run, Claude's native sign-in state and whether a ChatGPT connection is saved. These checks do not send a learning question or verify model entitlement or remaining quota. Provider setup is optional until you want a new reply. There is no API-key fallback.

Choose **Install** for a missing provider in first-run setup or **Map menu → Settings → Connections**. Rabbithole runs the official installer, shows progress and checks for the tool again when it finishes. The same screen shows the command for your system if you prefer to install [Claude Code](https://code.claude.com/docs/en/setup) or [Codex](https://developers.openai.com/codex/cli/) manually.

**Claude (default):** Run `claude` in a terminal and sign in with your Claude plan. Reload Rabbithole to recheck sign-in. Where **Check Claude sign-in** is shown in Settings or the model menu, it also refreshes the connection. Rabbithole uses the CLI's native login, strips `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from its environment, and does not read or copy Claude credentials.

**Codex:** In Rabbithole, open **Map menu → Settings → Connections → Continue with ChatGPT** and approve Rabbithole's use of your ChatGPT plan in the official sign-in page. A terminal Codex login alone does not connect Rabbithole: it uses its own consent and isolated Codex home. If the connection expires, choose **Reconnect ChatGPT**. Account or workspace policy can prevent consent; quota and model access can still prevent a reply after sign-in. The Codex app-server protocol was checked with CLI 0.167.0 and is experimental.

Use the compact model button in the chat header to select a provider and model for that conversation. Switching keeps the saved discussion and passes it to the new provider in a fresh session. A failed reply restores the last working selection. Children start with their parent's provider and model.

**Custom endpoints (optional):** Open **Map menu → Settings → Connections** and choose **Add endpoint**. Enter a unique **Name**, an OpenAI-compatible **Base URL** (the API root including its path prefix, such as `http://127.0.0.1:8080/v1`) and **API key**, then **Save**. Use HTTPS for remote endpoints. You can add several, such as a local server and a hosted gateway. Saving refreshes the model catalogue without changing any conversation's provider. The password field clears after each attempt and never displays a saved key. An endpoint saved by an earlier version appears as **Custom endpoint**.

Each endpoint appears as its own group, under its name, in **Model for next reply** and the other model menus. A failing endpoint offers **Custom endpoint settings**. Switching among endpoints, Claude and Codex keeps visible history and fixed inherited context, including in nested branches and after restart. New chats still default to Claude. **Remove** asks for confirmation, then deletes that endpoint's key; saved discussions remain, and those using it fail visibly until you choose another model.

Requests, including discussion and inherited context, go to the selected endpoint and are billed by its owner. Its operator controls remote retention and billing. The key stays in the local owner-only `openai-endpoint.json`, separate from learning trees, and is never returned by the server or used for Claude/Codex. See [the endpoint contract](../custom-endpoint.md).


## Development checks

For development checks, run `npm test`, `npm run build` and `npx astryx doctor --built dist`. `npm run verify` builds the app, runs the five smoke browser scripts (isolated store, synthetic providers; needs `agent-browser`) in a small worker pool (`VERIFY_JOBS`) and prints a pass/fail table; scripts write no screenshots or result files, a script that fails once and passes on retry shows as flaky, and any failure exits non-zero. The scripts live in `scripts/verify/` (shared fixtures in `scripts/verify/lib/`). Pass script names (`npm run verify -- verify-branch-first.mjs`) to run a subset, or run one directly from the repository root with `node scripts/verify/verify-branch-first.mjs` after `npm run build`. `npm test` includes a token lint that rejects raw color literals and font family names outside the theme. Implementation workflow is documented separately in [docs/ralph-workflow.md](../ralph-workflow.md); the 1.0 release record is [docs/product-release.md](../product-release.md).
