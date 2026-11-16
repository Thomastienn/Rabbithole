# Visual steps, stock pieces and reply layouts

## Problem Statement

The learner hits four problems with how replies look:

- **Stepped visuals don't change.** In the latest stepped visual, every step looks the same. The visual hides and shows SVG groups through the `hidden` property, which only HTML elements have, so nothing ever hides. Even when hiding works, a step only pops parts in and out. Nothing moves or morphs, and the step duration the helper passes is never used. Models also get no clear guidance on when to show every stage at once and when to step.
- **Objects are drawn from scratch.** Visuals and videos redraw common objects (a satellite, a rocket, a house, a horse) every time. That costs output tokens, and video set pieces are the most expensive part of a video. The drawn objects are also lower quality than free, professionally made ones.
- **Visual CSS is bloated.** CSS is the largest share of a visual's source. Much of it repeats an id prefix on every rule, even though each visual already runs alone in its own frame.
- **Replies look the same.** Replies almost always use plain flow. Across 62 tutor replies, only 4 used a reply layout, always the figure. The tutor prompt pushes toward plain flow, the five layouts look flat, and some reply shapes have no layout, such as a key takeaway, a sequence of dated events, or a visual that needs the full width.

## Solution

- **Steps work.** Hiding an SVG part in a step really hides it. A step either continues the scene, morphing the elements already drawn, or changes to a new scene with a crossfade. A visual can mix both kinds. A visual whose stages belong side by side shows them all at once, with no steps.
- **Stock pieces.** Visuals and videos can use ready-made objects from two outside catalogs: Polyfork for 3D and Microsoft Fluent Emoji (flat) for 2D.
  - The tutor names the objects a visual needs. Rabbithole finds the closest stock pieces and offers them to the visual model, which places them by their ID.
  - A piece is downloaded the first time it is used and kept on disk.
  - A stock piece is tinted to the theme only when its real colour carries no meaning. A horse keeps its colours.
  - Videos prefer a fitting stock piece over the piece library or a newly drawn set piece.
- **Leaner CSS.** Visuals stop scoping every CSS rule to an id.
- **Better layouts.** The tutor picks the reply layout that fits each section with no bias toward plain flow. The existing layouts get a visual refresh. Three new layouts arrive: callout, timeline and wide.

## User Stories

### Steps

1. As a learner, I want each step of a stepped visual to look different from the one before, so that stepping actually teaches the process.
2. As a learner, I want a step that continues the scene to move, resize and recolour the parts already drawn, so that I see what changed instead of a new picture.
3. As a learner, I want a step that starts a new scene to crossfade, so that the change of scene is clear and not jarring.
4. As a learner, I want one visual to mix continuing steps and scene changes, so that a process with distinct phases can still morph within each phase.
5. As a learner, I want a visual whose stages read best side by side to show them all at once, so that I am not clicking through something I could take in at a glance.
6. As a learner, I want a visual whose later stages replace earlier ones in the same place to step, so that the screen does not pile every stage on top of the others.
7. As a learner who prefers reduced motion, I want steps and crossfades to switch instantly, so that motion never bothers me.
8. As a learner, I want stepped visuals I already have to start working after the fix, so that I do not have to regenerate them.
9. As a learner using the keyboard, I want Previous, Next and the step indicator to keep working through scene changes, so that the crossfade never traps or loses focus.
10. As the visual model, I want the prompt to state the rules for single view, continuing step and scene change without worked examples, so that the rules guide me without copying a template.

### Leaner visuals

11. As the project owner, I want visuals to stop repeating an id prefix on every CSS rule, so that each visual costs fewer output tokens.
12. As a learner, I want visuals to look the same after that change, so that saving tokens costs nothing visible.

### Stock pieces in visuals

13. As the tutor, I want to list the objects a visual needs in the visual request, so that Rabbithole can offer matching stock pieces.
14. As the tutor, I want the objects list to be optional, so that abstract visuals (a chart, a code trace) ask for nothing.
15. As the visual model, I want a short list of the closest stock pieces for each named object, with ID, title and type, so that I can choose one without searching a catalog of thousands.
16. As the visual model, I want to place a stock piece by its ID and get back a ready SVG element (2D) or a ready 3D object, so that I write one call and not the drawing.
17. As the visual model, I want to choose not to use any offered piece, so that a poor match never ends up in the visual.
18. As the visual model, I want an ID that was not offered, or a piece that cannot be fetched, to come back as a validation error, so that I can retry with another offered piece or draw the object myself.
19. As a learner, I want stock pieces to look right in light and dark themes, so that they never look broken against the background.
20. As a learner, I want a natural object such as a horse, a tree or food to keep its real colours, so that it never looks wrong.
21. As a learner, I want a generic object such as a box, a server or a coin to take the visual's theme colours when that helps, so that it fits the visual's emphasis.
22. As a learner, I want a visual that uses stock pieces to stay offline-safe and sandboxed, so that it never reaches the network itself.
23. As a learner, I want a visual whose stock pieces were fetched once to keep rendering offline, so that I can reread old replies without a connection.
24. As a learner, I want a 3D stock piece to show its error in words if it fails to load in the frame, so that I never see a blank box.

### Stock catalogs and storage

25. As the project owner, I want Polyfork as the 3D catalog and Fluent Emoji (flat) as the 2D catalog, so that stock pieces come from good-quality, permissively licensed sources.
26. As the project owner, I want each catalog index downloaded on first use at a pinned revision and checked against a recorded hash, so that a changed or tampered index is refused.
27. As the project owner, I want catalog indexes kept out of the repository, so that the repo does not grow by megabytes.
28. As the project owner, I want each catalog title embedded once with the local embedder, so that matching stays fast and needs no provider call.
29. As the project owner, I want a stock piece's file downloaded only when a finished visual or video first uses it, so that local storage grows only with use, not with the whole catalog (about 0.5 GB).
30. As the project owner, I want a downloaded piece reused from the local cache after that, so that each piece is fetched once.
31. As the project owner, I want matching to fall back to plain keyword matching when the embedder is unavailable, so that stock pieces still work before the embedding model is downloaded.

### Stock pieces in videos

32. As the video's set-piece writer, I want matching stock pieces offered beside the piece library's closest pieces, so that I can choose the best source for each object.
33. As the video's set-piece writer, I want `stock` as a fourth choice next to `reuse`, `variant` and `new`, and I want the prompt to tell me to prefer a fitting stock piece, so that videos use higher-quality objects and spend fewer tokens.
34. As the video's set-piece writer, I want a stock piece to be tintable but never turned into a variant, so that stock pieces stay read-only.
35. As a learner, I want 2D stock pieces in Manim cuts and 2D or 3D stock pieces in the other cuts, so that each cut engine uses what it can render.
36. As a learner, I want a stock piece that cannot be fetched to be retried, and then replaced by a library piece or a newly drawn one, so that the video still finishes.
37. As a learner, I want the background MP4 render to show the same stock pieces as live playback, so that a downloaded video matches what I watched.
38. As the project owner, I want stock pieces never saved into the piece library or replaced by a cut audit, so that the piece library keeps only pieces Rabbithole drew.

### Reply layouts

39. As a learner, I want the tutor to choose the layout that fits each section, so that comparisons, procedures and figures get their layout instead of plain text.
40. As a learner, I want most sections to stay plain flow, so that replies do not turn into a wall of boxes.
41. As a learner, I want a figure's media on either the left or the right, so that consecutive figures can alternate and the reply reads less monotonously.
42. As a learner, I want a figure whose media is wider than its text, so that a detailed visual gets the space it needs beside a short explanation.
43. As a learner, I want a callout layout for a key idea, a warning or a takeaway, so that the most important point stands out.
44. As a learner, I want a timeline layout for dated or ordered events, so that history and sequences read as a line, not a list.
45. As a learner, I want a wide layout that lets a visual span the full reply width, so that large diagrams and 3D scenes are not cramped.
46. As a learner, I want the existing comparison, steps, gallery and figure layouts to look more polished, so that replies look better.
47. As a learner on a phone, I want every layout, new or old, to fall back to plain flow at narrow width, so that nothing breaks on a small screen.
48. As a learner using a screen reader, I want each layout to keep its meaning in structure (a list for timeline and steps, a labelled region for callout), so that I get the same organisation.
49. As the tutor, I want each layout described by its shape and not by examples, so that I choose by content and do not copy a pattern.

## Implementation Decisions

### Visual frame runtime

- In the visual frame, setting the `hidden` property on an SVG element now reflects to the `hidden` attribute. The base style hides any element with that attribute. The fix sits in the frame and not in the prompt, so existing visuals start working when they re-render.
- The step helper accepts two kinds of step:
  - a plain step function, as today, which continues the scene;
  - a scene step, an object marked as a scene change with its own show function.
- For a scene step, the helper fades the visual's root out, runs the show function and fades it back in over the step duration. Under reduced motion and on first render the duration is 0, so the switch is instant. Controls, indicator, keyboard handling and focus behave exactly as they do now.
- Morphing in continuing steps uses the existing d3 transitions on the same elements: position, size, colour, opacity, and paths that share the same structure. No shape-morphing library is added.
- The frame provides a `stockPiece(id)` global. It returns a ready SVG element for a 2D piece or a ready THREE object for a 3D piece. It builds them from piece data the host delivers with the render message. The frame itself still makes no network request.
- The frame bundles three's glTF loader so the host can turn 3D piece data into objects. Model code still cannot reach any loader directly.

### Visual prompt

- The prompt describes three forms without worked examples:
  - **show everything at once** when the stages belong side by side;
  - **step** when later stages replace earlier ones in the same place;
  - within stepping, **continue** (keep and animate the same elements, never rebuild or toggle near-copies) or **change scene** (only when the layout really changes).
  Mixing continuing steps and scene changes is allowed.
- The prompt says the frame holds only this visual, so CSS selectors need no id scoping.
- The prompt says stock pieces keep their own colours. The model tints a piece to theme colours only when the object's real colour carries no meaning. This is an exception to the theme-variables rule.
- The prompt lists the offered stock pieces per object (ID, title, type). It says to use only those IDs, or none.

### Visual request contract

- The tutor's visual request gets an optional `objects` field: a short list of concrete object names, with a length and count limit alongside the existing field limits. The tutor rules describe it in one sentence.
- Before generating, the visual worker matches each object to the top 3 stock pieces and adds them to the visual model's request.
- Validation checks every `stockPiece` ID in the fragment. An ID that was not offered, or a piece that cannot be fetched, becomes a validation error. That error goes through the existing single retry.
- When a finished visual renders, the host gets the data for the pieces the fragment uses from a local app route and delivers it with the render message.

### Stock catalog module (new)

- A server module owns both catalogs. Its interface:
  - **index preparation**: download each catalog index at a pinned revision with a recorded hash, in the same way as the embedding model files, and refuse a mismatch;
  - **embedding**: embed each entry's title and type once with the local embedder and store the vectors;
  - **match**: object names in, top 3 entries per name out, each with ID, title, type, catalog and 2D or 3D. Falls back to keyword matching without the embedder;
  - **piece**: ID in, piece bytes out. It fetches on first use, writes atomically to a cache folder in the data directory, and reads from the cache afterwards.
- IDs are the catalog's own stable IDs. A Polyfork entry uses its slug. A Fluent Emoji entry uses the catalog name plus its asset name, so the two catalogs never collide.
- Storage holds the indexes (a few MB) plus only the pieces in use. The cache has no eviction, marked as a shortcut until real usage shows the need.
- Catalog entries and their embeddings are stored apart from the piece library's pieces.
- Licensing: Polyfork models need no attribution. The repository's credits cover both catalogs, and the app shows no credit line. Rabbithole caches the GLB mesh files only, never Polyfork's `.mjs` sources.

### Videos

- The set-piece writer gets stock matches for each planned object, next to the piece library's closest pieces.
- The choice per object becomes `stock`, `reuse`, `variant` or `new`. `stock` must name one of the offered stock IDs and writes no code. A `variant` of a stock piece is rejected. The prompt says to prefer `stock` when a piece fits.
- Cut code places stock pieces through a host-provided call, not a model-written loader, so the existing ban on loaders and static files stays in place.
- Manim cuts get 2D pieces only, as SVG. Other cuts get 2D and 3D.
- If a stock piece fails to fetch, the fetch is retried once. If it still fails, the writer is asked again with that piece removed, so it chooses `reuse` or `new`.
- The background MP4 render reads pieces from the same local cache as live playback.
- Stock pieces are never saved to the piece library. A cut audit may flag that a stock piece was placed poorly, but it never replaces the piece.

### Reply layouts

- The tutor rule changes from "plain flow unless a layout clearly helps" to choosing, for each section, the layout that fits its shape, with plain flow for running prose and most sections staying plain. There is no cap on layouts per reply.
- New directives:
  - **callout**: a highlighted block for a key idea, warning or takeaway;
  - **timeline**: ordered or dated entries, one heading per entry;
  - **wide**: one visual or image at full reply width.
- The figure directive gets options for media side (left or right) and a wide media ratio.
- The existing layouts get a design pass with the Impeccable skill.
- Every layout keeps the plain-flow fallback at narrow width and the existing no-nesting rule.
- Layouts are described to the tutor by shape only, with no example replies.

## Testing Decisions

- Tests check only behaviour visible from outside: what the frame shows, what the worker sends to and accepts from the model, what the catalog returns, and what the layout renders. They never check internal call order or private helpers.
- **Visual frame runtime**, extending the step-through tests (jsdom unit). Cases:
  - setting `hidden` on an SVG group hides it;
  - a scene step fades and runs its show function, and controls and focus are unchanged;
  - reduced motion gives 0 duration for both kinds of step;
  - `stockPiece` returns an SVG element or a 3D object from delivered data and reports a missing ID in words.
- **Visual generation**, extending the visuals prompts, failures and progressive tests (fake provider). Cases:
  - the new prompt rules are present;
  - `objects` in the request produces a shortlist in the model's input;
  - an unoffered ID or a failed fetch produces a `validationError` retry;
  - a visual without `objects` gets no shortlist.
- **Stock catalog** (new unit tests with a fake download and a fake embedder). Prior art is the embedder and piece-library tests. Cases:
  - a hash mismatch is refused;
  - match returns the top 3 per name and falls back to keywords without the embedder;
  - a piece fetches once, then comes from the cache;
  - IDs from the two catalogs never collide.
- **Video pieces**, extending the video-pieces and video-plan tests. Cases:
  - `stock` is offered and validated;
  - a stock `variant` is rejected;
  - a fetch failure retries, then falls back to `reuse` or `new`;
  - stock pieces are never saved to the piece library.
- **Reply layouts**, extending the reply-layouts component tests. Cases:
  - callout, timeline and wide render with the right structure;
  - figure media side and ratio options render;
  - narrow width falls back to plain flow;
  - the tutor rules carry the neutral layout wording.
- No browser tests. The design pass is checked by the Impeccable review, not by automated tests.

## Out of Scope

- Omitting closing tags to save tokens. It was measured at about 0.19% of visual characters for the always-safe trailing tags, and it risks broken nesting.
- Injected base CSS classes for visuals. Only the id-scoping prompt line is in scope.
- Shape-to-shape morphing libraries.
- Kenney, Quaternius, game-icons.net and other catalogs. They can come later, and Kenney and Quaternius would need an index Rabbithole builds itself.
- An in-app credit line for stock pieces.
- Cache eviction and size limits for stock pieces.
- A stock-piece browser in the UI.
- Check-yourself and tabs reply layouts.
- An ADR for stock pieces. The owner will ask for it with the other docs.

## Further Notes

- Data behind this spec comes from the owner's local library: 15 ready visuals and 62 tutor replies. CSS was 29% of visual characters, script 19% and closing tags 4.9%.
- Polyfork's index lists 3,347 models with ID, title, type, kit and triangle count. One sampled GLB was about 173 KB.
- Unverified: whether Manim's SVG import renders Fluent Emoji flat cleanly. Flat uses solid fills, so it is expected to.
- Glossary terms used: Visual, Step, Stock piece, Set piece, Piece library, Cut, Cut audit, Reply layout. Step and Stock piece were added during this planning session.
