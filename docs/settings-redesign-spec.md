# Settings redesign, model profiles and custom endpoints

Owner feedback of 2026-11-13, settled in a grilling session. The visual reference is the
mockup set (Settings with its States section, Usage, Read and Knowledge screens), which is
already done and is not part of this work.

## Problem Statement

Settings is one long scroll in which Interface, Models and Connections run into each other.
Switching between sets of models, for example an everyday set and a deep-study set, means
changing the chat, smart and quick thinking models one by one. Only one custom endpoint can
be saved, so a learner with a local server and a hosted gateway has to keep retyping URLs and
keys. The question bubble has its own colour picker even though every theme already supplies
a colour, so the two choices compete. Many surfaces draw an outline inside an outline
(inherited context, code blocks, diagram cards, the Knowledge panel and its concepts), which
makes the screen feel busy. The Knowledge map shows too many narrow topics (28 topics for 91
concepts, half of them holding one concept), so its regions turn into noise.

## Solution

Settings becomes four pages (Interface, Models, Connections, Usage) behind the existing side
nav. The Models page has a model profile picker at the top: one click swaps the chat model
default, smart model and quick thinking model together, and edits save straight into the
active profile. Connections lists any number of named custom endpoints that can be added,
edited, renamed, tested and removed; each shows under its own name wherever models are
chosen. The question bubble always takes the current theme's colour. Every surface follows
one rule: one frame per object, with tone or spacing (never a second border) inside a frame.
The quick thinking model is told to reuse known topics and keep topics broad, so new concepts
stop creating narrow ones. Usage is redesigned into a compact page with one breakdown table.

## User Stories

### Settings structure

1. As a learner, I want each Settings section on its own page, so that I only see the settings I came for.
2. As a learner, I want the side nav to show which page I am on, so that I keep my bearings.
3. As a learner, I want links that open Settings at a specific place (for example "Manage connections" from the model menu) to land on the right page, so that shortcuts still work.
4. As a keyboard user, I want Escape to close Settings and focus to land on the opened page's heading, so that the flow stays keyboard-friendly.
5. As a learner on a narrow window, I want the nav above the page content, so that Settings still fits.
6. As a learner, I want Settings pages to be compact but not cramped, so that I can scan them quickly without wasted space.

### Interface page

7. As a learner, I want Appearance (Dark, Light, System) at the top of the Interface page, so that the most common choice is first.
8. As a learner, I want to pick a theme from tiles that each show that theme's ground, question bubble, action colour and four branch inks, so that I can see what I am choosing.
9. As a learner, I want my question bubbles to always use the current theme's colour, so that I make one colour choice instead of two that can clash.
10. As a returning learner who had chosen a bubble tint, I want the app to quietly use the theme colour, so that nothing breaks after the update.
11. As a learner, I want a Keyboard section holding the Vim canvas bindings toggle and the map keys, so that keyboard help lives in one place.

### Model profiles

12. As a learner, I want a named model profile that holds the model and effort for the chat model default, the smart model and the quick thinking model, so that I can keep sets of choices.
13. As a learner, I want one picker at the top of the Models page that swaps the whole profile, so that changing all three roles takes one click.
14. As a learner, I want swapping profiles to leave conversations I already started on their saved model, so that a swap never changes an ongoing discussion.
15. As a learner, I want new learning trees, visuals and suggestions to use the active profile right after a swap, so that the swap takes effect immediately.
16. As a learner, I want changes to a role to save into the active profile, so that there is no separate save step or unsaved state.
17. As a learner, I want to create a new profile, so that I can build another set.
18. As a learner, I want to rename a profile, so that its name says what it is for.
19. As a learner, I want to duplicate a profile, so that I can make a variant without starting over.
20. As a learner, I want to delete a profile, so that old sets do not pile up.
21. As a learner, I want the last profile to be undeletable, so that there is always an active profile.
22. As an existing learner, I want my current chat, smart and quick thinking choices to become a profile named "Default", so that the update keeps my setup.
23. As a learner, I want the picker to show each profile's models, so that I can tell profiles apart before swapping.
24. As a learner, I want a profile whose model is no longer available to still swap in, with that role marked unavailable and failing visibly when used, so that nothing silently switches to another model.
25. As a learner, I want the roles shown as one compact table (role, model, effort), so that I see the whole profile at a glance.
26. As a learner, I want the smart model to keep its option to follow the chat model, so that profiles stay simple when I do not need a separate smart model.
27. As a learner, I want automatic suggestions on or off to stay one global setting outside profiles, so that swapping profiles does not toggle it.
28. As a learner, I want profile names to be unique, so that the picker is unambiguous.

### Custom endpoints

29. As a learner, I want to add several custom endpoints, each with a name, base URL and API key, so that I can use a local server and hosted gateways side by side.
30. As a learner, I want each endpoint to appear under its own name in every model menu (composer, chat default, smart, quick thinking, usage), so that I know which endpoint a model belongs to.
31. As a learner, I want endpoint names to be unique, with a clear error when one is taken, so that menus are never ambiguous.
32. As a learner, I want to rename an endpoint without re-entering its key, so that renaming is free.
33. As a learner, I want changing an endpoint's base URL to require its key again, so that my key never travels to a new host without me re-entering it.
34. As a learner, I want conversations and profiles to follow an endpoint through a rename, so that renaming never breaks anything.
35. As a learner, I want to test an endpoint and see its last result (model count and when, or the failure and what to do), so that I know which endpoints work.
36. As a learner, I want a failed test to stay visible until the next test or save, so that I do not miss it.
37. As a learner, I want removing an endpoint to ask for confirmation and explain that conversations and profiles using it keep their content but show as unavailable, so that I understand the effect.
38. As a learner, I want removing an endpoint to delete its saved key, so that no credential lingers.
39. As an existing learner, I want my saved endpoint to become the first entry named "Custom endpoint", with its conversations still working, so that the update keeps my setup.
40. As a learner with no endpoints, I want an empty state that offers "Add endpoint", so that the next step is obvious.
41. As a learner, I want add and edit to open inline in the list, so that I keep context instead of jumping into a dialog.
42. As a learner, I want the saved key never shown back to me, so that it cannot leak from the screen.

### One frame per object

43. As a reader, I want inherited context, code blocks, diagram cards and tables in a reply to sit on a tonal step without a border, so that the reply reads as one calm page.
44. As a reader, I want the branch form and its composer to show one frame, not two, so that the form feels light.
45. As a reader, I want the current row in Contents to be marked by a fill, not a ring inside the panel, so that the outline stays quiet.
46. As a reader, I want controls inside the composer (model chip, Stop) to carry no second outline, so that the composer has one edge.
47. As a learner, I want Knowledge concepts and the concept detail panel without outlines, so that the map and its details feel less boxed in.
48. As a learner, I want the learning tree map left as it is, so that what already works is untouched.

### Knowledge topics

49. As a learner, I want the quick thinking model to reuse an existing topic whenever one fits, so that the same idea does not spawn new topics.
50. As a learner, I want topics to stay broad and few, so that the Knowledge map shows a handful of meaningful regions.
51. As a learner, I want my existing topics left as they are, so that nothing I have is rewritten without me asking.

### Usage page

52. As a learner, I want one range picker that drives the total, the chart and the breakdown, so that every number on the page agrees.
53. As a learner, I want the total with its input, output and cache read split, where the split doubles as the chart legend, so that I read the summary and the key at once.
54. As a learner, I want the chart to switch between per period and cumulative, so that I can see both rhythm and growth.
55. As a learner, I want one breakdown table that switches between by model and by task, so that the page stays short.
56. As a learner, I want each breakdown row to show its share of the total as a small bar, so that I see what dominates at a glance.
57. As a learner, I want calls without reported counts shown as such and never estimated, so that the numbers stay honest.
58. As a learner, I want models from a custom endpoint shown with that endpoint's name, so that usage matches what I chose.

## Implementation Decisions

- **Provider names come from the server.** The models listing already returns each provider's label; every client surface (composer model menu, chat default, smart, quick thinking, usage) uses it. The four hardcoded client label maps go away. This is the prefactor that makes named endpoints cheap.
- **Custom endpoints are a list.** The credential store holds an ordered list of endpoints, each with a stable id, a unique name, a base URL, an API key and the last test result (ok with model count and time, or failure with a fixed actionable message and time). It stays in the owner-only app-data directory under the same credential boundary rules as today (loopback, Host/Origin checks, CSRF, JSON-only POSTs, no redirects, no user info, query or fragment in the URL).
- **Provider ids.** Each endpoint registers as its own provider. The migrated existing endpoint keeps the provider id `openai`, so saved conversations need no data migration; new endpoints get `openai:<stable id>`. The provider label is the endpoint name.
- **Migration.** On first start, an existing single-endpoint file becomes the first list entry named "Custom endpoint". The old file is read once and replaced.
- **Endpoint API.** Routes list endpoints (never returning keys), add, update and remove an endpoint, and test one. An update that changes only the name keeps the key. An update that changes the base URL is rejected without a new key. Duplicate names are rejected. Remove deletes the key and unregisters the provider; saved discussions stay and fail visibly when used, as today. Changing or removing an endpoint aborts its in-flight requests.
- **Model profiles.** A new store table holds profiles: id, unique name, and for each role the provider, model and effort (the smart role keeps its follow-chat model and follow-chat effort flags). A single row records the active profile. On migration the current chat, smart and quick thinking settings become a profile named "Default", made active.
- **Existing role routes act on the active profile.** The chat default, smart and quick thinking model/effort routes keep their contracts but read and write the active profile, so new learning trees, visuals, suggestions and compaction keep working unchanged. The automatic suggestions on/off flag stays global.
- **Profile API.** Routes list profiles with the active id, create (a copy of the active profile under a new name), rename, duplicate, delete (refused for the last profile; deleting the active one activates another), and activate. Activating never validates availability: an unavailable model shows the existing unavailable warning and fails visibly when used.
- **Settings pages.** The Settings request type keeps its section ids; each id now opens a page instead of scrolling. Map help merges with the Vim toggle into a Keyboard section on the Interface page.
- **Question bubble colour.** The bubble tint setting, its storage and its picker are removed; the bubble uses the theme's neutral question colour. A previously saved tint is ignored. The product and design docs drop the tint presets.
- **One frame per object.** A frame (border or ring) is allowed once per object. Inside a frame, parts are separated by tone or spacing. Inputs, the composer and floating sheets keep their stroke. This replaces the design doc's rule that cards and containers carry a seam border.
- **Topics.** The suggestion prompt tells the quick thinking model to reuse a known topic whenever one fits and to keep topics broad and few. Existing topics are not rewritten, and no merge action is added.
- **Usage.** Same data and range endpoints. The client shows one breakdown table with a by model / by task switch, with a share bar per row.
- **Docs.** The custom endpoint doc, product doc and design doc are updated in the ticket that changes their subject.

## Testing Decisions

- Good tests check external behaviour only: HTTP responses and what a fake provider receives, persisted state seen through the API after a restart, and what a learner sees in the browser. They never inspect private functions or SQL.
- **Server HTTP seam** (createApp with a temporary Store and fake providers, plus the fake OpenAI-compatible server): endpoint list, add, update, rename-keeps-key, URL-change-needs-key, duplicate name, remove, test result, migration from the single-endpoint file, provider ids and labels in the models listing; profiles create, rename, duplicate, delete, refuse-last, activate, migration of current role settings, and existing role routes acting on the active profile; the suggestion request carrying the reuse-and-broad topic instruction. Prior art: the endpoint switch, OpenAI adapter, credential boundary, chat defaults, default model and suggestions tests.
- **Browser verify scripts** in the existing style, one per UI ticket, covering dark and light: Settings pages and deep links; theme tiles and bubble colour; profile swap and management; endpoint list, inline forms, remove confirmation and failed-test state; one-frame rules on Read and Knowledge; Usage page. Prior art: the settings window, appearance, themes, chat defaults, model roles, custom endpoint, knowledge, read and usage dashboard verify scripts.
- The bubble tint unit test is removed together with the feature.

## Out of Scope

- The mockups themselves (done).
- The learning tree map's look.
- Merging or rewriting existing topics, or any manual topic tools.
- Per-conversation profiles or switching a conversation's model through a profile.
- Making automatic suggestions part of a profile.
- Syncing profiles or endpoints between machines.
- Changing the Claude or Codex connection flows.

## Further Notes

- Glossary terms used: model profile, custom endpoint, chat model, smart model, quick thinking model, effort, topic, theme, appearance.
- "Fail visibly, never fall back" already governs saved conversations whose provider is missing; profiles and endpoints reuse that rule.
