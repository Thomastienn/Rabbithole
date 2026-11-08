## Claude Code Subscription Integration

**Decision: Proceed with implementation.**

TreeTutor will follow the established DeepTutor integration pattern using the official, unmodified Claude Code binary.

- Users install Claude Code and authenticate directly with Anthropic.
- TreeTutor invokes the locally installed CLI and streams responses into its tutoring interface.
- Each user uses their own Claude subscription and usage limits.
- TreeTutor never collects, copies, or stores Claude authentication tokens.
- No shared accounts, credential proxying, or resale of Claude usage.

**Precedent:** HKUDS/DeepTutor already implements Claude Code subscription support through the official Agent SDK.

**Compliance:** Anthropic explicitly permits users to authenticate with the unmodified Claude Code binary, but third-party product restrictions still apply. DeepTutor's implementation does not establish explicit approval for TreeTutor.

**Task status:** Unblock Claude implementation and runtime testing. Retain provider eligibility clarification as a separate, non-blocking risk.
