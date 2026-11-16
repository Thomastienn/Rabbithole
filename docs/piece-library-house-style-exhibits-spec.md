# Piece library view, house style and web exhibits

Vocabulary follows `GLOSSARY.md` (set piece, piece library, house style, focal object, exhibit, cut, cut audit, resource). Decisions are recorded in ADR 0005, building on ADR 0001 (live cuts in an offline sandbox) and ADR 0002 (audited cuts and shared set pieces).

## Problem Statement

The learner cannot find the piece library: it hides as a tab inside Videos, and even there it holds only 2D pieces, because the 3D forms that 3D cuts draw are never saved. Videos look like several artists drew them: flat Fluent emoji, faceted low-poly Polyfork models, model-drawn SVG and three.js meshes sit side by side, so one object looks like a cartoon and the next like a sketch or a photo. Many cuts also carry so many labels, each with its own text, that the learner, already reading the subtitles, cannot tell where to look. And videos can only show what the model draws: a real photograph, a real quote or real footage that would teach more than a drawing is impossible.

## Solution

The piece library gets its own Pieces view in the sidebar. Its cards show stills of each set piece's 2D and 3D forms, with paging and a search that matches by meaning; opening a card shows both forms live, the 3D form turning and draggable. Every set piece is saved with both forms, so 3D cuts reuse and improve pieces just as 2D cuts do.

Every drawn object in a visual or video follows one house style: detailed flat illustration in 2D, stylised Blender-like modelling in 3D. The Fluent and Polyfork catalogs are retired; objects are drawn and reused through the piece library, and an old piece that misses the house style is redrawn the next time a video reuses it. Manim cuts draw math only.

Cuts direct attention to one focal object at a time while the narration explains it. Labels become short-lived attention cues that fade once the point lands; an overview may show the whole scene unlabelled. Manim cuts keep their own text rules.

When a real view teaches more than a drawing, a video may show an exhibit: a web image, short quote or video clip, framed as real, with a short dim source line. Exhibits become resources of the learning tree. The planner decides whether a clip plays its own sound; when it does, narration pauses.

## User Stories

1. As a learner, I want a Pieces button in the sidebar, so that I know the piece library exists and can open it directly.
2. As a learner, I want each piece card to show a picture of the piece, so that I can recognise it without opening it.
3. As a learner, I want a card to show both the 2D and the 3D form of a piece, so that I can see the piece looks like the same object in both.
4. As a learner, I want a card for a piece with only a 2D form to say so plainly, so that older pieces are not shown as broken.
5. As a learner, I want the cards to load quickly even with hundreds of pieces, so that browsing the library stays smooth.
6. As a learner, I want the library split into pages, so that a large library stays manageable.
7. As a learner, I want to search the library, so that I can find a piece without paging through all of them.
8. As a learner, I want search to match by meaning, so that "rocket" finds a piece named "launch vehicle".
9. As a learner, I want search to still work by name and description when no embedder is available, so that search never silently returns nothing.
10. As a learner, I want a clear message when a search finds no pieces, so that I know the search ran.
11. As a learner, I want to open a piece and see its 2D form drawn live, so that I can see it at full quality.
12. As a learner, I want the opened piece's 3D form to turn slowly, so that I can see it from every side without doing anything.
13. As a learner, I want to drag the 3D form to spin it, so that I can inspect the side I care about.
14. As a learner, I want the opened piece to list the saved videos that use it, so that I can see where it appeared.
15. As a learner, I want the piece view to stay read-only, so that I cannot break a piece future videos rely on.
16. As a learner, I want the piece previews to run in the same isolated frame as videos, so that model-written code never reaches the app.
17. As a learner, I want the library empty state to explain that videos fill it, so that an empty library does not look broken.
18. As a learner, I want the Pieces view to work by keyboard and screen reader like the other views, so that I can use it without a mouse.
19. As a learner, I want the Videos view to stop carrying a Pieces tab once Pieces has its own view, so that there is one place to look.
20. As a learner, I want a 3D cut's recurring objects saved to the library, so that a later 3D video reuses them instead of drawing new ones.
21. As a learner, I want a reused piece to bring both its 2D and 3D forms, so that a video mixing 2D and 3D cuts shows the same object in each.
22. As a learner, I want a piece improved by a cut audit to replace its saved 2D and 3D forms together, so that the forms never drift apart.
23. As a learner, I want saved videos to keep how they looked when a piece is later improved, so that my library videos never change under me.
24. As a learner, I want every object in a video drawn in one house style, so that the video looks like one world.
25. As a learner, I want 2D objects drawn as detailed flat illustrations, so that they are clear and recognisable without looking childish or cluttered.
26. As a learner, I want 3D objects modelled like a clean Blender scene with believable proportions, so that they show the real thing accurately without photoreal noise or faceted low-poly shapes.
27. As a learner, I want visuals in tutor replies to follow the same house style, so that an object looks the same in a reply and in a video.
28. As a learner, I want no emoji or outside-catalog models in videos and visuals, so that nothing clashes with the house style.
29. As a learner, I want an old library piece that misses the house style to be redrawn when a new video reuses it, so that the library converges on one style without losing pieces.
30. As a learner, I want Manim cuts to keep their own look for math, so that equations and graphs stay as clear as they are now.
31. As a learner, I want Manim cuts to leave objects to the other cuts, so that no emoji appears in a math cut.
32. As a learner, I want each moment of a cut to direct me to one focal object, so that I know where to look while the narration speaks.
33. As a learner, I want overview moments that show the whole scene, so that I still see how the parts fit together.
34. As a learner, I want labels to appear only to draw my attention, so that the screen is not full of text competing with the subtitles.
35. As a learner, I want a label to fade once its point has landed, so that old labels do not crowd the next focal object.
36. As a learner, I want labels allowed to echo what the tutor just said, so that a key term can be seen as well as heard.
37. As a learner, I want the cut audit to flag labels that crowd the focal object, so that noisy cuts are trimmed before I watch them.
38. As a learner, I want the audit's text check to be a preference rather than a hard count, so that a cut that truly needs a few labels keeps them.
39. As a learner, I want the cut audit to flag objects drawn outside the house style, so that style drift is fixed before a cut plays.
40. As a learner, I want a video to show a real photograph when what the real thing looks like matters, so that I learn what it actually looks like.
41. As a learner, I want a video to show a short real quote with its source, so that I see the original words when they matter.
42. As a learner, I want a video to show real footage when it explains a phenomenon better than a drawing, so that I see it happen.
43. As a learner, I want an exhibit framed so it is clearly real, so that I can always tell a photo from an illustration.
44. As a learner, I want a cut to move, scale and turn an exhibit's frame within the scene, so that the exhibit fits the animation instead of covering it.
45. As a learner, I want an exhibit to show a short, dim source line, so that I know where it came from without it pulling my attention.
46. As a learner, I want each exhibit saved as a resource of my learning tree, so that I can open the original later.
47. As a learner, I want the planner to decide whether a clip plays its own sound, so that real sound plays when it matters and stays silent when it would compete.
48. As a learner, I want the narration to pause while a clip plays its own sound, so that two voices never speak at once.
49. As a learner, I want only the narration subtitled, so that subtitles stay consistent.
50. As a learner, I want an exhibit to look the same in the live video and in the saved MP4, so that my library keeps what I watched.
51. As a learner, I want videos to work as drawn-only videos when web search is not set up, so that exhibits are never required.
52. As a learner, I want a video to carry on without an exhibit when fetching or downloading it fails, so that one broken link does not fail the whole video.
53. As a learner, I want visuals in tutor replies to stay drawn-only, so that real photos in replies keep coming through reply layouts.
54. As a learner, I want exhibits kept out of the piece library, so that the library stays a collection of reusable drawn pieces.
55. As a learner, I want the video player sandbox to stay offline, so that exhibits never open a network path for model-written code.
56. As a learner, I want setup to install the clip downloader the way it installs Manim, so that clips work without manual steps.
57. As a learner, I want a clear setup message when the clip downloader is unavailable, so that I know why videos have no clips.

## Implementation Decisions

### Piece library view

- A new **Pieces** view tab joins the sidebar views beside Videos, using the same view-tab pattern. The Pieces tab inside the Videos view is removed; the piece library component moves to that new view.
- Cards show two stills: the 2D form and the 3D form. A piece without a 3D form shows the 2D still and a plain "2D only" note.
- Stills are rendered server-side when a piece is saved or improved, using the same still-rendering path the cut audit uses, and stored with the piece. Pieces saved before this change get stills backfilled, like the existing embedding backfill for unembedded pieces.
- The list API gains paging (page size and offset) and a search query. Search ranks by cosine similarity between the query embedding and each piece's embedding, reusing the existing nearest-pieces lookup; with no usable embedder it falls back to a case-insensitive text match on name and look. Results without a query keep newest-improved-first order.
- The detail view shows the 2D form live in the isolated player frame, and the 3D form live in a three.js canvas in the same frame, turning slowly and draggable to orbit. The player's piece message handler gains a 3D mode. The view stays read-only.

### Set pieces with 2D and 3D forms

- A set piece stores a 2D source and an optional 3D source in one entry. The pieces table gains the 3D source and the stills; existing rows have no 3D source.
- The set-piece step saves each recurring object's `<Name>3D` export with its 2D piece instead of discarding it, and offers both forms when a library match is reused. A variant derives both forms.
- Improving a piece replaces both forms together; each form is validated before saving.
- The piece library never holds stock pieces or exhibits.

### House style

- The house style is written once as a skill text in the existing prompts folder and given to the planner, set-piece writer, Remotion cut writers (2D and 3D), visual writers and the cut audit. The cut writers' "different videos look different" wording becomes "vary layout and metaphor, never the house style".
- Retire both stock catalogs from videos and visuals: the set-piece writer's choices become reuse, variant or new; plans, cuts and visuals no longer receive stock offers; cut and visual validation rejects stock piece IDs. Code that serves stock to the frame is removed once nothing calls it.
- Manim cuts no longer receive emoji pieces; their prompt says objects belong to Remotion cuts.
- The cut audit checks the house style from its stills and flags off-style objects as issues. When a reused library piece is flagged as off-style, the existing piece-improvement path redraws it for future videos.

### Focal object and text

- The planner's and Remotion cut writers' prompts carry the focal-object rule: one focal object at a time while the narration explains it; overviews may show the whole scene unlabelled; labels are attention cues that may echo the narration and fade once the point lands.
- The Remotion cut audit adds "labels crowding the focal object" under unnecessary distracting detail. There is no word or label count. Manim prompts and the Manim audit are unchanged.

### Exhibits

- A video plan may name exhibits per cut: kind (image, quote, clip), what to show, and for clips the wanted moment and whether its sound plays. The planner finds candidates with the existing web search tutor tool (image search for images); with no search configured the planner gets no exhibit option.
- A new server module, the **exhibit fetcher**, turns a planned exhibit into data for the cut: it downloads images, and downloads and trims clips to the planned seconds. It records each exhibit's URL, title and site. Any failure drops the exhibit and the cut is written without it.
- Clips are downloaded with `yt-dlp`, installed into the project-local Python environment by setup the same way Manim is, and trimmed with `ffmpeg`. Setup reports when the downloader is unavailable; videos then have no clips.
- The fetched media reaches the cut as data, the way stock models reached the frame, so the sandbox stays network-denied. The kit gains an exhibit component that frames the media as real, accepts position, scale and rotation from the cut, and draws the short dim source line. Cut validation still rejects raw image tags, URLs and loaders.
- When a clip keeps its sound, the narration track carries a pause for the clip's length, and subtitles show only narration. Muted clips play under the narration.
- Each exhibit is saved as a resource of the video's learning tree, with a kind for images, quotes or clips. Exhibits never enter the piece library.
- The background MP4 render receives the same exhibit data, so the saved video shows what played live.
- Visuals in tutor replies do not get exhibits.

## Testing Decisions

- Good tests check behaviour a caller sees: what the view shows, what the API returns, what the set-piece step saves and what validation accepts. They never check internal shapes. Model judgment (house style, focal objects) cannot be unit-tested, so tests check that the prompts carry the rules and that the audit's findings are acted on.
- **Pieces view (component):** extend the piece library component test: sidebar entry, stills on cards, "2D only" cards, paging, search with an empty result, and a detail view that sends both forms to the isolated player frame. Prior art: the existing piece library component test.
- **Piece routes (in-process HTTP):** extend the piece routes test: paging, meaning-based search with a fake embedder, text fallback without one, and detail returning both forms and stills.
- **Store:** extend the pieces store test for the 3D source, stills, paging and text search.
- **Set-piece step (unit):** extend the video piece library and video pieces tests: 3D forms saved, reused and improved together; no stock offered; an off-style flag on a reused piece triggers its redraw. Prior art: the existing piece-improvement test.
- **Plan and cut validation (unit):** extend the video plan test: plans with exhibits validate, cuts using the exhibit component pass, stock IDs are rejected, and prompts carry the house style and focal-object text. Prior art: the test that the planner carries Manim teaching notes.
- **Exhibit fetcher (unit, new):** a fake HTTP server and a fake downloader cover image fetch, clip download and trim, failure dropping the exhibit, and recorded source details. No real network.
- **Video job (in-process integration):** extend the video jobs test with fake providers: exhibits used by a video are saved as resources of its learning tree, and a clip with sound puts a pause in the narration.
- **Setup:** extend the setup script tests to cover `yt-dlp` installation and its unavailable message, following the Manim setup tests.

## Out of Scope

- Editing, deleting or renaming pieces from the Pieces view.
- Exhibits in visuals in tutor replies.
- Subtitling or transcribing a clip's own speech.
- Licence checks or filtering of exhibits.
- A planner choice between several art styles.
- Using reference videos only to inform drawings, without showing them.
- Re-rendering saved videos in the house style.

## Further Notes

- The Polyfork catalog is low-poly and flat-shaded, and Fluent emoji are flat emoji; neither can be restyled into the house style, which is why both are retired rather than kept as a fallback.
- Drawing every object costs more model tokens per video than picking stock; the owner accepted that.
- Clip downloading depends on outside sites that change without notice; a failed download only drops that exhibit.
