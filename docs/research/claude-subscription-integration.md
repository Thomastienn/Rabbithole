# Claude subscription integration investigation

Task: `TreeTutor-7t3.2`. Reviewed: 2026-11-07 (America/Edmonton).

Status: documentation investigation complete; TreeTutor-specific eligibility unresolved. No Claude executable, authentication flow, credential inspection, or model request was run. This is requirements research, not app implementation or provider approval.

## Conclusion

There is a documented subscription-backed CLI candidate, but no confirmed approval for TreeTutor's proposed tutoring interface. Do not label every third-party CLI integration prohibited, and do not treat successful subscription billing as product authorization.

Anthropic's help article says its June 15, 2026 changes were paused: SDK, `claude -p`, and third-party app usage continue drawing from subscription limits. Its October 7 update distinguishes plan sign-in from API-key calls using linked Console credits. Those credits do not turn API-key access into the subscription-login route required by this PRD. [Subscription usage updates](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)

The legal page permits platforms to run unmodified Claude Code with end users signing in through Anthropic's flow. Conditions include Commercial Terms, preserving built-in authentication methods, user-owned credentials/direct billing, and no resale or intermediation of usage. It separately forbids third-party apps offering Claude.ai login or routing plan credentials for users, and collecting or intermediating session tokens. [Product conditions and credential rules](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products)

The SDK overview still requires prior approval for third-party products offering Claude.ai login or plan limits. It also describes CLI subprocess operation as a way to drive the same agent loop. Merely invoking a user-installed binary is therefore insufficient evidence that TreeTutor's own chat UI falls outside that restriction. [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)

**Product blocker:** obtain Anthropic clarification or approval for the exact local subprocess design before claiming Claude subscription support. This is an inference from the boundaries above, not a claim that Anthropic has rejected TreeTutor. Research can close with this explicit blocker, tracked in `TreeTutor-7t3.13`; it blocks `TreeTutor-7t3.9` and Claude-dependent checks in `TreeTutor-7t3.4`.

## Capability evidence versus permission

| Area | Documented capability | Limit for TreeTutor |
| --- | --- | --- |
| Subscription login | Users can sign into Claude Code with eligible individual or organization accounts through its browser flow. API and cloud-provider authentication are separate options. [Authentication](https://code.claude.com/docs/en/authentication#log-in-to-claude-code) | Account access does not resolve third-party product eligibility. Leave credentials inside Claude Code; do not implement a TreeTutor token/login flow. |
| Non-interactive calls | `-p` runs a prompt without interactive chat. JSON output includes session metadata; `stream-json` supports streamed events and partial text. The headless guide calls this Agent SDK use through the CLI. [Programmatic CLI](https://code.claude.com/docs/en/headless) | Technical candidate only; installed-version compatibility and real inference were not tested. |
| Resume and models | CLI documents explicit `--resume` session IDs, `--fork-session`, `--model`, and optional disabling of session persistence. [CLI reference](https://code.claude.com/docs/en/cli-reference) | Use explicit per-conversation identifiers in any later prototype. Docs do not establish concurrent inference, imported-history fidelity, or cross-provider continuation. |
| Minimal startup | `--bare` avoids discovered customizations but does not read subscription OAuth credentials. [Bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode) | Do not propose `--bare` as a subscription isolation solution or silently supply an API key to make it work. |
| Text-only controls | `--tools ""` disables built-in tools; MCP tools require separate restriction. `--safe-mode` disables customizations while retaining normal authentication, with documented managed-policy exceptions. [CLI controls](https://code.claude.com/docs/en/cli-reference) | Candidate controls require installed-version and runtime verification; they do not alone prove absence of hooks, network access, or filesystem exposure. |

## Clarification to request

The legal page directs permitted-authentication questions to sales. The following is a proposed request only; no contact was made. [Authentication questions](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use), [contact sales](https://claude.com/contact-sales)

Describe TreeTutor as a loopback-only local web app for learning conversations. Each user installs and authenticates the unmodified Claude Code binary using Anthropic's native flow. TreeTutor would send prompts to `claude -p`, render streamed text in its own UI, retain local transcripts, resume explicit session IDs, and transfer conversation context when switching providers. It would neither collect credentials nor proxy shared accounts, resell usage, or host inference.

Ask whether this exact flow qualifies under the unmodified-binary allowance or requires prior product approval under the SDK restriction; whether any additional terms or authentication presentation are required; and whether ordinary individual tutoring usage through this interface is eligible for subscription limits. Preserve the response and its scope as evidence before selecting the route. User installation, local operation, and native sign-in should be stated as facts about the proposal, not asserted exemptions.

## Later verification boundary

After eligibility and implementation scope are resolved, a small synthetic prototype should verify subscription authentication without API fallback, streamed completion/error handling, explicit-session isolation, overlapping conversations, restart/resume, model switching, and imported context continuity. Preserve fixed child snapshots and canonical transcripts independently of CLI session IDs. Forking an entire session is not evidence of the PRD's compact inherited-context behavior.

Check installed CLI help/version and enforce text-only execution controls before sending prompts. Verify which user/project/managed customizations load rather than assuming an empty working directory isolates the process. Never copy cached OAuth tokens into TreeTutor or expose them to its browser frontend.

All runtime checks remain **NOT RUN**. No API-key alternative was adopted, no provider eligibility was assumed, and no PRD requirement was changed. Source disagreement is resolved only as far as the evidence allows: subscription usage is currently documented; permission for this particular product remains to be confirmed.
