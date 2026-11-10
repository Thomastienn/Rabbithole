# TreeTutor

TreeTutor is a local learning workspace. Ask a question, highlight an unfamiliar passage in the answer, and explore it in a connected child conversation. Your map, messages and branch context save on your computer.

## Install and start

Install [Node.js 24 or newer](https://nodejs.org/) with npm. Download or copy this project, open a terminal in its folder, and run:

```sh
npm start
```

On first run this installs missing dependencies with `npm ci --include=dev` and builds the app. Later starts rebuild when source, build configuration, the dependency lockfile or built assets change. Installation may need internet access. Keep the terminal open and open the address printed after **TreeTutor:**, normally **http://127.0.0.1:4317**. No provider is required to open saved trees.

The server always binds to `127.0.0.1`. If the port is busy, the message explains how to choose another:

```sh
npm start -- --port 4318
# Or let the operating system choose an available loopback port:
npm start -- --port 0
```

`TREETUTOR_PORT` also sets the port; `--port` takes precedence. Use the printed address, including its port. Keep the app on loopback; hosted deployment and a desktop installer are outside its scope.

Stop with **Ctrl+C** and wait for the terminal command to exit. Active replies end as interrupted, keeping their partial text; unfinished videos also become interrupted. Closing a browser tab leaves the server and its work running. Reopening never automatically restarts an interrupted or failed generation.

## Providers and sign-in

Startup reports the Node requirement, whether each CLI can run, Claude's native sign-in state and whether a ChatGPT connection is saved. These checks do not send a learning question or verify model entitlement or remaining quota. Provider setup is optional until you want a new reply. There is no API-key fallback.

**Claude (default):** Install the official [Claude Code CLI](https://code.claude.com/docs/en/setup). On Linux, macOS or WSL, the native install command is:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Run `claude` in a terminal and sign in with your Claude plan. Reload TreeTutor to recheck sign-in. Where **Check Claude sign-in** is shown in Settings or the model menu, it also refreshes the connection. TreeTutor uses the CLI's native login, strips `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from its environment, and does not read or copy Claude credentials.

**Codex:** Install the official [Codex CLI](https://developers.openai.com/codex/cli/):

```sh
npm install -g @openai/codex
```

In TreeTutor, open **Map menu → Settings → Continue with ChatGPT** and approve TreeTutor's use of your ChatGPT plan in the official sign-in page. A terminal Codex login alone does not connect TreeTutor: it uses its own consent and isolated Codex home. If the connection expires, choose **Reconnect ChatGPT**. Account or workspace policy can prevent consent; quota and model access can still prevent a reply after sign-in. The Codex app-server protocol was checked with CLI 0.167.0 and is experimental.

Use the compact model button in the chat header to select a provider and model for that conversation. Switching keeps the saved discussion and passes it to the new provider in a fresh session. A failed reply restores the last working selection. Children start with their parent's provider and model.

## Your learning journey

1. Choose **New chat**. Its map opens with one root conversation and a chat panel. Ask about a topic; the first question becomes its title.
2. Highlight a passage in a completed tutor answer and choose **Ask about selection**. Review the passage, enter your question and create the branch.
3. The child appears beside its source message and opens immediately. It receives the exact passage and a compact, fixed snapshot of relevant parent and ancestor context. Creating a branch sends that context to the chosen provider for summarization. Later parent messages do not change it; child discussions do not enter the parent's context.
4. Continue chatting or branch again at any depth. Drag empty map space to pan, scroll to zoom, drag a box to move it, and click a box to open it. Use the chevron to fold descendants; **Map menu** offers expand, collapse and keep-current-branch actions.
5. Expand the chat for reading or return to the map. On narrow screens the chat fills the workspace. **Return to parent conversation** opens the parent. Other conversations can reply while you navigate.
6. Open **Map menu → Learning trees** to revisit a saved chat. Messages save as they arrive. Layout changes save at most once a minute and when leaving the tree, so a sudden close can lose recent map adjustments. Renaming and confirmed deletion are available from chat actions.

Replies support formatted text, code, math and Mermaid diagrams. Requested videos appear with their generation status and local playback controls; they need the supported Linux render sandbox. A failed video keeps its request for an explicit retry.

## Keyboard controls

| Focus or action | Keys / control |
| --- | --- |
| Move between controls | Tab / Shift+Tab |
| Activate a button; choose a menu item | Enter / Space; arrow keys in menus |
| Send a question / add a newline | Enter / Shift+Enter |
| Pan the focused map | Arrow keys; Shift moves farther |
| Move a focused conversation box | Arrow keys; Shift moves farther |
| Open a focused box | Enter / Space |
| Zoom and fit | Tab to minus, plus or **Fit tree**, then Enter |
| Fold branches, select a model, expand/collapse chat | Tab to the labeled control, then Enter |
| Select an exact passage | Tab to **Select passage in tutor reply N**, activate it, then hold Shift and use arrows in **Select tutor passage**; Tab to **Ask about selection** |
| Cancel passage selection / return from chat to map | Escape (close the current selection or form first) |
| Stop the selected conversation's reply | Tab to **Stop**, then Enter |

Optional **Settings → Vim canvas bindings** is off by default. With the map or box itself focused, `h j k l` act as arrows, uppercase moves farther, `=` or `+` zooms in, `-` zooms out and `f` fits. These aliases do not apply while typing, selecting text or using menus and dialogs. **Map menu → Help** also explains navigation.

## Saved data, upgrades, backup and restore

Startup prints the absolute **Data directory**. By default it is `$XDG_DATA_HOME/treetutor`, or `~/.local/share/treetutor` when XDG_DATA_HOME is unset. Set `TREETUTOR_DATA_DIR` before starting to use another directory. Only one TreeTutor process may use a data directory at a time.

`trees.sqlite` holds trees, original messages, fixed inherited context, positions, layouts and artifact metadata. Videos and workspaces live alongside it. Files are unencrypted; new directories and database/credential files are owner-only. TreeTutor stores its ChatGPT OAuth connection here in `chatgpt.json`; its isolated Codex home and sessions also live here. Claude manages its own sign-in and sessions outside this directory. Keep backups private too.

Before upgrading the source, stop TreeTutor and make a full directory backup. After replacing the source, run `npm ci --include=dev` to refresh dependencies, then `npm start`. Do not upgrade a running instance. There is no auto-update.

The database records its schema version in SQLite's `user_version`. An older, unversioned database is copied to **trees.sqlite.backup-<UTC date>-<unique suffix>.sqlite** in the same directory before migration writes. The backup includes committed WAL data and stays at its original schema. Migration commits atomically; a failed migration rolls back. Startup prints the backup path. If backup or migration fails, startup stops so you can fix storage access or free disk space and retry. A newer, unsupported schema is refused without rewriting it. Ordinary restart/shutdown recovery marks unfinished jobs interrupted without creating a migration backup.

For a full backup, stop the server and use the actual directory printed at startup:

```sh
DATA_DIR="$HOME/.local/share/treetutor"  # Replace if your printed location differs.
cp -a -- "$DATA_DIR" "$DATA_DIR.backup-$(date -u +%Y%m%dT%H%M%SZ)"
```

To restore that full backup, stop the server, move the current directory aside, then copy the backup into place:

```sh
mv -- "$DATA_DIR" "$DATA_DIR.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a -- /path/to/your/treetutor.backup-DATE "$DATA_DIR"
npm start
```

To restore only an automatic migration backup, stop the server, move the current `trees.sqlite`, `trees.sqlite-wal` and `trees.sqlite-shm` (if present) into a separate recovery folder, then copy the chosen backup to `trees.sqlite` and set its permissions to `0600` (`chmod 600`). Keep the original backup. Never pair an older database with current WAL/SHM files. These automatic snapshots cover the database; use a full directory backup for matching video files and other local state. Use the matching older app if rolling back an upgrade, or let the current app migrate the restored database again.

## Privacy: what leaves your machine

TreeTutor serves the browser from loopback and bundles its fonts locally. It adds no telemetry or hosted storage. Opening saved trees does not require inference; startup runs local CLI/version/sign-in checks. The provider CLIs can perform their own authentication or other network activity, so this is not an enforced offline mode.

A question sends the conversation's content, inherited branch snapshot and selected passage to the selected provider (Anthropic or OpenAI). Branch preparation sends relevant parent history for summarization. Switching providers shares the saved discussion with the new provider. Diagram/video generation sends a separate bounded task and relevant excerpts to that provider; generation working messages and source stay out of the tutor's conversation. Videos render locally with network disabled in the sandbox. Dependency installation and provider sign-in also use the network. Provider retention and plan policies apply to what you send.

Credentials never go to browser JavaScript. Host, Origin and CSRF checks protect local operations. Claude runs with tools, MCP servers, settings sources and slash commands disabled in a dedicated workspace. Codex uses an isolated configuration with tools and web search disabled, a read-only sandbox and no tool approval handler. These settings are not an audited operating-system isolation boundary. Local saved data remains accessible to your account and other software with permission to read it.

## Troubleshooting

- **Node too old:** Install Node 24+ with npm, reopen the terminal and run `node --version`, then `npm start`.
- **Install or build failed:** Read the terminal error, check network access and disk space, run `npm ci --include=dev` in the project folder and retry `npm start`. Do not use `--omit=dev`: the first run needs the build tools. Saved trees are in the separate data directory.
- **Port already in use:** Use `npm start -- --port 4318` or `--port 0`. This does not change the data directory.
- **Data directory already in use:** Stop the other TreeTutor process, then restart. After a crash, wait about ten seconds for stale-lock recovery. Do not remove a live process's lock; a separate `TREETUTOR_DATA_DIR` opens separate saved trees.
- **Wrong address or forbidden request:** Open the exact printed `http://127.0.0.1:PORT` address. A `localhost` alias, proxy or different port will fail the local boundary checks. Reload after a restart to refresh the browser's request token.
- **Claude missing or signed out:** Install Claude Code, ensure `claude --version` works in the terminal that starts TreeTutor, run `claude` to sign in, then reload TreeTutor (or choose **Check Claude sign-in** where shown).
- **Codex missing, consent declined or session expired:** Ensure `codex --version` works, then choose **Continue with ChatGPT** or **Reconnect ChatGPT**. Confirm your account/workspace permits plan sharing. Terminal sign-in and API keys do not replace TreeTutor consent.
- **Usage limit, unavailable model or failed reply:** The partial text and original question remain saved. Wait for quota, choose an available provider/model, then ask again. Sign-in success alone does not prove inference access.
- **No saved trees:** Check the printed data directory and the account/environment used to launch the app. A different `TREETUTOR_DATA_DIR` or XDG_DATA_HOME opens a different store.
- **Backup/migration error or newer schema:** Stop other instances, check ownership and free disk space, and use the backup/restore steps above or the matching newer app. Keep the original files.
- **Video unavailable:** Text and saved trees remain usable. A missing render sandbox, renderer/browser dependency or missing media file cannot be fixed by replaying a paid request automatically; use the video's explicit retry/regenerate control once the dependency or file problem is resolved.

For development checks, run `npm test`, `npm run build` and `npx astryx doctor --built dist`. Implementation workflow is documented separately in [docs/ralph-workflow.md](docs/ralph-workflow.md); verification reports live in [docs/verification](docs/verification).
