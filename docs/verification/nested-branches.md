# Nested branch context verification

Task: TreeTutor-7t3.6.2. Date: 2026-11-07 America/Edmonton.

## Change and automated checks

Compaction now receives the current parent's fixed inherited snapshot, original selected passage and original question alongside its completed messages, new passage and new question. It emits one new compact snapshot through the existing compactor. It never loads live ancestors or descendant transcripts. The existing 1200-word request and 12000-character output acceptance bound apply at every depth. No schema, UI or depth-limit change.

The new HTTP regression failed against the previous code because inherited context was absent. It now creates seven branch levels with identical branch/chat endpoints, inspects provider input for exact selections/questions and fixed ancestor context, verifies unchanged parents and model inheritance, excludes later root changes and descendant discussion from parent input, compares full records after reopening storage and server, then continues chatting and branching after restart. A deterministic provider fixture tests context transport and persistence, not model summary quality.

All 14 tests pass with `npm test`. `npm run build` passes with the existing bundle-size warning. `npx astryx doctor --built dist` reports zero failures and two existing theme/font warnings. `git diff --check` passes.

## Live browser and Codex checks

Used existing app-owned ChatGPT consent and synthetic learner content. No credentials or private learner transcripts were copied into the repository.

- Created a root through the browser. Supplied the fictional fact that Orin has 43 silver leaves and requested exactly `A silver leaf.` The completed answer matched.
- Used Select passage, native Ctrl+A selection, Tab and Ask about selection. Created a child with the new detail that each leaf has 5 veins, requesting exactly `Five veins.` The completed answer matched. Its snapshot retained Orin and 43 silver leaves although its original messages did not repeat those facts.
- Used the same selection and creation controls in that child to create a grandchild from the exact `Five veins.` passage (offsets 0–11). Asked for tree name, leaf count and veins per leaf. The saved snapshot and completed response both said `Orin is a fictional tree with 43 silver leaves, each with 5 veins.` Root and child records remained exactly unchanged during nested branching and grandchild inference.
- Changed the root to Nova with 99 leaves through the existing composer. Full child and grandchild records remained identical. A subsequent grandchild question still returned Orin/43/5; its snapshot and the child's full record remained unchanged.
- Stopped and restarted the actual server after inference completed. Compared full root, child and grandchild API records before/after restart: exact match, including messages, IDs, source anchor, snapshot, provider thread and model. Grandchild source message still matched the child assistant message. All three models were `gpt-6.1-sol`.
- Reloaded the browser and reopened the saved grandchild with both completed replies and existing branch/chat controls. Final server listener is only `127.0.0.1:4317`; it remains running with synthetic verification conversations.

This verifies recursive context transport and one live two-hop example. Broader summary relevance, omitted-fact evaluation and startup latency remain TreeTutor-7t3.6.3.
