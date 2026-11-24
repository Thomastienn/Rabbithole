# A search window for every conversation, the app version, a cleaner map and clearer web search copy

Decided with the project owner on 2026-11-24 (grilling session). Terms follow `GLOSSARY.md` (learner, learning tree, conversation, conversation node, address, passage, sidebar, sidebar rail, add-on, download, custom endpoint, tutor tool, exhibit). Respects ADR 0019 (Electron desktop) and ADR 0020 (add-ons installed on request).

## Problem Statement

Search finds only learning tree titles. It matches the title of each root conversation by substring and never looks at branch titles, passages or what was said, so in a large learning tree the learner cannot find the conversation where an idea came up. It opens as a small 640 by 480 palette that shows one line per tree, which feels generic and cramped.

The map's top-left corner holds a list of the trunk and its direct children ("1 Explaining concepts before solving problems · trunk", "1.1 …", "1.2 …"). It shows no deeper conversations, cannot be clicked or collapsed, and can take a quarter of the map's height, while the sidebar's Contents already lists every conversation, clickable, at every depth.

The app's version appears only inside the update banner, so the learner cannot check which build they run or whether it is the latest.

The web search add-on says "Lets the tutor search the web and cite what it finds." Claude and Codex search the web with their own tools, so the copy suggests they need it when they do not; yet the add-on still finds images and real photos for visuals and videos with every model.

## Solution

One floating search window, opened from the sidebar's Search button or Ctrl+K, searches every conversation of every learning tree: titles, passages, the learner's questions and the tutor's replies. It matches parts of words in any order and forgives small typos, and answers as the learner types. Results are grouped by learning tree, each with its address, title and a snippet with the match highlighted; on a learning tree's map, that tree's results come first. Choosing one opens that conversation and scrolls to the match.

The map's corner list is removed.

Settings shows the app's version at its foot, with the latest version when a newer one exists and a button to update. The sidebar rail's Settings dot, which already marks an available update, stays.

The web search add-on's copy says what it does for each kind of model.

## User Stories

1. As a learner, I want to search everything I discussed, not only tree titles, so that I can find where an idea came up.
2. As a learner, I want branch conversations found by their titles, so that deep branches are reachable.
3. As a learner, I want passages and my questions searched, so that I can find a branch by what I asked.
4. As a learner, I want the tutor's replies searched, so that I can find an explanation I remember.
5. As a learner, I want matches on parts of words in any order, so that "closure func dep" finds "functional dependency closure".
6. As a learner, I want small typos forgiven, so that "normalisaton" still finds normalisation.
7. As a learner, I want results as I type, within a moment, so that search feels instant even with hundreds of conversations.
8. As a learner, I want results grouped by learning tree, so that I see where each match lives.
9. As a learner, I want each result's address and title, so that I know which conversation it is.
10. As a learner, I want a snippet with the match highlighted, so that I can tell results apart.
11. As a learner, I want the current tree's results first when I search from its map, so that the closest match is nearest.
12. As a learner, I want choosing a result to open that conversation scrolled to the match, so that I land on the right words.
13. As a learner, I want the search window to float over the page and be tall enough to show many results, so that I can scan them.
14. As a learner, I want to open it with Ctrl+K or the sidebar's Search button, so that it is always at hand.
15. As a learner, I want to move through results with the arrow keys and open one with Enter, so that I never need the mouse.
16. As a learner, I want Escape to close it and return focus where I was, so that searching never loses my place.
17. As a learner, I want an empty search to show my recent learning trees, so that the window is useful before I type.
18. As a learner, I want a clear message when nothing matches, so that I know to try other words.
19. As a learner, I want deleted conversations gone from results, so that results never lead nowhere.
20. As a learner, I want new conversations and replies searchable as soon as they are saved, so that search is never stale.
21. As a learner using a screen reader, I want the result count and the selected result announced, so that I can search without seeing the list.
22. As a learner, I want the map's corner list gone, so that it never covers my conversation nodes.
23. As a learner, I want the sidebar's Contents to stay my list of conversations, so that one place does that job.
24. As a learner, I want to see which version of the app I run, so that I can tell whether I am up to date.
25. As a learner, I want to see the latest version when a newer one exists, so that I know what I'm missing.
26. As a learner, I want an Update button next to it, so that I can update from where I saw it.
27. As a learner, I want "Up to date" when there's nothing newer, so that I don't wonder.
28. As a learner running the app in a browser, I want the version shown without update controls, so that the information is still there.
29. As a learner using Claude or Codex, I want the web search add-on to say I don't need it for web search, so that I don't install it for nothing.
30. As a learner, I want the add-on to say it finds images and real photos for visuals and videos with any model, so that I know why I might still want it.
31. As a learner using a custom endpoint, I want the add-on to say it lets my model search the web, so that I know it's for me.

## Implementation Decisions

### Search window

- **Index.** A SQLite FTS5 table with the trigram tokenizer holds one row per searchable text: each conversation's title, its passage and branch question, and each completed message's plain text with markers removed. It is kept up to date in the same transactions that save, rename or delete these, and built once from existing data by a migration. A spike confirmed FTS5 trigram works on the `node:sqlite` driver in development; the ticket confirms it under the desktop build's Electron Node too.
- **Matching.** The query is split into words. Each word of three or more characters must match a part of the text, in any order; shorter words match only titles by prefix. When that finds nothing, a fallback ranks texts by shared trigrams, so a small typo still matches. Ranking: title matches first, then the FTS5 rank. When the request names the current learning tree, its results sort first.
- **Route.** The search route takes the query and an optional current learning tree. It returns up to 50 results, grouped by learning tree and newest first within equal rank. Each has conversation id, learning tree title, address, conversation title, which field matched (title, passage, question or reply), a snippet of about 160 characters around the match with match ranges, and the message id for message matches. Each keystroke cancels the previous request, and the client waits 120 ms after typing stops.
- **Window.** The Astryx command palette is replaced by a floating window: centred, about 760 px wide and up to 80% of the viewport's height, with a search field on top and grouped results below. It traps focus, closes on Escape and returns focus to where the learner was. Up and down move through results and Enter opens one. An empty query shows the six most recent learning trees.
- **Opening a result** opens the conversation in the focused chat and scrolls to the matched message, highlighting the matched words briefly. A title or passage match opens at the top.
- This is new UI: its ticket carries the `new-ui` label and a `Mockup:` line pointing at `docs/mockups/<issue-id>.html`, which the owner makes before it publishes.

### Map corner list

- The map's corner list (`InkLegend`) and the data function that only it uses are removed, along with their styles and tests.

### App version

- Settings' foot shows "Rabbithole <version>". In the desktop app, when the update state says a newer version exists, it adds "· Latest is <version>" and an "Update" button that does what the banner's Install does. When the launch check found nothing newer, it shows "Up to date". A failed check shows nothing extra.
- In a browser the version comes from the server and no update controls show.
- The sidebar rail's Settings dot stays as is.

### Web search add-on copy

- The add-on's `enables` text becomes: "Lets custom endpoint models search the web. With any model, finds images and real photos for visuals and videos. Claude and Codex search the web with their own tools."
- The custom endpoint offer and the Search settings text keep their wording.

## Testing Decisions

- Good tests check what the learner finds and sees, not query internals.
- **Seam 1: the search route in process**, `createApp` with a temp database holding a few learning trees. Assert that parts of words in any order match, that a typo matches through the fallback, and that branch titles, passages, questions and reply text are all found. Also assert that deleted conversations and markers are absent, that results group by tree with the current tree first, and that snippet ranges point at the match. Prior art: `test/store/tree-search.test.mjs`, `test/map/tree-search.test.mjs`.
- **Component tests** for the search window: keyboard movement, Escape returning focus, the empty query's recent trees, the no-match message, and opening a result. Also for the Settings version line in each update state, and the add-on copy. Prior art: `test/shell/update-banner.test.mjs`, `test/shell/addons-settings.test.mjs`.
- **Removal:** the map renders without the corner list. Prior art: the map component tests in `test/map`.

## Out of Scope

- A search box inside the map; the one search window covers it.
- Semantic search by meaning; that stays the tutor's `search_conversations` tool.
- Searching attachments' contents, the video library or the piece library.
- Checking for updates more than once per launch, or a manual "Check for updates" button.
- Any change to how updates install.

## Further Notes

- How desktop updates work today (owner's question, 2026-11-24). The app uses electron-updater and checks once per launch; the learner chooses Install, then Restart.
  - On Linux the AppImage's file name carries no version, so the update replaces that same file in place; launching it again runs the new build. If the learner renamed the file to include a version number, the update lands beside it instead. This is from electron-updater's documented behaviour, not yet tested on a real build.
  - On Windows the NSIS installer updates the per-user install silently, so shortcuts open the new build; running an old setup file again would reinstall the old one.
- The release version is stamped by CI as `1.0.<run number>`.
