# Rabbithole

Rabbithole is a local learning workspace. Ask a question, highlight an unfamiliar passage in the answer, and explore it in a connected child conversation. Your map, messages and branch context save on your computer.

## Install and start

Install [Node.js 24 or newer](https://nodejs.org/) with npm. Download or copy this project, open a terminal in its folder, and run:

```sh
npm start
```

On first run this installs missing dependencies with `npm ci --include=dev`, installs Manim 0.22.1 into the project's git-ignored `.venv` using [uv](https://docs.astral.sh/uv/getting-started/installation/), provisions Remotion's headless browser and bundled audio tools, and builds the app. uv provisions Python 3.12 if needed; activate no environment by hand. Install uv first (`brew install uv` on macOS, or `curl -LsSf https://astral.sh/uv/install.sh | sh` on Linux), then reopen the terminal. Startup checks Cairo/Pango development headers and LaTeX/dvisvgm, stopping with the exact apt or Homebrew command if missing; it never installs system packages. See [Manim's installation guide](https://docs.manim.community/en/stable/installation/uv.html). Later starts reuse usable Manim and rebuild the app when source, build configuration, the dependency lockfile or built assets change. Installation may need internet access. Keep the terminal open. In an interactive terminal `npm start` opens the address printed after **Rabbithole:**, normally **http://127.0.0.1:4317**, in your default browser; otherwise open it yourself. `npm run serve` starts the same way without opening a browser, for scripts and coding agents. No provider is required to open saved trees.

The Edge TTS narration client is included; it needs no voice-model download or paid narration account/API key. Manim is used only for videos; chat and visuals have no Python dependency. If repairing Manim later prevents `npm start`, `node server/main.mjs` serves an already-built app while you fix the printed setup problem.

The server always binds to `127.0.0.1`. If the port is busy, the message explains how to choose another:

```sh
npm start -- --port 4318
# Or let the operating system choose an available loopback port:
npm start -- --port 0
```

`RABBITHOLE_PORT` also sets the port; `--port` takes precedence. Use the printed address, including its port. Keep the app on loopback; hosted deployment and a desktop installer are outside its scope.

Stop with **Ctrl+C** and wait for the terminal command to exit. Active replies end as interrupted, keeping their partial text; unfinished videos also become interrupted. Closing a browser tab leaves the server and its work running. Reopening never automatically restarts an interrupted or failed generation.

## Providers and sign-in

Startup reports the Node requirement, whether each CLI can run, Claude's native sign-in state and whether a ChatGPT connection is saved. These checks do not send a learning question or verify model entitlement or remaining quota. Provider setup is optional until you want a new reply. There is no API-key fallback.

**Claude (default):** Install the official [Claude Code CLI](https://code.claude.com/docs/en/setup). On Linux, macOS or WSL, the native install command is:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Run `claude` in a terminal and sign in with your Claude plan. Reload Rabbithole to recheck sign-in. Where **Check Claude sign-in** is shown in Settings or the model menu, it also refreshes the connection. Rabbithole uses the CLI's native login, strips `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from its environment, and does not read or copy Claude credentials.

**Codex:** Install the official [Codex CLI](https://developers.openai.com/codex/cli/):

```sh
npm install -g @openai/codex
```

In Rabbithole, open **Map menu → Settings → Continue with ChatGPT** and approve Rabbithole's use of your ChatGPT plan in the official sign-in page. A terminal Codex login alone does not connect Rabbithole: it uses its own consent and isolated Codex home. If the connection expires, choose **Reconnect ChatGPT**. Account or workspace policy can prevent consent; quota and model access can still prevent a reply after sign-in. The Codex app-server protocol was checked with CLI 0.167.0 and is experimental.

Use the compact model button in the chat header to select a provider and model for that conversation. Switching keeps the saved discussion and passes it to the new provider in a fresh session. A failed reply restores the last working selection. Children start with their parent's provider and model.

**Custom endpoints (optional):** Open **Map menu → Settings → Connections** and choose **Add endpoint**. Enter a unique **Name**, an OpenAI-compatible **Base URL** (the API root including its path prefix, such as `http://127.0.0.1:8080/v1`) and **API key**, then **Save**. Use HTTPS for remote endpoints. You can add several, such as a local server and a hosted gateway. Saving refreshes the model catalogue without changing any conversation's provider. The password field clears after each attempt and never displays a saved key. An endpoint saved by an earlier version appears as **Custom endpoint**.

Each endpoint appears as its own group, under its name, in **Model for next reply** and the other model menus. A failing endpoint offers **Custom endpoint settings**. Switching among endpoints, Claude and Codex keeps visible history and fixed inherited context, including in nested branches and after restart. New chats still default to Claude. **Remove** asks for confirmation, then deletes that endpoint's key; saved discussions remain, and those using it fail visibly until you choose another model.

Requests, including discussion and inherited context, go to the selected endpoint and are billed by its owner. Its operator controls remote retention and billing. The key stays in the local owner-only `openai-endpoint.json`, separate from learning trees, and is never returned by the server or used for Claude/Codex. See [the endpoint contract](docs/custom-endpoint.md) and [fixture verification](docs/verification/custom-endpoint-settings.md).

## Your learning journey

1. Choose **New chat**. Its map opens with one root conversation and a chat panel. Ask about a topic; the first question becomes its title.
2. Highlight a passage in a completed tutor answer and choose **Ask about selection**. Review the passage, enter your question and create the branch. With **Settings → Models → Automatic suggestions** on, the quick thinking model also underlines terms you probably do not know after each reply; click an underline to branch from it.
3. The child appears beside its source message and opens immediately. It receives the exact passage and a compact, fixed snapshot of relevant parent and ancestor context. Creating a branch saves the child at once and then sends that context to the quick thinking model for summarization; the child's first reply shows "Compacting parent context…", then "Thinking…", and starts once the snapshot is ready. Later parent messages do not change it; child discussions do not enter the parent's context.
4. Continue chatting or branch again at any depth. Drag empty map space to pan, scroll to zoom, drag a box to move it, and click a box to open it. Use the chevron to fold descendants; **Map menu** offers expand, collapse and keep-current-branch actions.
5. Expand the chat for reading or return to the map. On narrow screens the chat fills the workspace. **Return to parent conversation** opens the parent. Other conversations can reply while you navigate.
6. Open **Map menu → Learning trees** to revisit a saved chat. Messages save as they arrive. Layout changes save at most once a minute and when leaving the tree, so a sudden close can lose recent map adjustments. Renaming and confirmed deletion are available from chat actions.

## What the tutor can do

- **Attachments:** attach PNG, JPEG or WebP images, PDFs and plain-text files with **Attach files**, by pasting or by drag-and-drop. Each chip says how the file reached the tutor: sent as image, read as text, or OCR. A model that cannot read images gets local OCR text instead. Child conversations do not receive the files.
- **Tutor tools:** **Settings → Models → Tutor tools** turns tools on or off for every provider. They cover web search and page reading, image finding, offline Python, the memory note, concept lookup and recall of earlier conversations in any learning tree. Claude and Codex use their own web search (and Claude its page fetch); the app serves the other tools to them through a per-turn local MCP server, and to custom endpoint models through function calling. Pages, images and documents the tutor uses become resources: replies cite them with chips and the contents panel lists them.
- **Tutor style and memory note:** **Settings → Models** also holds the tutor style every chat model receives first, and the memory note the tutor keeps about you across all learning trees. You can edit or clear either.
- **Reply layouts:** the tutor can lay out a section as plain flow, figure beside text, gallery, comparison, step cards, callout, timeline or wide. Every passage stays branchable.
- **Visuals and diagrams:** the conversation's chat model writes interactive HTML/SVG visuals and Mermaid diagrams where the tutor places them in a reply. Visuals run in a sandbox with no network. A visual streams in as it is written, with an amber border while it is still drawing. Stepped visuals show **Step** controls beside them. Click a tagged part to branch about it, or choose **Try a different version**. Visuals and videos can place stock objects from Microsoft Fluent Emoji (2D) and Polyfork (3D), downloaded on first use.
- **Familiarity and discussions:** each reply silently updates an estimate of how well you know the concepts it touched; the tutor uses it to pitch its answers, and the **Knowledge** view shows it read-only. Ask for a discussion to get a small group chat inside the reply, where classmates at different levels and the tutor talk the idea through. Reply inside the card; your next question in the conversation closes it and carries its gist forward.
- **Map previews:** each conversation box shows chips for its visuals, diagrams, videos and discussions; click one to open the chat at that item.
- **Usage:** each final reply shows a token line, including media work, and **Settings → Usage** charts history.

Requested videos are planned by the smart model, which also audits each cut and returns issues, never code. The conversation's chat model writes the shared set pieces, every cut's code and any fixes. Each cut is 2D or 3D: Remotion (with Three.js and a moving camera for 3D) or Manim for math. An explicit request for 2D makes every cut 2D. An explicit request for 3D makes most cuts 3D. Recurring objects are drawn once as set pieces, in 2D and 3D forms, so they look the same in every cut. A piece library in the **Videos** view lets later videos reuse the 2D forms. A video plays live as soon as its first cut is ready, while an MP4 renders in the background into the **Videos** library (with **Show in folder**). Videos aim for 1–2 minutes, with shorter or longer requests supported. Edge TTS supplies narration and timing; subtitles are embedded in the saved video and stay visible in enlarged playback. Playback starts paused. Rendering needs the supported Linux environment with bubblewrap and Chromium's system libraries. Source/media-size budgets and finite processing timeouts still apply; long or complex renders can fail. A failed video stays failed until explicit Retry.

## Keyboard controls

| Focus or action | Keys / control |
| --- | --- |
| Move between controls | Tab / Shift+Tab |
| New chat | Ctrl+Shift+O, also while typing |
| Hide or show the sidebar (top bar on narrow screens) | Ctrl+Shift+F |
| Activate a button; choose a menu item | Enter / Space; arrow keys in menus |
| Send a question / add a newline | Enter / Shift+Enter |
| Pan the focused map | Arrow keys; Shift moves farther |
| Move a focused conversation box | Arrow keys; Shift moves farther |
| Open a focused box | Enter / Space |
| Zoom and fit | Tab to minus, plus or **Fit tree**, then Enter |
| Fold branches, select a model, expand/collapse chat | Tab to the labeled control, then Enter |
| Add or remove a custom endpoint | **Map menu → Settings → Connections**, Tab to **Add endpoint** or a row's **Remove**; the model menu's **Custom endpoint settings** focuses Add endpoint directly |
| Swap model profiles | **Map menu → Settings → Models**, Tab to **Model profile**, Enter, then arrows and Enter; the chat, smart and quick thinking roles below edit the active profile |
| Select an exact passage | Tab to **Select passage in tutor reply N**, activate it, then hold Shift and use arrows in **Select tutor passage**; Tab to **Ask about selection** |
| Cancel passage selection / return from chat to map | Escape (close the current selection or form first) |
| Stop the selected conversation's reply | Tab to **Stop**, then Enter |

Optional **Settings → Vim canvas bindings** is off by default. With the map or box itself focused, `h j k l` act as arrows, uppercase moves farther, `=` or `+` zooms in, `-` zooms out and `f` fits. These aliases do not apply while typing, selecting text or using menus and dialogs. **Map menu → Help** also explains navigation.

## Saved data, upgrades, backup and restore

Startup prints the absolute **Data directory**. By default it is `$XDG_DATA_HOME/rabbithole`, or `~/.local/share/rabbithole` when XDG_DATA_HOME is unset. Set `RABBITHOLE_DATA_DIR` before starting to use another directory. Only one Rabbithole process may use a data directory at a time.

Startup also provisions a pinned SearXNG snapshot with `uv` in `<data directory>/searxng/venv`.
The first install needs internet access; later starts reuse it without downloading packages.
Its generated `searxng/settings.yml` enables HTML and JSON with a random secret and loopback-only
binding. Each app process runs its own child on an available `127.0.0.1` port and stops it on exit.
**Settings → Connections → Search** shows the managed URL. Save your own instance URL to replace
it, or choose **Use app-managed instance** to return to the default. **Test search** checks a JSON
search without saving the draft and explains network, HTTP and disabled-JSON failures. Custom
instances need `json` in `search.formats` in their `settings.yml`. Search setup failure leaves saved
trees and the rest of the app available; Settings shows the reason. Search tools are hidden until
the selected instance can answer JSON searches. App search backs image finding for every provider
and web search for custom endpoint models; Claude and Codex search with their own tools. Searches go to
the selected SearXNG instance and its upstream engines. Reply images load directly from their remote
hosts without a referrer, link to their source page, and show a placeholder when unavailable; the
app does not save copies. `GET /api/settings/searxng` reports the selected and managed URLs,
readiness and failures. Searches themselves still need internet access.

`trees.sqlite` holds trees, original messages, fixed inherited context, positions, layouts and artifact metadata. Videos and workspaces live alongside it. Files are unencrypted; new directories and database/credential files are owner-only. Rabbithole stores its ChatGPT OAuth connection here in `chatgpt.json`; its isolated Codex home and sessions also live here. An optional endpoint's URL/key live in `openai-endpoint.json` (mode `0600`), never in SQLite. Claude manages its own sign-in and sessions outside this directory. Keep backups private too.

Before upgrading the source, stop Rabbithole and make a full directory backup. After replacing the source, run `npm ci --include=dev` to refresh dependencies, then `npm start`. Do not upgrade a running instance. There is no auto-update.

The database records its schema version in SQLite's `user_version`. An older, unversioned database is copied to **trees.sqlite.backup-<UTC date>-<unique suffix>.sqlite** in the same directory before migration writes. The backup includes committed WAL data and stays at its original schema. Migration commits atomically; a failed migration rolls back. Startup prints the backup path. If backup or migration fails, startup stops so you can fix storage access or free disk space and retry. A newer, unsupported schema is refused without rewriting it. Ordinary restart/shutdown recovery marks unfinished jobs interrupted without creating a migration backup.

For a full backup, stop the server and use the actual directory printed at startup:

```sh
DATA_DIR="$HOME/.local/share/rabbithole"  # Replace if your printed location differs.
cp -a -- "$DATA_DIR" "$DATA_DIR.backup-$(date -u +%Y%m%dT%H%M%SZ)"
```

To restore that full backup, stop the server, move the current directory aside, then copy the backup into place:

```sh
mv -- "$DATA_DIR" "$DATA_DIR.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a -- /path/to/your/rabbithole.backup-DATE "$DATA_DIR"
npm start
```

To restore only an automatic migration backup, stop the server, move the current `trees.sqlite`, `trees.sqlite-wal` and `trees.sqlite-shm` (if present) into a separate recovery folder, then copy the chosen backup to `trees.sqlite` and set its permissions to `0600` (`chmod 600`). Keep the original backup. Never pair an older database with current WAL/SHM files. These automatic snapshots cover the database; use a full directory backup for matching video files and other local state. Use the matching older app if rolling back an upgrade, or let the current app migrate the restored database again.

## Privacy: what leaves your machine

Rabbithole serves the browser from loopback and bundles its fonts locally. It adds no telemetry or hosted storage. Opening saved trees does not require inference; startup runs local CLI/version/sign-in checks. The provider CLIs can perform their own authentication or other network activity, so this is not an enforced offline mode.

A question sends the conversation's content, inherited branch snapshot and selected passage to the selected provider (Claude, Codex or your custom endpoint). Branch preparation sends relevant parent history for summarization. Switching providers shares the saved discussion with the new provider. Diagram/video generation sends a separate bounded task and relevant excerpts to the selected worker provider; generation working messages and source stay out of the tutor's conversation. Video narration text goes to Microsoft's online Edge TTS service; its availability and quotas are outside Rabbithole's control. Audio, subtitle timing and VTT files remain locally in the private video workspace. No transcription-model call is needed. Videos render locally with network disabled in the sandbox; only owned, read-only narration assets are staged there. Ready playback uses the saved local MP4 without new provider or TTS calls. Tutor tools reach the web on the tutor's behalf: provider searches go through Claude or Codex, app searches go to the selected SearXNG instance, and page reading and image finding fetch from the pages' own hosts. On first use the app also downloads OCR language data, a pinned embedding model from Hugging Face for matching objects and stock pieces from GitHub and polyfork.dev, and keeps them on disk. Dependency installation and provider sign-in also use the network. Provider retention and plan policies apply to what you send.

Saved credentials are never returned to browser JavaScript. A custom key you type is sent to the local settings route, cleared from the form, and sent upstream only to that endpoint for model listing and inference. Host, Origin and CSRF checks protect local operations. Claude runs in a dedicated workspace with settings sources and slash commands disabled; its only tools are the enabled tutor tools: its own web search and page fetch, and Rabbithole's tools through a strict, per-turn local MCP configuration. Codex uses an isolated configuration with shell, patch and app tools disabled, a read-only sandbox and approval policy `never`; web search is on only when the tutor's web search is, and Rabbithole's enabled tools come through the same per-turn MCP server. Tutor Python runs in bubblewrap with no network. These settings are not an audited operating-system isolation boundary. Local saved data remains accessible to your account and other software with permission to read it.

## Troubleshooting

- **Node too old:** Install Node 24+ with npm, reopen the terminal and run `node --version`, then `npm start`.
- **Install or build failed:** Read the terminal error, check network access and disk space, run `npm ci --include=dev` in the project folder and retry `npm start`. Do not use `--omit=dev`: the first run needs the build tools. Saved trees are in the separate data directory.
- **Port already in use:** Use `npm start -- --port 4318` or `--port 0`. This does not change the data directory.
- **Data directory already in use:** Stop the other Rabbithole process, then restart. After a crash, wait about ten seconds for stale-lock recovery. Do not remove a live process's lock; a separate `RABBITHOLE_DATA_DIR` opens separate saved trees.
- **Wrong address or forbidden request:** Open the exact printed `http://127.0.0.1:PORT` address. A `localhost` alias, proxy or different port will fail the local boundary checks. Reload after a restart to refresh the browser's request token.
- **Claude missing or signed out:** Install Claude Code, ensure `claude --version` works in the terminal that starts Rabbithole, run `claude` to sign in, then reload Rabbithole (or choose **Check Claude sign-in** where shown).
- **Codex missing, consent declined or session expired:** Ensure `codex --version` works, then choose **Continue with ChatGPT** or **Reconnect ChatGPT**. Confirm your account/workspace permits plan sharing. Terminal sign-in and API keys do not replace Rabbithole consent.
- **Custom endpoint unavailable:** Use **Custom endpoint settings** and check the API root/path prefix and key; to change them, remove the endpoint and add it again. If you removed it, add it again or choose another model; Rabbithole never silently falls back.
- **Usage limit, unavailable model or failed reply:** The partial text and original question remain saved. Wait for quota, choose an available provider/model, then ask again. Sign-in success alone does not prove inference access.
- **No saved trees:** Check the printed data directory and the account/environment used to launch the app. A different `RABBITHOLE_DATA_DIR` or XDG_DATA_HOME opens a different store.
- **Backup/migration error or newer schema:** Stop other instances, check ownership and free disk space, and use the backup/restore steps above or the matching newer app. Keep the original files.
- **Video unavailable:** Text and saved trees remain usable. A missing render sandbox, renderer/browser dependency or missing media file cannot be fixed by replaying a paid request automatically; use the video's explicit retry/regenerate control once the dependency or file problem is resolved.

For development checks, run `npm test`, `npm run build` and `npx astryx doctor --built dist`. `npm run verify` builds the app, runs the five smoke browser scripts (isolated store, synthetic providers; needs `agent-browser`) in a small worker pool (`VERIFY_JOBS`) and prints a pass/fail table; live-provider scripts are listed as skipped and run only by hand, a script that fails once and passes on retry shows as flaky, and any failure exits non-zero. The scripts live in `scripts/verify/` (shared fixtures in `scripts/verify/lib/`). Pass script names (`npm run verify -- verify-branch-first.mjs`) to run a subset, or run one directly from the repository root with `node scripts/verify/verify-branch-first.mjs` after `npm run build`. Set `VERIFY_EVIDENCE=1` to write evidence under docs/verification instead of `.verify-output`. `npm test` includes a token lint that rejects raw color literals and font family names outside the theme. Implementation workflow is documented separately in [docs/ralph-workflow.md](docs/ralph-workflow.md); verification reports live in [docs/verification](docs/verification).
