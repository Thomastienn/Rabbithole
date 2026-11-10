# Rename and delete acceptance — TreeTutor-sh8.3

Implemented and verified on 2026-11-10. Ralph owns the pending local commit;
the agent did not stage, commit or use a remote.

Titles can be edited inline in the chat header or through a saved chat's sidebar
actions. Enter saves; Escape cancels and restores focus. The server trims and
validates 1–200 characters. An explicit rename flag preserves even a manually
chosen `New chat` title when the first question arrives and across restart.

The selected conversation's Map menu deletes its branch, or the whole chat when
the root is selected. Every saved chat also has a sidebar delete action.
Confirmation names the target, counts its conversations, states there is no undo,
and initially focuses **Keep conversations**. A changed title/count rejects the
stale confirmation. Cancel/Escape restores the originating control. Successful
branch deletion opens its parent; chat deletion chooses the next saved chat in
sidebar order, falling back to the previous one, then New chat if none remain.
Background-chat deletion keeps the current conversation open.

`POST /api/trees/:id/rename` accepts `{title}`. Deletion uses
`POST /api/trees/:root/delete` with `{conversation, count, title}`; the root must
own the target and the server derives every descendant. The existing loopback,
Host, Origin, content-type and CSRF boundaries cover both routes.

The SQLite transaction removes artifacts, branch rows, messages and conversations
in foreign-key order, and removes dead fold/selection references from a surviving
root's layout. Parent messages, sibling anchors and other chats remain intact.
Owned files are staged reversibly for the transaction; startup restores staged
files after a pre-commit process exit or removes them after a committed deletion.
Active replies, compaction/model requests and all video attempts are aborted
after commit, so a failed transaction does not interrupt their work. Late reply
events cannot recreate rows. Client streams, previews, drafts and pending layout
positions are pruned; invalidated failed layout writes cannot requeue deleted IDs.

New video attempts live under `video-work/<artifact>/<attempt>`, so deleting their
owner removes every retry's private work and the published MP4. Legacy cleanup
uses the recorded current attempt ID; it does not guess ownership of old anonymous
orphan directories whose attempt IDs were overwritten before this change.

## Evidence

- `npm test`: **108/108 PASS**, no skips, failures or cancellations.
  [Chat-management integration tests](../../test/chat-management.test.mjs) cover
  cascade isolation, exact parent/sibling preservation, deferred-COMMIT rollback
  with byte-identical file restoration, actual process exit on either side of
  commit, ownership/CSRF, stale confirmation, active replies and late callbacks,
  compaction/model cancellation, video worker/render cancellation and stale layout
  retries. Existing video checks also run a real sandboxed Remotion MP4 render.
- `npm run build`: **PASS**, including TypeScript. Existing large-bundle advisory
  remains. `npx astryx doctor --built dist`: **20 pass, 2 existing font warnings,
  0 failures**. Impeccable detector: `[]`. `git diff --check`: **PASS**.
- [Browser results](chat-management-results.json): **12/12 PASS**, including
  keyboard and mouse rename in both locations, a real process/SQLite restart,
  safe initial focus, Tab trapping, Escape and focus return, background deletion,
  active-reply deletion, honest failure/cancel, next-chat/New-chat focus and the
  maximum-length unbroken title in a 390-pixel viewport. Desktop and narrow modal
  captures were visually reviewed. The report records source hashes.

The deletion tests and browser journey use **synthetic provider callbacks and
isolated synthetic conversations**. Browser layout/input/focus, loopback HTTP/SSE,
SQLite transactions, filesystem operations and process restarts execute for real.
No native Claude/Codex inference, authentication flow, learner data or physical
touch device was used or claimed for this issue.

Repeat with installed dependencies and Agent Browser:

```sh
npm test
npm run build
npx astryx doctor --built dist
node scripts/verify-chat-management.mjs
```
