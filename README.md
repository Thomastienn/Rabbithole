# TreeTutor

Local saved learning trees with Codex root and focused child conversations. Requires Node 24+ and a user-installed `codex` CLI (protocol checked with 0.167.0).

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. Create a tree, choose **Continue with ChatGPT**, and approve TreeTutor's ChatGPT plan usage in the official sign-in flow. No API key or shared Codex login is used. A completed reply verifies access for that request; a successful sign-in alone does not prove model entitlement. Account/workspace restrictions may prevent consent.

Trees and original messages save to `$XDG_DATA_HOME/treetutor` (default `~/.local/share/treetutor`). OAuth credentials live there in an owner-only file, with a separate isolated Codex home/workspace. Keep this directory private; transcripts are stored unencrypted. `TREETUTOR_DATA_DIR` changes the data directory and `TREETUTOR_PORT` changes the loopback port. Only one process may use a data directory at a time.

Messages save before inference; partial replies checkpoint as text arrives. Restart marks unfinished replies interrupted. Failed replies keep their partial text and original question. Tree generation continues when changing trees or closing the browser; reopening recovers checkpoints. Enter sends, Shift+Enter adds a newline, and all tree/chat controls support normal Tab/Enter interaction. Stop targets the selected tree only.

The app serves built assets and binds only to `127.0.0.1`; Host, Origin and CSRF validation protect local operations. OAuth callback accepts cross-site navigation only with one-time validated state/PKCE. Credentials never go to browser JavaScript. Font files are bundled locally. Inference sends conversation content to OpenAI. The tutor uses an isolated Codex configuration with shell, patch, JS, code-mode, app and web-search features disabled, read-only sandbox and no tool approval handler. This configuration is not an audited operating-system isolation boundary.

Subscription integration follows official [SIWC sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [token renewal](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions#refreshing-tokens) and [Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) guidance. The installed protocol schema is experimental. Claude eligibility remains unresolved; recursive ancestor context, canvas navigation and model/provider switching are later Beads tasks.

```sh
npm test
npm run build
npx astryx doctor --built dist
```

Select text in a completed tutor reply and choose **Ask about selection**, or use **Select passage** for native keyboard selection. Review the passage, enter a question, then create a focused chat. The child inherits the parent model and a fixed compact context snapshot. Compaction sends relevant parent history to OpenAI on submission. Failed preparation keeps your edited question available for retry. Saved child chats reopen from the same navigation; **Return to parent conversation** restores the parent.

See `docs/verification/root-chat.md` and `docs/verification/selected-passage.md` for verification evidence.
