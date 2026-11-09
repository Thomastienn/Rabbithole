# Claude history transfer and provider continuity

Issue: TreeTutor-7t3.4.2 (now TreeTutor-7t3.9). Date: 2026-11-09. **Live acceptance passed 2026-11-09T18:53Z — see "Live provider continuity" below.**
External prerequisite: TreeTutor-kf5 (native subscription quota) — resolved 2026-11-09T18:46Z.

The current task and PRD explicitly resume Claude verification. They supersede
the historical Codex-only deferral in
`docs/research/claude-subscription-integration.md`. The selected route remains
the official, unmodified, user-installed Claude Code CLI with user-owned native
subscription authentication. Provider eligibility clarification is non-blocking;
this record does not claim third-party approval. No product UI was changed.

## Authentication and exact invocation

Installed `claude --version`: **2.1.319 (Claude Code)**.
Native `claude auth status`, parsed without printing account fields, returned:

```json
{"exitCode":0,"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","apiKeyEnvPresent":false}
```

`apiKeyEnvPresent` checks only whether `ANTHROPIC_API_KEY` is set. No credential
files were opened or copied by the verification code. The CLI used its native
authentication; no login/logout, token extraction or API-key fallback occurred.

One bounded live preflight was invoked through Node's `spawnSync` with executable
`claude`, the following exact argument array, and stdin `Reply with exactly: OK`:

```json
[
  "-p",
  "--output-format", "json",
  "--max-turns", "1",
  "--tools", "",
  "--safe-mode",
  "--strict-mcp-config",
  "--mcp-config", "{\"mcpServers\":{}}",
  "--setting-sources", "",
  "--system-prompt", "You are a text-only tutor. Do not use tools.",
  "--no-session-persistence"
]
```

Working directory: a fresh `mkdtempSync(join(tmpdir(),
'treetutor-claude-probe-'))` directory. Spawn options: `encoding: 'utf8'`,
`timeout: 60000`, default inherited environment and native authentication.
Only exit status, `is_error`, result text and `Object.keys(modelUsage ?? {})`
were printed; the raw response and account/session identifiers were not saved.
CLI help confirmed these flags locally. In particular, `--bare` was avoided
because this installed version's help says it excludes native OAuth.

## Observed live result

Observed by 2026-11-09T08:39:20Z:

```json
{"exitCode":1,"is_error":true,"result":"You've hit your 5-hour limit · resets 3:50am (America/Edmonton)","models":[]}
```

This is an external usage-limit failure, not evidence that the native route is
unsupported. No successful model inference or current model availability was
established. The closed prerequisite TreeTutor-apz records an earlier successful
`OK` response using `claude-opus-5-5`; that historical result does not establish
available quota in this run. No other model, account or authentication route was
tried after the limit response.

The reported reset corresponds to **2026-11-09T10:50:00Z** (03:50 Edmonton).
Wait for native quota to recover, or have the account owner resolve subscription
quota, then repeat this bounded preflight. A reported reset is not a guarantee
that the next request will succeed.

## Quota restored (TreeTutor-kf5)

Observed 2026-11-09T18:46:51Z, after the reported reset, using the identical
argument array, stdin, temp working directory and spawn options above. Native
`claude auth status` again returned `loggedIn=true`, `authMethod=claude.ai`,
`apiProvider=firstParty`, `apiKeyEnvPresent=false`. Result:

```json
{"exitCode":0,"is_error":false,"result":"OK","models":["claude-opus-5-5"]}
```

This live result resolves only the quota prerequisite. It does not prove history
transfer, resume or session isolation; that remains TreeTutor-7t3.9.

## Planned acceptance work (completed below)

After TreeTutor-kf5 is resolved:

1. Use synthetic content only. Import a prior Codex discussion and a separate
   fixed inherited snapshot into a fresh Claude session. Ask a question that
   omits the distinguishing facts and verify semantic recall from both sources.
   Record the exact history representation and actual successful model.
2. Resume that exact Claude session without resupplying its history. Exercise a
   second independent Claude session, including failure or cancellation in one,
   and verify that each session retains its own facts and routes its own reply.
3. Supply the resulting completed Claude discussion back to a fresh Codex
   thread, preserving roles and inherited context. Verify continuation using a
   fact introduced in Claude, absent from the new Codex question.
4. Record redacted invocation, results and limitations. Stop if the native route
   is unsupported; never substitute API-key access.

The preflight deliberately used `--no-session-persistence`; it **does not test
resume or session isolation**. The real session experiment must use supported
persistence and explicit session IDs. No supplied history, resumed session,
independent Claude sessions or Claude-to-Codex transfer was exercised this run.
The Codex app-data directory also failed a write-access preflight in this
sandbox; no app lock, token refresh or live Codex turn was attempted. The eventual
Codex check needs the existing app data lock and normal authorized write access
for its `Auth` lifecycle, as documented in `codex-history.md`.

## Automated baseline, separate from live evidence

Existing focused Codex fixtures: **6/6 passed**.
Full `npm test`: **35/35 passed**. These exercise fixture transports and local
persistence; they provide no live Claude or cross-provider semantic evidence.
No fixture tests were added or changed. `npm run build` passed, retaining the
existing Vite bundle-size warning. No UI changes required Astryx validation.

## Live provider continuity (TreeTutor-7t3.9), 2026-11-09T18:52–18:54Z

Script: `node scripts/verify-provider-continuity-live.mjs` (stop the app first; it
takes the app data lock for Codex OAuth). Raw report, synthetic content only, no
account or session identifiers: `provider-continuity-results.json`. Result **PASS**.

Route: unmodified Claude Code 2.1.319, native `claude.ai`/firstParty login, launched
by `server/claude.mjs` as `claude -p --output-format stream-json --verbose
--include-partial-messages --max-turns 1 --tools "" --strict-mcp-config
--mcp-config {"mcpServers":{}} --setting-sources "" --disable-slash-commands
--system-prompt <tutor + fixed inherited context> [--model <alias>]
(--session-id <uuid> | --resume <uuid>)`, cwd `<data>/claude-workspace`,
`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` removed from the child env, stderr
discarded. Codex used app-owned ChatGPT consent through `codex app-server`.
No API key, credential file access or login/logout of the real account.

History representation: a fresh Claude session receives completed saved messages
once as a JSON `[{role,text}]` prefix marked conversation data, plus the inherited
snapshot in the system prompt; resumed sessions receive only the new message. A
fresh Codex thread receives the same messages via `thread/inject_items`.

Models: Claude aliases `opus`, `sonnet` (default), `haiku` (fixed list; the CLI has
no catalog command); default runs reported `claude-opus-5-5`. Codex catalog:
gpt-6.1-sol (default), gpt-6-astra, gpt-6-sol, gpt-6-luna, gpt-5.6-sol,
gpt-6.1-terra, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5. Catalog is not an
entitlement claim.

Two separate processes share one temporary data dir; the second is an actual
restart of server, SQLite store and both provider subprocesses.

Process 1 (before restart):
- New trees default to Claude. Root reply streamed (18 text events) and
  `--resume` of the same session recalled Quill-482.
- Two independent Claude roots at once: the root was stopped mid-stream
  (`interrupted`) while the other completed with its own fact (Zircon-555) and
  no robot fact; distinct sessions; retry of the cancelled root resumed the
  same session and recalled Quill-482.
- Claude child and grandchild inherited provider/model; snapshots contained
  Quill-482 / Ember-77; grandchild recalled both from fixed context. Parent
  history unchanged by child turns.
- Keyboard switch (Space, arrows, Enter in the model menu, agent-browser) of the
  grandchild Claude to Codex while the root had an active Claude turn; switching
  the active root returned 409; the root turn completed on Claude with its
  original session. Fresh Codex thread recalled Quill-482, Ember-77, Kestrel-19.
- Auth loss (isolated empty `CLAUDE_CONFIG_DIR`, real CLI, real login untouched):
  switching to Claude while signed out returned 502 "Sign in to Claude or retry";
  switching while signed in then losing sign-in before the reply failed with
  "Claude Code is signed out. Run claude in a terminal and sign in, then retry."
  Provider, model **and Codex session** rolled back; history retained.

Process 2 (after restart):
- Codex model change gpt-6.1-sol → gpt-6-astra resumed the same Codex thread
  and recalled Onyx-303 (introduced in Codex) and Kestrel-19.
- Codex → Claude `opus`: fresh session recalled all four facts; Claude resume
  recalled Onyx-303. Claude → Codex: fresh thread recalled Flint-64, a fact
  introduced only in the Claude segment.
- Root resumed its original Claude session after restart; no child facts leaked.
- Grandchild: 16 messages, unique ids, unique user texts, strict user/assistant
  order; only the deliberate auth-loss reply is `failed`.

Defects found and fixed by this run (fixtures in `test/provider.test.mjs`):
1. A failed fresh Claude session (e.g. signed out) saved its session id, so the
   retry after sign-in would `--resume` a session that never existed. The
   session is now saved only after a completed reply; a resume that fails before
   any turn (`error_during_execution`, `num_turns` 0) clears it so the retry
   starts fresh with saved history. The CLI's `<synthetic>` "Not logged in"
   notice is no longer saved as tutor text.
2. A failed provider switch restored provider/model but dropped the working
   session. `trees.working_thread` now keeps it; rollback and switching straight
   back resume it.

Limitations: Claude model list is a fixed alias list; Claude sessions live in
the CLI's own project store (`~/.claude/projects`), so deleting it falls back to
saved-history replay; provider eligibility clarification remains as recorded in
`docs/research/claude-subscription-integration.md` (no third-party approval claimed).
