# Videos: live progress, token record, moving cameras, true colours, reference photos

Decision record: ADR 0009. Builds on ADRs 0001, 0002, 0004, 0005 and 0006.

## Problem Statement

Making a video takes minutes, and the learner sees little of what is happening. The card shows a phase and a count, such as "3 of 9 cuts written", and a blinking dot. It never says which cut is being written, which set piece is being drawn, or that a cut is being repaired after a failed render or fixed after its audit. A long wait with no detail feels stuck.

The owner cannot see what a video costs. Every model call is recorded with its model and tokens, but not which stage of the video it served (plan, set piece, cut, audit, fix) or which cut, and no view shows a video's usage on its own. Understanding where tokens go would mean rerunning the pipeline with extra logging.

3D cuts look mostly static. The camera moves only between keys placed at sentence starts and eases to a stop at each one, so it sits still and then lurches. Objects themselves do not move. A 3D scene reads as a still picture.

The cut audit sees one still at each sentence end plus the last frame. It never sees an object arrive, a transition, or whether the scene moves at all, so problems that happen between sentence ends go unnoticed.

Real objects look wrong. Video colours come from a fixed palette of neutrals and four inks, and the validator rejects any other colour. In an Artemis video Earth had no blue, the rocket's orange tank became amber and its white boosters became paper. Set pieces of real objects are drawn from words alone, so details drift from the real thing. Sizes are also wrong: Earth and the rocket appeared at about the same size, although the learner asked for a scientifically accurate video.

## Solution

The video card shows a row for each cut with its number, title and live state (writing, narrating, auditing, fixing after its audit, repairing after a failed render, ready), and while set pieces are drawn it names the pieces in progress. The phase checklist stays above the rows.

Each video usage event records the stage it served and, where it served one cut, the cut's number. A video's card has a "⋯" button at the bottom that opens a token breakdown by stage and model; it stays hidden until opened. A one-off report lists what each existing video spent, by model, from the data already stored.

3D cameras always move. By default the camera orbits slowly; keys blend into one another instead of stopping at each. The planner writes a short camera note for each 3D cut, such as "slow, let the learner study the docking" or "lively orbit", and the cut writer follows it, moving more gently where the learner needs to focus. Set pieces get idle motion, such as a spinning planet or a drifting craft.

Each cut audit also sees one contact sheet: a single image of small frames spread evenly through the cut, each stamped with its time. The audit's list of things to look at is described as an aid, not a limit, so the smart model checks whatever looks wrong.

The planner can give a real object its true colour when that colour carries meaning, while abstract roles keep the palette inks. The planner marks each real-world object with an image-search query, and the server fetches one reference photo for it, which the set piece writer and the cut audit both see. The planner prompt gains a paragraph on believable relative sizes and honest framing when objects of very different scale share a cut.

## User Stories

1. As a learner, I want a row for each cut on the video card, so that I can see how far the video has come.
2. As a learner, I want each cut row to show the cut's number and title, so that I know which part of the story it is.
3. As a learner, I want each cut row to show its live state, so that I know whether it is being written, narrated, audited or is ready.
4. As a learner, I want to see when a cut is being fixed after its audit, so that a longer wait has a visible reason.
5. As a learner, I want to see when a cut is being repaired after a failed render, so that a repair is not hidden behind a finished count.
6. As a learner, I want the set pieces being drawn named on the card, so that I know what is being made before cuts start.
7. As a learner, I want a count of set pieces drawn out of the total, so that I can judge how long that step will take.
8. As a learner, I want the phase checklist kept above the cut rows, so that I still see the overall stage.
9. As a learner, I want cut rows to keep working after I reload the page, so that progress is not lost on a refresh.
10. As a learner, I want the cut rows to stay readable on a narrow screen, so that progress works in a small window.
11. As a learner, I want the cut rows to be announced politely to a screen reader as states change, so that progress is accessible.
12. As the owner, I want each video usage event to record its stage, so that I can see where a video's tokens go.
13. As the owner, I want usage events that served one cut to record the cut's number, so that I can compare cuts.
14. As the owner, I want a "⋯" button at the bottom of a video card that opens its token breakdown, so that the numbers are there when I want them and hidden otherwise.
15. As the owner, I want the breakdown to show input, output and cached tokens by stage and model, so that I can see which model spends what on which step.
16. As the owner, I want repaired, fixed and retried calls counted in the breakdown, so that it shows the real total.
17. As the owner, I want calls whose provider reported no usage marked as not reported, so that a gap is not read as zero.
18. As the owner, I want older videos' usage shown without a stage split and marked as such, so that missing data is not mistaken for none.
19. As the owner, I want a one-off report of what every existing video spent, by model, from the data already stored, so that I can study costs without rerunning anything.
20. As the owner, I want that report to state whether cached tokens are included in input, so that its totals are not double counted.
21. As a learner, I want the camera in a 3D cut always moving, so that the scene feels alive and reads as 3D.
22. As a learner, I want the camera to orbit by default, so that even a still subject shows its depth.
23. As a learner, I want camera moves to vary, such as orbits, pushes in, pulls out, pans and spins, so that cuts do not all look alike.
24. As a learner, I want the camera to flow smoothly between moves instead of stopping and starting, so that motion never lurches.
25. As a learner, I want the camera to move more gently where I need to study something, so that motion helps me focus instead of making me dizzy.
26. As a learner, I want set pieces to have idle motion, such as a planet spinning, so that the scene is never frozen.
27. As a learner, I want HTML labels kept where they stay true while the camera moves, as today, so that motion does not misplace them.
28. As the owner, I want the planner to decide each 3D cut's camera pace, so that the pace follows what the cut teaches.
29. As the owner, I want 2D cuts unchanged, so that this change stays limited to 3D.
30. As the owner, I want each cut audit to see a contact sheet of frames spread through the cut, so that it can judge entrances, transitions and motion.
31. As the owner, I want each contact sheet frame stamped with its time, so that the audit can say when a problem happens.
32. As the owner, I want the audit's list of things to check treated as an aid, so that the smart model flags anything that looks wrong.
33. As a learner, I want real objects in their true colours, such as a blue Earth, so that they look like themselves.
34. As a learner, I want abstract roles such as a highlight or a route to keep the palette inks, so that videos keep their shared look.
35. As a learner, I want near-white allowed, so that white objects such as boosters look white.
36. As the owner, I want a set piece to keep its true colours when another video reuses it, so that Earth stays blue in every video.
37. As the owner, I want ink roles of a reused piece remapped to the new video's roles, as today, so that reuse still fits each palette.
38. As the owner, I want Manim cuts to follow the same colour rules, so that math cuts can use a true colour too.
39. As a learner, I want real-world objects drawn from a real photo, so that their shape and details are accurate.
40. As the owner, I want the planner to mark which objects are real and give each a search query, so that only real objects get a photo.
41. As the owner, I want one photo fetched per real object before set pieces are drawn, so that the piece writer sees it while drawing.
42. As the owner, I want the cut audit to see the reference photos of the set pieces in its cut, so that it can spot a drawing that strays from the real thing.
43. As a learner, I want reference photos kept as resources of my learning tree, so that I can see what the drawings were based on.
44. As a learner, I want reference photos never shown in the video, so that they are not confused with exhibits.
45. As the owner, I want a video to go on without a photo when image search fails or finds nothing, so that a search problem never stops a video.
46. As a learner, I want real objects shown at believable relative sizes, so that a rocket is never as big as Earth.
47. As a learner, I want objects of very different scale framed honestly, such as a wide view where the rocket is tiny or a labelled inset, so that I get a true sense of scale.
48. As a learner who asks for scientific accuracy, I want the plan to take that request seriously, so that the video matches what I asked for.

## Implementation Decisions

### Progress

- The video job's live state gains a per-cut list: each cut's number, plan title and state. The states are writing, narrating, auditing, fixing, repairing and ready. A cut's state can move back, for example from ready to repairing, while the job phase still only moves forward.
- During the set pieces phase, the live state gains the names of pieces in progress and a drawn-of-total count.
- The live artifact carries these fields like the existing progress fields, so a reload restores them.
- The video card renders a row per cut under the existing phase checklist, with a polite live region. The bar position estimate stays as it is.

### Usage record

- Usage events gain two nullable fields: stage (plan, piece, improve, cut, narration, audit, fix, repair) and cut number. The fields are added by a store migration; older rows keep null.
- The calls that already log a stage name pass it, with the cut number where the call serves one cut, to the usage record.
- A store query returns a video's usage grouped by stage and model, for the video's current attempt, as the existing per-video join already does. Rows with a null stage are grouped as not recorded.
- The video card gains a "⋯" button at its bottom that opens the breakdown; it is closed by default and shows tokens only, no prices.

### One-off token report

- A research note lists every saved video with its call count and input, output and cached tokens by model, built read-only from the current database. It states whether input already includes cached tokens, checked against the provider adapters, before adding totals. It gives no recommendations.

### 3D camera and motion

- The kit camera adds a slow orbit by default, and blends between keys so that velocity carries through a key instead of easing to zero there. Keys may set a pace that scales the motion; the camera never fully stops.
- The plan gains a short per-cut camera note for 3D cuts, in loose words. The cut writer receives it.
- The 3D cut prompt's camera sentence is reworded: the camera always moves, orbits by default, varies its moves and follows the plan's camera note. The rest of that sentence, about labels and frame-driven motion, stays.
- The 3D cut prompt gains loose guidance that set pieces carry idle motion driven from the frame.
- 2D cuts and Manim cuts are unchanged.

### Cut audit

- Each cut audit also gets one contact sheet image: small frames spread evenly through the cut, each stamped with its time, tiled into one image. The existing sentence-end stills and the previous cut's last frame stay.
- Contact sheets are built from the same still renders the audit already takes, for Remotion and Manim cuts alike.
- The audit prompt gains a sentence that its list is an aid, not a limit, and that the model should flag anything else that looks wrong. Nothing in the list is removed.

### True colours (ADR 0009)

- The plan's style brief gains a map of true colours, each a name and a hex value. A palette role may map to an ink or to a true colour from that map.
- The validator accepts hex values only through the true colour map, and accepts near-white. It still rejects colours outside the inks, the neutrals and the plan's true colours.
- The planner prompt's palette line is widened: inks for abstract roles, true colours for real objects whose colour carries meaning.
- The house style skill's colour line and the "no pure white" rule are widened in the same way, not removed. The Manim colour rule follows.
- A saved set piece stores its true colours. Reuse keeps them, and still remaps its ink roles to the new video's roles.

### Reference photos

- A recurring object in the plan may carry a reference query when it is a real-world object.
- Before set pieces are drawn, the server runs the existing image search once per query and keeps the first usable photo. A failed or empty search leaves the object without a photo.
- The set piece writer receives the object's photo as an image when the chat model reads images. Otherwise it gets none.
- Each cut audit receives the reference photos of the set pieces in that cut.
- Reference photos are saved as resources of the learning tree and are never placed in a cut.

### Scale

- The planner prompt gains one paragraph: keep real things at believable relative sizes and distances, above all when the learner asks for accuracy; when objects of very different scale share a cut, frame them so the difference stays honest, with a wide view where the small one is tiny, a move between close and wide, or a labelled inset.
- No director skill is added.

### Prompt changes overall

- Prompt changes are additions or small rewordings. The only existing lines reworded are the 3D camera sentence, the palette line in the planner prompt, the house style's colour line and the "no pure white" rule. Nothing else is shortened or removed.

### Glossary

- New: True colour, Reference photo. Updated: Set piece (keeps its true colours).

## Testing Decisions

- A good test checks what the learner or owner sees or what the next stage receives: the rows the card shows, the breakdown the store returns, where the camera is at a frame, what the audit gets, what the validator accepts. It never asserts prompt wording (ADR 0007).
- Progress: extend the video progress unit test for per-cut states, including a cut moving back to repairing, and the card states component test for the rows and named pieces.
- Usage record: extend the usage history unit test so stage and cut number are stored and the per-video query groups by stage and model, with older rows as not recorded.
- Breakdown: extend the video cards component test so the breakdown is hidden by default and opens from the "⋯" button.
- Camera: extend the video camera unit test so the camera position changes between any two nearby frames, keeps moving through a key, and moves less under a slow pace.
- Plan: extend the video plan unit test so the camera note and reference query pass through, true colours are accepted only through the map, and stray hex values are still rejected.
- Piece reuse: extend the piece library test so a reused piece keeps its true colours and remaps its ink roles.
- Audit: extend the video audit unit test so the audit receives one contact sheet plus the existing stills, and the reference photos of its cut's pieces.
- Reference photos: an integration test following the video exhibits test with the fake image search, so a query fetches a photo that the piece writer receives and the tree keeps as a resource, and a failed search lets the video continue.
- Report, scale paragraph, idle motion guidance and the audit aid sentence: no test.

## Out of Scope

- Prices, a price table or dollar costs.
- Recommendations for cutting video cost; the owner studies the report.
- Camera or motion changes for 2D or Manim cuts.
- A director or cinematography skill.
- Showing reference photos to the learner inside a video.
- Backfilling stage data into existing usage events.
- Re-auditing a cut after its fix, which stays as today.

## Further Notes

- In the existing data, 7 of 9 saved videos join to their usage, with 16 to 46 calls each; one used about 775k input and 90k output tokens. 52 video events join to no current attempt.
- A contact sheet adds about one image per audit. Reference photos add one image per real object to the piece writer and to each audit of a cut that shows it; watch the breakdown for that cost.
- If videos still look flat or inaccurate after these changes, the next step is to look for an existing cinematography skill rather than write one.
