# Visual asking and motion

Decided with the project owner on 2026-11-14 (grilling session). Spec C of four; see [setup and tutor style](setup-and-tutor-style-spec.md). Terms follow `GLOSSARY.md`. Refines the [inline visuals spec](inline-visuals-spec.md) where they conflict; everything not named here keeps its current behavior.

## Problem Statement

Asking about a visual works differently from asking about text. Only parts the smart model happened to tag are clickable, so some parts respond and others do not, and the learner cannot ask about the visual as a whole. A tagged-part question does not open the floating ask box beside the source; it appears at the end of the reply. A child conversation started from a visual has no address chip on the visual, while passages show one.

Most visuals are static pictures. Even interactive ones jump between states with no transition, so a process is hard to follow and the visual feels lifeless.

Visuals often end with small, dim paragraphs in secondary text. They repeat the reply, are hard to read, and would look out of place if simply enlarged.

## Solution

- **One Ask button.** Every ready visual has one visible Ask button. It opens the same floating ask box passages use, with the visual as the source. Try a different version and Enlarge move into a "…" menu beside it. Tagged-part clicks are removed.
- **Address chips under visuals.** A visual's child branches show their address chips in a row beneath it, in branch family ink. A chip opens its child.
- **Step-through motion.** The sandbox provides a small shared step-through helper: previous and next, a step indicator, and smooth transitions between states, honoring reduced motion. The visual prompt asks the smart model to prefer stepping through a process with that helper over a static picture when the idea has stages.
- **No trailing prose.** The visual prompt stops allowing explanatory paragraphs inside a visual. Labels stay inside the graphic. A result line that changes with interaction uses primary text at reading size. The reply text carries the explanation.

## User Stories

### Asking

1. As a learner, I want one visible Ask button on every visual, so that I always know how to ask about it.
2. As a learner, I want Ask to open the same floating ask box I use for passages, beside the visual, so that asking feels the same everywhere.
3. As a learner, I want my question about a visual to start a child conversation like a passage question, so that it lives on the map the same way.
4. As a learner, I want the child to receive the visual's title and description as its source, so that the tutor knows what I am looking at.
5. As a learner, I want to name the part I mean in my own question, so that I can ask about anything in the visual, tagged or not.
6. As a learner, I want Try a different version and Enlarge in a "…" menu, so that the visual shows only one button and stays calm.
7. As a learner, I want Ask available in the enlarged view, so that I can ask while looking at the large version.
8. As a learner, I want Ask hidden while a visual is still being built or failed, so that I only ask about a finished visual.
9. As a keyboard user, I want Ask and the "…" menu reachable by Tab with visible focus, so that I can ask without a pointer.
10. As a learner, I want clicks inside the visual to only operate its own controls, so that sliders and buttons never open the ask box by accident.

### Chips

11. As a learner, I want the address chips of a visual's children shown under it, so that I can see what I already asked about it.
12. As a learner, I want those chips in branch family ink, so that they match passage chips and the map.
13. As a learner, I want clicking a chip to open that child, so that I can return to an earlier question.

### Motion

14. As a learner, I want a process shown step by step with previous and next, so that I can follow it at my own pace.
15. As a learner, I want smooth transitions between steps, so that I see what changed instead of a jump.
16. As a learner, I want a step indicator, so that I know how far through the process I am.
17. As a learner who prefers reduced motion, I want steps to change without animation, so that motion never bothers me.
18. As a keyboard user, I want step controls operable with Enter, Space and arrow keys, so that I can step without a pointer.
19. As a learner, I want every stepped visual to use the same controls, so that I learn them once.
20. As a learner, I want static visuals still used when there is nothing to step through, so that simple ideas are not padded with controls.
21. As a learner, I want animations to start paused or play once, so that nothing loops while I read.

### Text in visuals

22. As a learner, I want no small, dim paragraphs inside visuals, so that I am not squinting at text that repeats the reply.
23. As a learner, I want labels inside the graphic readable at the chat column width, so that the visual explains itself.
24. As a learner, I want a changing result line at normal reading size and contrast, so that I can read the outcome of my interaction.

## Implementation Decisions

- **Ask path.** The visual Ask button calls the same branch-form open used for passages, with the visual figure as the anchor element and the artifact id as the source. The existing visual-branch request shape (artifact id plus label and explanation) is reused with the label set to the visual's title and the explanation to its description; no new branch kind.
- **Tag removal.** The sandbox no longer makes `data-visual-label` elements activatable, and the visual prompt drops the tagging instruction. Existing stored visuals with tags render unchanged but their tags do nothing. Existing visual-part branches keep their rows and appear as chips under their visual.
- **Actions row.** One visible Ask button plus a "…" menu (Astryx menu) holding Try a different version and Enlarge. The enlarged dialog shows Ask too.
- **Chips.** Reuse the passage address chip, laid out in a row beneath the figure, ordered by address.
- **Step helper.** A small script the sandbox injects before the fragment, exposing a global for declaring steps: each step is a function that moves the visual to that state. The helper renders previous, next and a "Step n of m" indicator in house style, wires keyboard keys, and runs transitions with the already loaded d3 (or CSS transitions), skipping animation under `prefers-reduced-motion`. It owns no app messaging and needs no network.
- **Visual prompt.** Adds: prefer the step helper when the idea has stages; no explanatory paragraphs inside the fragment; result lines use primary text at reading size; labels in the graphic only. Removes: the branch tagging instruction. The predict-then-reveal contract is kept.

## Testing Decisions

- Tests assert what the learner sees and can operate, and what the smart model is told, not helper internals.
- **Seams.** (1) The step helper in jsdom as a unit: steps run in order, controls and indicator update, keys work, reduced motion skips transitions. (2) A component test for the visual figure: Ask visible only when ready, Ask opens the branch form with the visual as source, the "…" menu actions, chips under the visual, Ask in the enlarged view (`test/media/visual-branch.test.mjs`, `test/media/card-states.test.mjs` are prior art). (3) The visual prompt as a unit: tagging instruction gone, step helper and text rules present (`test/media/visuals-prompts.test.mjs`). (4) Update `test/media/visual-parts.test.mjs` for removed tag activation.
- No browser scripts; `verify-video-player` in the smoke set is unaffected.

## Out of Scope

- Asking about a single part of a visual by pointing at it.
- Rewriting existing stored visuals to use the step helper.
- Changes to Mermaid diagrams or videos.

## Further Notes

- Removing tagged parts trades fine-grained asking for one consistent action; the learner names the part in the question instead.
