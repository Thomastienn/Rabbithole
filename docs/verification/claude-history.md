# Claude history transfer: blocked live check

Issue: TreeTutor-7t3.4.2. Date: 2026-11-09. **Acceptance remains unverified.**
External prerequisite: TreeTutor-kf5 (native subscription quota).

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

## Remaining acceptance work

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
