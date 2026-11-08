## Claude Code Subscription Integration

**Current scope (2026-11-08): Deferred.** The user selected Codex-only for the current release. Do not implement Claude, request Claude login, or run Claude/cross-provider checks for this release. The route decision below is retained for later work; the former proceed instruction does not override this deferral.

TreeTutor will follow the established DeepTutor integration pattern using the official, unmodified Claude Code binary.

- Users install Claude Code and authenticate directly with Anthropic.
- TreeTutor invokes the locally installed CLI and streams responses into its tutoring interface.
- Each user uses their own Claude subscription and usage limits.
- TreeTutor never collects, copies, or stores Claude authentication tokens.
- No shared accounts, credential proxying, or resale of Claude usage.

**Precedent:** HKUDS/DeepTutor already implements Claude Code subscription support through the official Agent SDK.

**Compliance:** Anthropic explicitly permits users to authenticate with the unmodified Claude Code binary, but third-party product restrictions still apply. DeepTutor's implementation does not establish explicit approval for TreeTutor.

**Task status:** Claude implementation, native-login prerequisites, runtime tests, cross-provider switching and eligibility follow-up are deferred in Beads. They do not block the Codex-only release. Resume only when Claude work is requested.
