# Troubleshooting

Back to [README](../../README.md).


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
- **Backup/migration error or newer schema:** Stop other instances, check ownership and free disk space, and use the [backup and restore steps](data-and-privacy.md#saved-data-upgrades-backup-and-restore) or the matching newer app. Keep the original files.
- **Video unavailable:** Text and saved trees remain usable. A missing render sandbox, renderer/browser dependency or missing media file cannot be fixed by replaying a paid request automatically; use the video's explicit retry/regenerate control once the dependency or file problem is resolved.
