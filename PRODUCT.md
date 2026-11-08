# TreeTutor

Local web app for learners following connected side questions. Source: PRD.md and accepted architecture in docs/architecture-proposal.md. This increment implements separate saved trees, root text chat and focused child chats from selected tutor passages. Claude eligibility, recursive ancestor context and canvas navigation remain separate tasks.

## Stack
React, TypeScript, Vite, Astryx; loopback Node server and SQLite. Codex app-server with app-owned Sign in with ChatGPT credentials; no API-key fallback.

## Use scene
Operate mode: frequent reading and asking questions on a desktop browser. Native keyboard controls, visible saving/generation failures, readable original transcripts. Assumptions delegated by user: quiet light surface, compact tree navigation, focused reading column. No decorative imagery needed for this text task.
