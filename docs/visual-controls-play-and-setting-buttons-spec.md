# Visual controls, Play for steps and buttons for short settings

Decided with the project owner on 2026-11-25 (grilling session). Terms follow `GLOSSARY.md` (learner, tutor, visual, visual part, visual control, step, scene change, video mode, visual frequency, effort, model profile). Respects ADR 0004 (the chat model writes media) and ADR 0014 (visual calls carry their place).

## Problem Statement

Every visual builds its buttons, sliders and readouts from scratch. The visual worker spends output on markup and styling it rewrites each time, so visuals take longer to appear, and the controls look different from one visual to the next and often look poor.

Stepped visuals move only when the learner clicks Previous or Next, and each change is a quick 300 ms jump. The learner cannot sit back and watch a process unfold, and the changes are too quick to see what moved.

In Settings, Video mode is a dropdown although it has only two choices, Quality and Saving, so the learner must open a menu to see both. Other short choices, such as effort, are dropdowns too.

## Solution

The app gives every visual a kit of ready-made visual controls, in several variants, styled by the app. The visual worker picks a control and its variant by name and reads its value, instead of building and styling one. Visuals appear sooner and every visual's controls look and work the same.

A stepped visual gets a Play button beside Previous and Next. The learner starts it; it moves through the steps with slow, readable motion and a short pause on each, picture first. What changed is pulsed briefly, and scene changes crossfade. Previous and Next also animate rather than jump.

Settings shows any fixed choice of five options or fewer as buttons, and a dropdown only above five. Video mode, Visual frequency and effort follow the rule.

## User Stories

1. As a learner, I want visuals to appear sooner, so that I'm not waiting on markup the app could supply.
2. As a learner, I want every visual's buttons, sliders and readouts to look the same, so that I learn them once.
3. As a learner, I want controls that look as polished as the rest of the app, so that visuals don't feel bolted on.
4. As a learner, I want controls that follow my theme and appearance, light or dark, so that visuals match the app.
5. As a learner, I want a range of control types, so that each visual can use the one that fits.
6. As a learner, I want buttons in a few variants, such as a main action and a quiet one, so that the main action stands out.
7. As a learner, I want toggles and switches for on/off choices, so that their state is obvious.
8. As a learner, I want sliders that show their current value, so that I know what I set.
9. As a learner, I want number inputs with step buttons, so that I can nudge a value precisely.
10. As a learner, I want a choice list for picking one of a few options, so that I see every option.
11. As a learner, I want a text field when a visual asks me to type, so that typing looks like the rest of the app.
12. As a learner, I want readouts that show computed values with their units, so that results are easy to read.
13. As a learner, I want a result card for a check-yourself answer, so that right and wrong are clear.
14. As a learner, I want status lines for hints and warnings, so that messages look consistent.
15. As a learner, I want legends that show each series' colour, so that I can read a chart.
16. As a learner, I want tables in visuals to look like tables in replies, so that data reads cleanly.
17. As a learner, I want a reset control that puts every control back, so that I can start over.
18. As a learner using a keyboard, I want every control reachable and operable with the keyboard, with a visible focus ring, so that I never need a mouse.
19. As a learner using a screen reader, I want every control labelled and its value announced, so that I can use visuals without sight.
20. As a learner on a narrow window, I want controls to wrap and stay usable, so that visuals work at any width.
21. As a learner, I want controls never to be picked as visual parts, so that clicking one never asks a question about it.
22. As a learner, I want existing visuals to keep working, so that the kit changes nothing already saved.
23. As a learner, I want a Play button on stepped visuals, so that I can watch the steps unfold.
24. As a learner, I want Play to start only when I press it, so that visuals never move by themselves.
25. As a learner, I want Play to move slowly enough to follow, so that I see what moved and how.
26. As a learner, I want a short pause on each step during Play, so that I can take in the picture before the next change.
27. As a learner, I want Pause to stop where I am, so that I can study a step.
28. As a learner, I want Play to stop at the last step, so that the picture rests on the end state.
29. As a learner, I want Previous and Next to stay, so that I can still step at my own pace.
30. As a learner, I want Previous and Next to animate the change too, so that stepping is smooth.
31. As a learner, I want using Previous, Next or the keyboard during Play to pause it, so that my click always wins.
32. As a learner, I want what changed in a step pulsed briefly, so that my eye goes to it.
33. As a learner, I want scene changes to crossfade, so that a new layout replaces the old one smoothly.
34. As a learner, I want steps to show the change in the picture, with at most a short label, so that I watch the idea rather than read text.
35. As a learner who prefers reduced motion, I want Play to change steps without motion and still pause on each, so that I can use it comfortably.
36. As a learner, I want Play to stop when the visual scrolls out of sight or the window is hidden, so that I don't miss steps.
37. As a learner, I want to see both video modes at once as buttons, so that choosing is one click.
38. As a learner, I want Visual frequency as three buttons, so that all three are in view.
39. As a learner, I want effort shown as buttons when a model has five levels or fewer, so that I see them all.
40. As a learner, I want a dropdown only when there are more than five choices, so that long lists stay compact.
41. As a learner, I want lists of my own things, such as model profiles, to stay dropdowns, so that they fit however many I add.

## Implementation Decisions

### Visual controls

- The sandbox defines each visual control as a custom element with a short prefixed name, such as `rh-slider`, before the visual's own script runs. They are globals like `stepThrough`: no import.
- Each control renders native elements in the light DOM, such as a real button or range input, so keyboard use, focus and screen readers work as they do for native controls, and the visual's own script can still read them. Controls carry no `data-part`, so visual part picking ignores them.
- Configuration is by attributes: `label` (required, used as the accessible name), `variant` where the control has variants, and the control's own range or options, such as `min`, `max`, `step`, `unit`, `options`. Each exposes `value`, fires `input` while changing and `change` when settled, and keeps its value across a theme change.
- The kit, each with its variants:
  - button: primary, secondary, quiet; a button group lays several out together
  - toggle (a pressed or unpressed button)
  - switch
  - slider, showing its value and unit
  - number with stepper buttons
  - choice list: segmented for two to five options, a radio list for longer ones
  - text field
  - readout: a label and a live value with unit
  - result card: correct, incorrect, neutral
  - status: info, success, warning
  - legend: a colour swatch and label per series, using the series inks
  - table, styled like reply tables
  - reset, which returns every control in the visual to its initial value and fires `reset` on the root so the visual can redraw
- Base sandbox CSS styles the kit with the theme variables and fonts the worker prompt already names, light and dark, including focus rings, disabled states and wrapping at phone width.
- The visual worker prompt drops its guidance on building and styling controls and gains a short catalogue: each control's name, variants, attributes and events. The goal is fewer output tokens per visual and consistent controls. A worker may still build a custom control the kit lacks, styled with the same variables.
- Visuals saved before the kit render as before; the kit only adds globals.
- A mockup of every control and variant, in light and dark, is made at `docs/mockups/<issue-id>.html` before the ticket is published; the ticket carries the `new-ui` label and a `Mockup:` line.

### Play

- The step helper adds Play/Pause beside Previous and Next, with the same keyboard wiring; the worker prompt still tells the worker not to add its own step controls.
- Play starts only on the learner's click. It never starts on render, when the visual scrolls into view or after a new version.
- During Play each step's motion lasts about 1.5 to 2.5 seconds, chosen by the helper from what the step changes, then holds about 1 second before the next step. Play stops on the last step, and Play again starts from the first.
- Previous and Next animate their change too, with a shorter eased transition than Play so clicking through stays quick (a sensible default of about 0.6 seconds). Previous, Next or a step key during Play pauses it.
- The helper passes each step its duration, as today, so continuing steps animate their d3 or CSS transitions over it.
- "This changed" pulse: while a continuing step runs, the helper watches the root for changed attributes and text, and briefly outlines the nearest visual part of each changed element once the motion settles.
- Scene changes crossfade: the helper keeps a still copy of the old scene over the root, runs `show`, and fades the copy out while the new scene fades in, instead of fading out to empty and back in.
- With reduced motion, durations are 0 and no pulse animates, but Play still holds on each step for the full step time.
- Play pauses when the visual leaves the viewport or the page is hidden.
- The worker prompt tells stepped visuals to show each step's change in the picture, with at most a short label per step; the reply carries the explanation.

### Settings buttons

- Rule: a fixed choice of five options or fewer shows as buttons, using the design system's segmented control as the library panel already does; more than five shows as a dropdown.
- Video mode (Quality, Saving) and Visual frequency (Sparing, Often, Only when asked) show as buttons.
- Effort pickers in chat, smart model and suggestion settings follow the rule by the selected model's option count, including Default and Custom. Choosing Custom opens the typed effort field as today.
- Lists of the learner's own items, such as model profiles and model lists, stay dropdowns, since they grow.
- Labels, saving and error states are unchanged.

## Testing Decisions

- Tests check what the learner can see and do, not markup details.
- Visual control tests run in the sandbox test setup used by the existing step-through and sandbox tests: each control renders with its label, reports `value`, fires `input` and `change`, works by keyboard, follows a theme change without losing its value, and is never picked as a part; reset restores every control and fires `reset`.
- Step-through tests, next to the existing ones: Play advances on its own only after a click; it stops at the last step; Pause and Previous/Next stop it; durations passed to steps differ for Play and manual steps; reduced motion passes 0 and still holds; a scene change keeps the old scene visible until the new one fades in; a changed element's part is pulsed.
- A visual prompt test checks that the control catalogue is present and the old control styling guidance is gone.
- Settings component tests, next to the existing settings tests: Video mode and Visual frequency render as buttons and save the choice; an effort picker with five or fewer options renders buttons, with six or more a dropdown; Custom still opens typing.

## Out of Scope

- Pushing visuals toward more interactivity. The kit makes controls better when a visual has them; it doesn't ask for more of them.
- Autoplay of any kind.
- Changing videos or their player.
- Replacing controls in visuals already saved.

## Further Notes

- The kit's names and attributes are part of the worker prompt, so renaming one later means a prompt change; keep names short and plain.
