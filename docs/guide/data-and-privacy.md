# Data, backups and privacy

Back to [README](../../README.md).

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

Once, in the background after startup, Rabbithole merges duplicate concepts and topics that already exist in the knowledge graph. Before the first merge it copies the database the same way to **trees.sqlite.backup-merge-<UTC date>-<unique suffix>.sqlite**; restore it like a migration backup to undo the cleanup.

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

