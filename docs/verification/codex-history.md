# Codex supplied history and independent sessions

Task: TreeTutor-7t3.4.1. Live run began 2026-11-08T21:34:19.167Z.
User explicitly authorized next-task implementation, necessary consent, and a local commit.
This supersedes the issue's earlier authorization blocker.

## Reproduce

Requires Node 24+, installed Codex CLI (tested: 0.167.0), dependencies, and existing
TreeTutor-owned ChatGPT consent. Stop TreeTutor before running:

```sh
node scripts/verify-codex-history.mjs
```

This is an explicit live check, excluded from `npm test`. It sends five synthetic
turns using the existing `Auth` token lifecycle. It takes the same data-directory
lock as the app to protect token refresh, creates an isolated temporary Codex
home/workspace, and closes that transport before releasing the lock. It does not
read shared CLI credentials, copy authentication into the temporary home, or edit
learner trees. Temporary synthetic provider sessions remain under the OS temp
directory; no tokens, account identifiers, or provider thread IDs are printed.
`TREETUTOR_DATA_DIR` and `XDG_DATA_HOME` follow the app's existing conventions.

## Supported request shape

Checked the installed CLI's generated JSON schema with
`codex app-server generate-json-schema --out <temporary-directory>`.
The [official app-server documentation](https://learn.chatgpt.com/docs/app-server#inject-items-into-a-thread)
also documents raw history injection and its persistence.

1. Initialize stdio using TreeTutor client metadata; acknowledge `initialized`.
2. `thread/start` with `cwd`, `approvalPolicy: "never"`, `sandbox: "read-only"`,
   tutor `baseInstructions`, fixed branch snapshot/selection, and optional model.
3. For a fresh thread with completed saved history, `thread/inject_items`:

```json
{
  "threadId": "<new thread>",
  "items": [
    { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "Assign our fictional learning tree a name." }] },
    { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "Our fictional tree is named Aster-731." }] }
  ]
}
```

4. Save the thread reference only after successful injection. `turn/start` sends
   only the new question in `input: [{type: "text", text, text_elements: []}]`.
   Existing threads use `thread/resume`; their history is not injected again.
5. Route events by thread and turn. Stop uses `turn/interrupt` for that owner.

The adapter previously omitted saved discussion on a fresh provider thread.
It now imports completed messages in order with their roles. Interrupted/failed
assistant fragments are excluded. A failed import starts no inference and saves
no incomplete thread reference, so retry can import into a fresh thread.

## Actual live results

The question itself contains none of the recall facts: “From our prior discussion
and inherited context, what is our fictional tree name, grove material, and exact
number of trees? Answer in one sentence. Do not guess missing facts.”

Names occur only in supplied assistant history. Separate fixed snapshots contain
`copper / 47` for A and `silver / 83` for B. No prior real model turn created either
name. All five turns used `gpt-6.1-sol` through `openai_chatgpt_plan`.

| Turn | Status | Elapsed ms | Text deltas | Characters |
| --- | --- | ---: | ---: | ---: |
| A fresh, imported history | completed | 3622 | 25 | 109 |
| A long lesson, stopped | interrupted | 3108 | 1 | 1 |
| B fresh, independent long lesson | completed | 60350 | 2391 | 10659 |
| A resumed after transport restart | completed | 2489 | 25 | 109 |
| B resumed after transport restart | completed | 2441 | 24 | 103 |

A's fresh answer and restart answer were identical:
“Our fictional tree is named Aster-731, the grove material is copper, and the grove
contains exactly 47 trees.”

B's lesson began: “Beryl-962 is our fictional learning tree. Its inherited home,
the silver grove, contains exactly 83 trees.” Its restart answer was:
“Our fictional tree is Beryl-962, the grove material is silver, and the grove
contains exactly 83 trees.”

Assertions passed for distinct provider threads, actual overlapping `turn/started`
events, B still active when A was interrupted after its first delta, A's
`interrupted` terminal status, and B's independent `completed` terminal status.
B's complete answer contained no A name; A's outputs contained no B name.
After closing/restarting the isolated transport, both sessions resumed and
recalled their own three facts. Script printed `result: PASS` and exited zero.

`model/list` returned nine non-hidden catalog entries: `gpt-6.1-sol` (default),
`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-6.1-terra`,
`gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5`. Only successful inference with
`gpt-6.1-sol` establishes access in this run; catalog presence does not prove
entitlement to the others.

## Automated checks and limits

Focused Codex/HTTP fixture tests, full `npm test`, TypeScript/Vite build, and
`git diff --check` passed. New fixture regressions verify role order, exclusion
of incomplete replies, one-time import before the current question, and no
saved reference/inference after rejected import. Fixtures prove transport
construction; the separate live run above proves semantic recall and overlap.
Build retains its existing bundle-size warning. No UI changes were made.

This is a small synthetic experiment against CLI 0.167.0, not a guarantee for
arbitrary histories, token limits, or future protocol versions. Restart means
provider subprocess restart with persisted synthetic sessions, not browser or
SQLite restart. Claude transfer, provider/model switching UI, and full release
verification remain separate Beads tasks. No API-key fallback was used.
