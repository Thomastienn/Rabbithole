# Hidden-branch stubs (TreeTutor-u7v.7)

Fixture provider, local browser (agent-browser), 2026-11-10.

- `node --test test/fold-stubs.test.mjs`: pure `foldHierarchy` seam; one stub per hidden direct child, counts beneath it, nested folds (inner fold inside a hidden branch shows no stubs).
- `SCREENSHOT=... node scripts/verify-subtree-folding.mjs`: PASS. Stub sits inside the child's passage handle; "N hidden branches" text is gone; clicking a stub and pressing Space on a stub both expand the fold; focus moves to the fold toggle.
- `node scripts/verify-bulk-folding.mjs`: PASS (Collapse all, Expand all, Keep current branch).
- `verify-node-previews`, `verify-keyboard-journey`: PASS.
- `verify-tree-overview`, `verify-layout-restore`: fail identically on unmodified HEAD 7e2138e (pre-existing, not caused by this change).

Screenshot: `hidden-branch-stubs.png` (folded root with an eye-slash stub on its passage row).
