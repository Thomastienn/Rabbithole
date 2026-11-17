# Plain replies, reading room and the sidebar rail

Decided with the project owner on 2026-11-16 (grilling session), after comparing a Rabbithole reply with a ChatGPT reply to the same request ("explain everything on this note", a MATH 311 note on orthogonal diagonalization). Terms follow `GLOSSARY.md`; **sidebar rail**, **reading font** and **interface font** were added and **focus mode** was redefined in this session. Everything not named here keeps its current behavior.

## Problem Statement

Tutor replies feel rough and hard to learn from, even when they are correct and complete. Next to a ChatGPT answer to the same request, a Rabbithole reply reads like a textbook essay. The two replies were about the same length (roughly 1,000 words each), so length is not the cause. Three things are:

- **Dense paragraphs.** Each paragraph carries two or three ideas plus qualifiers and asides ("The note uses this as a previously established fact", "More precisely", "The converse, that every…"). The learner has to untangle each paragraph before moving on. The ChatGPT reply gives each idea its own short paragraph in simple sentences a child could follow, leads into each equation with a few words, and says what it means right after.
- **Distance from the learner's material.** The ChatGPT reply keeps pointing at the learner's own note ("your professor writes", "the green-highlighted column on page 2"). Ours mostly explains the topic in general.
- **Bookish typography.** Replies are set in a serif reading face at 17px with a 1.7 line height, in a 640px column, with no visual break between top-level sections. The ChatGPT reply uses the system font at 16px with a 26px line height, in a 768px column, with a divider line before each section. Dense serif text in a narrow column looks like an essay.

Two smaller frustrations came up in the same session:

- The learner cannot use their own system font anywhere in the app.
- Hiding the sidebar (focus mode) leaves only a floating menu button. Getting to any view, New chat, Search or Settings means opening the whole sidebar again.

The default tutor style also tells the tutor to "recommend one primary resource to learn more". That line produces filler closers such as "For further study, your lecture note is the primary resource…".

## Solution

- **Plain replies.** The tutor's fixed teaching guidance gains a short section on writing for understanding: whiteboard voice, short plain sentences with one idea each, room for each step, equations led into and explained, staying close to what the learner brought, and letting each answer take its own shape. It is guidance, not a template: no counts, no required headings, openings, endings or recaps.
- **No forced resource recommendation.** The default tutor style stops asking for "one primary resource to learn more". Replies still cite resources in the text where they back a claim.
- **Reading room.** Replies get a slightly smaller, more open setting: 16px text, line height about 1.6, a column about 720px wide, and a light divider plus extra space before each top-level section. This applies whatever reading font is chosen.
- **Font choices.** Interface settings gain two separate choices next to Appearance and Theme. **Reading font** offers Literata (the default, as today) or System. **Interface font** offers Archivo (the default, as today) or System. Code keeps its monospace face either way.
- **Sidebar rail.** Focus mode no longer hides the sidebar. It shrinks the sidebar to a narrow rail of icons: the toggle, New chat, Search, the five views, Library and, at the bottom, Settings. Clicking an icon goes there and keeps the rail. The floating menu button disappears. Narrow screens keep their drawer.

## User Stories

### Plain replies

1. As a learner, I want the tutor to write in short, plain sentences, so that I can follow each line on first read.
2. As a learner, I want each idea in its own small paragraph, so that I can take one step at a time instead of untangling a dense block.
3. As a learner, I want asides and qualifiers that do not help me understand right now left out, so that the main line of the explanation stays clear.
4. As a learner, I want side ideas left for me to branch into, so that the reply stays focused and I can still go deeper on any phrase.
5. As a learner reading math, I want a few words leading into each key equation, the equation on its own line, and a plain sentence saying what it means, so that I see both the symbols and the idea.
6. As a learner who shared notes or a problem, I want the tutor to point at the exact part it is explaining, such as the page, line or highlight, so that I can follow along in my own material.
7. As a learner asking a short question, I want a short answer, so that a quick question does not become an essay.
8. As a learner asking to "explain everything", I want full coverage written just as plainly, so that concise never means skipping parts I asked for.
9. As a learner, I want replies to vary in shape from question to question, so that the tutor does not feel like a program filling the same template every time.
10. As a learner, I want the tutor's voice to sound like a good tutor at a whiteboard, not a textbook, so that learning feels approachable.
11. As a learner who edited my tutor style, I want the new writing guidance to apply anyway, so that plain replies do not depend on my prompt.
12. As a learner, I want my tutor style to still be able to refine how the tutor writes, so that I keep control over teaching manner.

### No forced resource recommendation

13. As a learner, I want replies to stop ending with a generic "for further study" recommendation, so that answers end when the explanation ends.
14. As a learner, I want resources still cited in the text where they back a claim, so that I can check where facts come from.
15. As a learner on the default tutor style, I want this change to reach me without editing anything, so that I benefit from the improved default.

### Reading room

16. As a learner, I want reply text at a comfortable 16px with open line spacing, so that long replies are easy on the eyes.
17. As a learner, I want a slightly wider reply column, so that lines do not wrap so often and paragraphs look less like tall blocks.
18. As a learner, I want a light divider and extra space before each top-level section of a reply, so that I can see where one part ends and the next begins.
19. As a learner, I want the same spacing whichever reading font I choose, so that switching fonts does not undo the breathing room.
20. As a learner, I want code blocks, tables, layouts and visuals in replies to keep working in the wider column, so that nothing breaks or overflows.
21. As a learner on a narrow screen, I want the reply column to keep fitting the screen, so that the wider measure never causes sideways scrolling.

### Font choices

22. As a learner, I want to choose System as my reading font, so that replies use the font I am used to on my computer.
23. As a learner, I want to choose System as my interface font, so that the app's controls match the rest of my desktop.
24. As a learner, I want the two choices to be separate, so that I can, for example, keep Literata for reading and use System for the interface.
25. As a learner, I want each option labelled with the font's name, so that I know what I am picking.
26. As a learner, I want Literata and Archivo to stay the defaults, so that nothing changes until I choose otherwise.
27. As a learner, I want my font choices remembered in this browser, so that they survive reloads like my appearance and theme do.
28. As a learner, I want a missing or unreadable saved choice to fall back to the default font, so that a broken preference never leaves the app unstyled.
29. As a learner, I want a font change to apply immediately, so that I can compare without reloading.
30. As a learner, I want code to stay monospace whatever I choose, so that code remains readable and aligned.
31. As a learner, I want the font choices next to Appearance and Theme in Settings, so that I find all look-and-feel settings in one place.

### Sidebar rail

32. As a learner in focus mode, I want the sidebar to shrink to a narrow rail instead of disappearing, so that I keep one-click access to the app's own controls.
33. As a learner, I want the rail to show, top to bottom, the toggle, New chat, Search, Read, Map, Knowledge, Videos, Pieces, Library, and Settings at the bottom, so that every place I usually go is one click away.
34. As a learner, I want each rail icon to have a tooltip with its name and shortcut, so that I can tell icons apart and learn the keys.
35. As a learner, I want clicking a rail icon to go there and keep the rail, so that quick switching does not open the full sidebar.
36. As a learner, I want the current view marked in the rail, so that I know where I am.
37. As a learner, I want the toggle at the top of the rail to open the full sidebar, so that I can reach the tree's contents when I need them.
38. As a learner, I want the tree's contents (conversations, figures, resources) only in the full sidebar, so that the rail stays narrow and simple.
39. As a learner, I want the existing focus mode shortcut to switch between the full sidebar and the rail, so that my keyboard habit still works.
40. As a learner, I want my focus mode choice remembered across reloads, so that the rail stays if I prefer it.
41. As a learner, I want the floating menu button gone, so that nothing floats over the page title.
42. As a learner on a narrow screen, I want the existing header and drawer unchanged, so that the small-screen layout keeps working.
43. As a keyboard or screen reader user, I want the rail to be a labelled navigation with named buttons in a sensible tab order, so that I can use it without a mouse.

## Implementation Decisions

- **Writing guidance lives in the fixed rules.** The new "Writing for understanding" section goes into the fixed teaching skill, after its Tone paragraph. The learner cannot edit it; their tutor style still follows it and may refine it. Agreed wording:

  > **Writing for understanding**: Write the way a good tutor talks at a whiteboard, not the way a textbook reads. Use short, plain sentences that a beginner could follow on first read, and let each one carry a single idea. When a sentence needs a qualifier, an aside or a "more precisely", ask whether it helps the learner understand right now; if not, cut it, since the learner can branch from any phrase to go deeper.
  >
  > Give each step room. A dense paragraph that does three things makes the learner untangle it; separate small paragraphs let them take one step at a time. In math, lead into a key equation with a few words, show it on its own line, then say in plain words what it means or why it holds.
  >
  > Stay close to what the learner brought. If they shared notes, a page or a problem, point at the exact part you are explaining, so they can follow along in their own material.
  >
  > Let each answer take the shape its question needs. A short question gets a short answer; a request to explain everything gets full coverage, written just as plainly. Do not fall into one fixed pattern of headings, openings or endings across replies.

- **No rigid rules.** The owner rejected numeric limits (sentence length, word counts), fixed recaps, fixed openings or endings, and a separate math layout rule. The guidance above is the whole change to how the tutor writes. The existing humanizer rules, including the ban on describing how the answer is organised, stay as they are.
- **Default tutor style.** Remove "and recommend one primary resource to learn more" from the default tutor style, keeping "Back specific claims with resources". An unedited tutor style follows the new default automatically (existing behavior).
- **Reading room.** Reply prose moves to 16px with a line height of about 1.6, the focused chat column to about 720px of text measure, and each top-level reply section gets a light divider plus extra space above it. The divider is styling on the section boundary, not markdown the tutor writes. Smaller scales (code, tables, discussion cards) are re-checked against the new size, not redesigned.
- **Font choices.** Two new browser preferences stored the same way as appearance and theme: reading font (`literata` or `system`) and interface font (`archivo` or `system`). Unknown or unreadable values fall back to the default. Each choice switches the corresponding font variable at the app root: the reading font variable for replies and long text, the body and heading font variables for the interface. System means the system UI stack (`system-ui, -apple-system, "Segoe UI", sans-serif`). The monospace variable is untouched. Both choices appear as radio lists in Interface settings, after Appearance and Theme, labelled "Reading font" and "Interface font", with options named Literata / System and Archivo / System. The bundled webfonts stay loaded; diagrams that embed their own font are unaffected.
- **Sidebar rail.** Focus mode keeps its stored preference and shortcut, but its "on" state renders the sidebar rail instead of hiding the sidebar. The floating toggle button is removed; the toggle becomes the first item of the rail and the first control of the full sidebar. Rail items reuse the existing sidebar actions and view switching, shown icon-only with tooltips carrying name and shortcut, and the current view marked. Activating a rail item never leaves focus mode. The tree contents outline renders only in the full sidebar. Narrow-screen header and drawer are unchanged. The page title no longer needs padding to clear a floating button.
- **Glossary.** Focus mode now means the rail; Sidebar rail, Reading font and Interface font are defined. No ADR: every decision is cheap to reverse.

## Testing Decisions

- Test external behavior only: what the assembled tutor prompt contains, what the learner sees and can operate, and what preferences restore. Do not assert CSS values or private structure. Do not add tests that only restate wording.
- **Tutor prompt.** Prior art: the tutor style unit test that assembles the tutor prompt and checks rule order and the default style's key rules. Update its assertion list so it no longer expects the primary-resource recommendation. Add no new assertions on the writing guidance's wording.
- **Reading room.** No automated test; it is CSS only. Acceptance is one look at a long reply with headings, display math and a table, in both reading fonts, checked against the decisions above.
- **Font choices.** Prior art: the browser preferences unit test (restores each choice independently, falls back safely, tolerates denied storage) and the Interface settings component test. Extend the first for both font preferences. Extend the second to show both radio lists with their named options, and that switching one changes only its own font.
- **Sidebar rail.** Prior art: the shell band component test, whose focus mode cases currently expect a hidden sidebar and a floating menu or close icon. Rewrite those cases: focus mode shows a labelled rail with the agreed controls in order and accessible names; activating a rail view or action works and keeps focus mode; the contents outline is absent from the rail; the toggle and shortcut switch between rail and full sidebar; the choice survives a shell remount; the narrow-screen band and drawer cases keep passing.
- No browser (E2E) scripts.

## Out of Scope

- Fonts other than the current defaults and System, and any font upload or picker.
- A per-reply or per-tree font, size or density setting.
- Rewriting the humanizer rules, tutor style editing UI or reply layouts.
- Fixed reply templates, recaps, word or sentence limits, or a new math formatting rule.
- Changes to the narrow-screen header and drawer.
- A third, fully hidden sidebar state.
- Showing the tree contents outline in the rail (for example as a hover panel).
- The tree search miss seen during the session (searching "Learning Everything in a Note" found nothing); investigate separately if it reproduces.

## Further Notes

- The comparison reply is the ChatGPT share for "can u explain everything on this note"; the Rabbithole counterpart is the first reply in the learning tree "Learning Everything in a Note". Both are useful as a before-and-after check for the writing guidance, read side by side rather than measured.
- Tickets are held until the owner asks for them. The proposed split is four tickets under one epic: tutor wording, reading room, font choices and sidebar rail. They are independent; reading room and font choices touch the same reply styles, so do them in that order.
