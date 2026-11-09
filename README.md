# TreeTutor

Local saved learning trees on a map, with a chat side panel and focused child conversations. Requires Node 24+ and at least one user-installed provider CLI: `claude` (Claude Code, the default) or `codex` (protocol checked with 0.167.0).

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. New conversations use Claude: run `claude` in a terminal and sign in with your Claude plan, then choose **Check Claude sign-in**. TreeTutor runs the official CLI with its own login and removes `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from its environment, so it never falls back to API-key billing or reads Claude credentials. For Codex, choose **Continue with ChatGPT** and approve TreeTutor's ChatGPT plan usage in the official sign-in flow. No API key or shared Codex login is used. A completed reply verifies access for that request; a successful sign-in alone does not prove model entitlement. Account/workspace restrictions may prevent consent.

Trees and original messages save to `$XDG_DATA_HOME/treetutor` (default `~/.local/share/treetutor`). OAuth credentials live there in an owner-only file, with a separate isolated Codex home/workspace. Keep this directory private; transcripts are stored unencrypted. `TREETUTOR_DATA_DIR` changes the data directory and `TREETUTOR_PORT` changes the loopback port. Only one process may use a data directory at a time.

Messages save before inference; partial replies checkpoint as text arrives. Restart marks unfinished replies interrupted. Failed replies keep their partial text and original question. Tree generation continues when changing trees or closing the browser; reopening recovers checkpoints. Enter sends, Shift+Enter adds a newline, and all tree/chat controls support normal Tab/Enter interaction. Stop targets the selected tree only.

The app serves built assets and binds only to `127.0.0.1`; Host, Origin and CSRF validation protect local operations. OAuth callback accepts cross-site navigation only with one-time validated state/PKCE. Credentials never go to browser JavaScript. Font files are bundled locally. Inference sends conversation content to the conversation's provider (Anthropic or OpenAI). Claude runs with tools, MCP servers, settings sources and slash commands disabled in a dedicated working directory. The tutor uses an isolated Codex configuration with shell, patch, JS, code-mode, app and web-search features disabled, read-only sandbox and no tool approval handler. This configuration is not an audited operating-system isolation boundary.

Subscription integration follows official [SIWC sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [token renewal](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions#refreshing-tokens) and [Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) guidance. The installed protocol schema is experimental.

The model menu in the chat header picks the provider and model for the next reply in that conversation. Switching provider starts a fresh provider session that receives the saved discussion; a failed reply rolls back to the last working model. Children inherit the parent's provider and model. Map layout saves at most once a minute and on leaving the tree.

```sh
npm test
npm run build
npx astryx doctor --built dist
```

Select text in a completed tutor reply and choose **Ask about selection**, or Tab to **Select passage in tutor reply N** for native keyboard selection. Review the passage, enter a question, then create a focused chat. The child inherits the parent model and a fixed compact context snapshot. The same controls work in nested children. Compaction sends the parent’s fixed inherited context and current conversation history to the conversation's provider on submission, producing one compact snapshot rather than appending ancestor histories. Later ancestor messages do not change saved snapshots. Failed preparation keeps your edited question available for retry. Saved child chats reopen from the same navigation; **Return to parent conversation** restores the parent.

See `docs/verification/root-chat.md` and `docs/verification/selected-passage.md` and `docs/verification/nested-branches.md` for verification evidence.

Building the rest of the product: the phases and the command for each are in [docs/ralph-workflow.md](docs/ralph-workflow.md#quick-reference-what-to-run-next).
