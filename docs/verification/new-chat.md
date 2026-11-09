# New chat opens a visible root that titles itself (TreeTutor-7t3.18)

Date: 2026-11-09. All evidence below is **fixture** (synthetic provider, temp SQLite); no live provider run.

## Behavior
- `POST /api/trees` takes no title. It creates a root titled `New chat` (201), or returns the existing unstarted root (200) so only one unstarted chat exists.
- The first saved user message of a root still titled `New chat` with no messages sets the title to the trimmed question, cut to 200 characters (the `Store.branch` rule). The `saved` stream event carries `title`; the page updates the header, map box and sidebar from it, and the state refresh after the turn confirms it.
- The client no longer has the tree-name form, the empty-map Start conversation state or the `started` gate. Choosing New chat opens the root box on the map, with its chat beside the map and the composer focused.

## Checks
| Check | Kind | Result |
|---|---|---|
| `npm test` (52 tests; `test/app.test.mjs` covers placeholder, reuse, 200-char title, `saved` title, later questions keep the title) | fixture | pass |
| `npm run build`; `npx astryx doctor --built dist` | build | pass, 0 failures |
| `scripts/verify-first-conversation.mjs` (one box, chat open, composer focused; close/reopen; repeat New chat reuses it; reload restores the same box; failed send keeps draft; retry titles header, box and sidebar) | browser fixture | pass |
| `scripts/verify-keyboard-journey.mjs` (Tab/Enter on New chat focuses composer; full journey) | browser fixture | pass |
| `verify-chat-sidebar`, `verify-chat-expand`, `verify-layout-restore` (panel modes, narrow window, restore) | browser fixture | pass |
| Ad-hoc 390×844 check: unstarted root opens full-width chat with focused composer, returns to the map with one box | browser fixture | pass |
| `verify-release-journey-live.mjs`, `verify-provider-continuity-live.mjs` | live | updated for New chat, **not run** in this task |

## Decisions
- One unstarted chat is enforced on the server, so double clicks and second tabs reuse the same chat.
- The placeholder check uses the title `New chat`, no messages and no branch row. A legacy root that someone named "New chat" and never used would be retitled by its first question. That case is accepted.
- The sidebar's New chat action and an unstarted chat's saved entry share the name "New chat". Both open the same chat.
