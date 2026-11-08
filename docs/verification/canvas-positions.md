# Passage-linked canvas positions

Verified 2026-11-08 for `TreeTutor-7t3.7.2` against the built app with synthetic content and a synthetic compaction provider. No account credentials or external inference were used.

Boxes support pointer dragging and keyboard movement: focus a box, then Arrow moves 10 canvas units and Shift+Arrow moves 100. Movement is announced through a polite status region. Events from nested controls and focused-chat editing do not move boxes. Position writes are serialized, work while a conversation is generating, and show an explicit retry action on failure.

SQLite migrations add nullable coordinates without changing existing messages or branch anchors. New boxes are positioned only after measurement, to the right near their source excerpt, skipping occupied rectangles. Saved and manually moved boxes keep their positions when new boxes appear. Manual movement permits overlaps. Existing layouts are not rearranged when content changes.

Each outgoing connection uses its own excerpt handle keyed by the saved child relationship, retaining the canonical message ID and UTF-16 range. Long excerpts wrap and truncate in the overview. A child's labelled Reveal source passage action opens the parent, validates the exact saved message/range/text, highlights that range and scrolls it into view with keyboard focus. It never searches for matching text; repeated or emoji passages remain distinct. Stale sources produce an explicit unavailable message and no replacement highlight. This preserves compact overview boxes rather than embedding full transcripts in them.

## Checks

- `npm test`: 19/19 passed. New coverage exercises collision placement, migration from a legacy schema, invalid position requests, saving during active generation, database reopening and unchanged canonical anchors.
- `npm run build`: passed; existing bundle-size advisory remains.
- `node scripts/verify-tree-overview.mjs`: passed existing nested navigation, focused-chat viewport/focus return, generation continuity, new branch focus and mobile composer checks.
- `node scripts/verify-canvas-positions.mjs`: passed measured initial collision avoidance; Arrow/Shift+Arrow and pointer persistence; untouched sibling positions; movement announcements; exact wrapped/repeated/emoji source reveal after movement, scroll, reload and mobile resize; chat arrow isolation; failed-write retry; insertion of a new child around moved boxes without changing existing coordinates; and stale-source rejection. The check also measures connection/handle alignment. Browser-reported display coordinates allow a 0.01-unit rounding tolerance; stored coordinates are checked exactly.
- `npx astryx doctor --built dist` and `npx astryx doctor --built .`: zero failures. Existing font/source-convention advisories remain; the existing Vite alias serves the font locally.
- Impeccable detector on changed UI files: no deterministic findings. Desktop 1440×900 and mobile 390×844 screenshots reviewed and confirmed after correcting excerpt-handle alignment. Captures remain ignored under `.impeccable/review/`.

This increment saves box positions. Persistent pan/zoom and final focus-transition behavior remain `TreeTutor-7t3.7.3`.
