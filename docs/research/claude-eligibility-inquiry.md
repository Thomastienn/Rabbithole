# Claude eligibility inquiry

Decision: `TreeTutor-7t3.13`. Prepared: 2026-11-07 (America/Edmonton).

Status: draft for user review; not sent. No provider approval received. Claude implementation and the dependent feasibility checks remain blocked. This document does not change the PRD or authorize implementation.

## Proposed message

Subject: Subscription eligibility for a local tutoring UI using unmodified Claude Code

Hello Anthropic team,

I'm planning TreeTutor, a local web app for learning through connected conversations. Before implementing Claude support, I'd like clarification on whether the following design is permitted with a user's existing Claude subscription, or requires prior approval.

The proposed design is:

- Each user installs the unmodified Claude Code CLI and signs in directly through Anthropic's native authentication flow. TreeTutor would not implement Claude.ai login, read or copy session tokens, or receive credentials in its browser UI.
- A server running on that user's machine, bound to loopback, invokes the installed CLI through `claude -p` and displays streamed responses in TreeTutor's own tutoring interface.
- TreeTutor stores learning transcripts locally and resumes explicit CLI sessions. Learners can create child conversations from selected passages, with compact inherited context, and switch between providers by supplying conversation context to the selected provider. Separate conversations may run concurrently within the user's applicable limits.
- TreeTutor would not host a shared inference service, pool accounts, resell usage, or pay for or intermediate inference billing. Each user's requests would use their own account and be billed directly under their agreement with Anthropic.
- The requested integration uses subscription authentication. API-key support is outside the current product scope. TreeTutor would not modify the CLI or remove its built-in authentication methods.

Your legal and compliance documentation allows end users to sign into unmodified Claude Code, including on platforms running it under the stated product conditions. It also restricts third-party applications offering Claude.ai login or routing subscription credentials. The Agent SDK overview requires prior approval for third-party products offering Claude.ai login or plan limits.

Could you clarify:

1. Does the exact local subprocess design above fall within the unmodified Claude Code allowance, or does displaying tutoring conversations in TreeTutor require prior product approval?
2. If permitted, which subscription plans, terms, authentication presentation, and distribution conditions apply? Does eligibility differ between personal use and distributing the app to other users?
3. Are ordinary individual tutoring conversations, concurrent conversations within plan limits, and supplied context from another provider eligible through this route?
4. If approval is required, what process should I follow, and what additional product details do you need?

Please identify any conditions or changes needed for this design. I would appreciate written clarification explicitly covering TreeTutor's own local UI invoking the user-installed CLI.

Thank you.

## Evidence needed to resolve the decision

Preserve the response, date, responding team, and the exact design they reviewed. Record applicable plans, terms, distribution scope, and any conditions. General CLI login instructions, successful inference, or absence of a reply do not establish approval for this wrapper.

If Anthropic confirms eligibility, record the approved scope before unblocking `TreeTutor-7t3.9` and `TreeTutor-7t3.4`. If they reject it or leave applicability unresolved, keep those dependencies and ask the user to agree on the product scope. A Codex-only milestone would require an explicit scope decision; API keys must not silently replace subscription support.

## Source check

Reopened both official pages on 2026-11-07. The documented product allowance and third-party authentication restrictions remain present; neither names TreeTutor. The need for clarification is our interpretation of their applicability to this proposal, not an Anthropic rejection.

- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) directs permitted-authentication questions to sales. Use its current contact link when sending.
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview#get-started) states the prior-approval restriction.

No contact, CLI invocation, authentication, credential inspection, or model request was performed for this task.
