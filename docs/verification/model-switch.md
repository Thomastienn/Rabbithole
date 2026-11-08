# Saved-conversation model switching

Task: TreeTutor-7t3.10.1. Verified 2026-11-08 with Codex CLI 0.167.0.
The user authorized next-task implementation, provider checks, and a local commit.

## Behavior and contract

The labeled Astryx selector saves a model independently for each conversation.
A child initially inherits its parent's current choice. Changing either later
does not change the other. Selection does not rewrite messages, the provider
thread reference, or the fixed inherited snapshot.

The adapter pages through `model/list`, excluding hidden and explicitly non-text
entries. It uses returned model identifiers and labels without a hard-coded
entitlement list. With this Responses provider, that result can be a bundled
catalog; only completed inference verifies access for a request. See the
[official provider contract](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
and [model-list contract](https://learn.chatgpt.com/docs/app-server#models).
The selector explains that access is checked when the next reply responds.

Unknown choices and catalog failures preserve the previous selection. Selection
validation holds the conversation's existing activity lock, preventing a racing
turn or another model change. During a reply the selector is disabled and the
server rejects changes. Each turn explicitly supplies its captured model to
`turn/start` after resuming the original thread with fixed inherited instructions.

A failed reply preserves partial text and all prior history and restores the
last working model selection (or the provider default before a successful turn).
The additive SQLite `working_model` column preserves that fallback across
restarts and initializes existing conversations from their saved model. Completed
turns advance it; interrupted turns keep their current selection.

The live check exposed that `thread/resume` can return the prior model even
when a new choice is requested. The adapter saves the explicitly requested model
and sends it on `turn/start`; it uses resume metadata only for an unset choice.
A protocol-fixture regression test reproduces stale resume metadata.

## Checks

```sh
npm test
npm run build
npx astryx doctor --built dist
node scripts/verify-model-switch.mjs
node scripts/verify-model-switch.mjs --live
```

32 tests passed. Focused checks cover catalog pagination/filtering, captured turn
parameters, saved-thread reuse, fixed context, migration, persistence, child
defaults/isolation, unsupported choices, catalog failure, racing requests, and
retry after a failed model choice. Build and Astryx doctor passed with no doctor
failures. Existing bundle-size and theme-font diagnostic warnings remain;
the project aliases the theme font to self-hosted Figtree. Impeccable detector
reported no deterministic findings in the changed UI.

The default script uses synthetic provider fixtures and an isolated database and
browser. It checks keyboard-only model selection, reload persistence, active-turn
blocking, visible access denial and fallback, and 1280×900 / 390×844 layouts.
Both widths passed overflow and composer-visibility assertions; captures were
visually inspected. Fixture replies establish UI behavior, not model reasoning.

## Live result

Live run began 2026-11-08T22:37:52.995Z. The script used existing TreeTutor-owned
ChatGPT consent, the app's data-directory lock, and an isolated temporary database
and Codex workspace. It did not read or edit learner conversations. It imported
synthetic discussion naming Aster-731 and supplied fixed inherited context
containing copper / 47. The question contained none of those facts.

| Turn | Selected/requested model | Status | Elapsed ms |
| --- | --- | --- | ---: |
| Before switch | gpt-6.1-sol | completed | 2527 |
| After keyboard switch | gpt-6-astra | completed | 2979 |
| After transport restart and browser reload | gpt-6-astra | completed | 2910 |

All three replies were: “The fictional tree is named Aster-731, and the inherited
copper grove contains exactly 47 trees.” Assertions confirmed the same provider
thread, unchanged inherited snapshot and original messages, persisted choice, and
unchanged parent model. The live script printed PASS. Model identity here is the
requested contract value; the provider does not independently attest internal
routing. Denied access, concurrent changes, and full database reopening were
checked with deterministic fixtures/tests rather than deliberately disrupting
the live account. Temporary screenshots and synthetic sessions remain in the OS
temp directory; credentials, account identifiers and provider thread IDs are not
included in this evidence.
