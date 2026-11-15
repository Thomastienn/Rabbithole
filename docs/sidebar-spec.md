# Sidebar replaces the top bar

Decided with the project owner on 2026-11-15 (grilling session). Refines the [focus and live media spec](focus-and-live-media-spec.md) and the [UI refresh spec](ui-refresh-spec.md) where they conflict; everything not named here keeps its current behavior.

## Problem Statement

The learner usually works with everything hidden: Focus mode hides the top bar, the Contents panel is collapsed, and only the map and the focused chat remain. From there:

- There is no way to start a new learning tree. New chat lives only in the top bar and the Library header.
- Bringing the top bar back is hard. Its reveal strip along the top edge is thin, and the browser's tab bar sits above it, so the mouse overshoots. Making the strip taller would cover the buttons at the top of the page.
- On the full-map view the Contents panel and its "Show contents" button are hidden by design, so the learner cannot reach the tree's conversations or resources from the map.
- The top bar takes vertical space from the chat and the map on every page.

## Solution

- The desktop top bar goes away. Every page has one **sidebar** on the left. Its top section holds the app's own controls: the app mark (to the Library), the views, Search, New chat and Settings. Below them is the page's own contents; inside a learning tree that is the tree's Contents (conversations and Resources), on the map view as well as the reading view. Pages without contents show only the top section.
- **Focus mode** now hides the sidebar. A thin strip along the full left edge of the window slides the sidebar out over the page when the mouse reaches it, and slides it away when the mouse leaves. `Ctrl+Shift+F` turns Focus mode on and off, so it pins the sidebar open or hides it again.
- `Ctrl+Shift+O` starts a new learning tree from any page, even while typing in the composer.
- Narrow screens keep today's small header with a menu button that opens a drawer holding the same controls and contents.

## User Stories

1. As a learner, I want the app's controls in a left sidebar instead of a top bar, so that the chat and the map get the full height of the window.
2. As a learner, I want the same sidebar on every page, so that I always find views, Search, New chat and Settings in one place.
3. As a learner, I want the sidebar inside a learning tree to show the tree's Contents below the app controls, so that conversations and resources sit next to navigation.
4. As a learner, I want the sidebar on the map view too, so that I can reach the tree's conversations and resources from the map.
5. As a learner, I want clicking a conversation in the sidebar while on the map to open it in the focused chat, so that I can jump straight to it.
6. As a learner, I want pages without contents, such as Library, Knowledge, Videos and Settings, to show only the app controls, so that the sidebar is never padded with empty space.
7. As a learner, I want a New chat button at the top of the sidebar, so that I can start a new learning tree from inside one.
8. As a learner, I want the Library header to keep its New chat button, so that the first thing on the Library still starts a tree.
9. As a learner, I want Focus mode to hide the whole sidebar, so that only the map and the chat remain.
10. As a learner, I want to bring the hidden sidebar back by moving the mouse to the left edge of the window, so that I can reach it without aiming at a thin target.
11. As a learner, I want the revealed sidebar to slide over the page rather than push it, so that the map and chat do not jump.
12. As a learner, I want the revealed sidebar to slide away when my mouse leaves it, so that it gets out of the way by itself.
13. As a learner, I want the left-edge strip to cover nothing on the page, so that it never blocks a button I am trying to click.
14. As a learner, I want `Ctrl+Shift+F` to keep toggling Focus mode, so that my habit still works.
15. As a learner, I want Focus mode remembered between visits, so that the app opens the way I left it.
16. As a learner, I want `Ctrl+Shift+O` to start a new learning tree from any page, so that I can begin a new topic with everything hidden.
17. As a learner, I want `Ctrl+Shift+O` to work while I am typing in the composer, so that I do not have to click out first.
18. As a keyboard user, I want to reach the hidden sidebar by keyboard, so that Focus mode never traps me.
19. As a keyboard user, I want focus to move into the sidebar when it slides out from the keyboard and back to where I was when it hides, so that I keep my place.
20. As a screen reader user, I want the sidebar to be a labelled navigation landmark with the Contents as its own region, so that I can jump to either.
21. As a learner who prefers reduced motion, I want the sidebar to appear and disappear without sliding, so that motion does not bother me.
22. As a learner on a narrow screen, I want the small header and menu drawer to stay as they are, so that the sidebar never eats my phone's width.
23. As a learner, I want the layout-save alert to stay visible in the sidebar, so that I still learn when a tree's layout fails to save.
24. As a learner, I want the layout-save alert to reach me even in Focus mode, so that I do not miss a failed save while the sidebar is hidden.

## Implementation Decisions

- The desktop shell band is removed. The shell renders one sidebar component on every page. It owns: the app mark linking to the Library, the view buttons (Read, Map, Knowledge, Videos, Library, Settings, with their existing current-page state), Search, New chat, and a slot for the page's contents.
- Inside a learning tree the contents slot holds the existing Contents panel, on both the reading view and the map view. The full-map view no longer hides it. Clicking a conversation from the map view opens it in the focused chat, the same as selecting it on the map.
- The separate Contents open/closed preference and the "Show contents" reopen button are removed; the sidebar has one hidden state, Focus mode. The old contents preference is ignored.
- Focus mode keeps its name, its saved preference and `Ctrl+Shift+F`, with the existing guard that the shortcut does nothing while typing in inputs and the composer. It now hides the sidebar instead of the top bar.
- Peek: while Focus mode is on, a strip a few pixels wide along the full height of the window's left edge reveals the sidebar as an overlay above the page when hovered. The sidebar hides again when the pointer leaves the overlay. Keyboard focus entering the strip's focus target reveals it the same way, and focus leaving the sidebar hides it. The strip renders nothing visible and covers no page controls. Under `prefers-reduced-motion` the sidebar appears and disappears without sliding.
- `Ctrl+Shift+O` runs the existing New chat action from any page, including while typing in the composer and other inputs, and prevents the browser's default. It ignores repeats and IME composition, like the Focus mode shortcut. It is disabled while a new tree is already opening.
- The layout-save alert moves into the sidebar. In Focus mode it still announces through its alert role; the peek does not need to be open for the alert to be read.
- Narrow screens keep today's header with the menu button and drawer; the drawer holds the same controls and contents as the sidebar.
- The Sidebar and Focus mode terms in the glossary describe the result.

## Testing Decisions

- Tests check what the learner sees and can do, through the shell's components, not layout pixels.
- **Shell component tests** (prior art: the shell tests and the chat navigation component test with the jsdom harness) prove: the sidebar renders the app controls on every page and the Contents inside a learning tree on both reading and map views; there is no top bar on desktop; Focus mode hides the sidebar and is saved; hovering or focusing the left-edge strip reveals it and leaving hides it; `Ctrl+Shift+F` toggles Focus mode but not while typing; `Ctrl+Shift+O` starts a new tree from any page including the composer, once per press, and not while one is already opening; clicking a conversation from the map view opens the focused chat; the layout-save alert keeps its alert role in Focus mode; the narrow-screen header and drawer are unchanged.
- Whether Chrome and Firefox let the page take `Ctrl+Shift+O` from their bookmark shortcuts is checked by hand once, at implementation; no browser script is added.

## Out of Scope

- An always-visible icon rail when the sidebar is hidden.
- A New chat icon on the map or in the chat.
- Resizing the sidebar.
- Changes to the narrow-screen layout.
- New views or changes to what each view shows.

## Further Notes

- If either browser refuses to give up `Ctrl+Shift+O`, record it on the ticket and keep the shortcut where it works; the sidebar's New chat button remains the fallback.
