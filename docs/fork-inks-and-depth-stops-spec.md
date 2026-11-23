# Fork inks and depth stops

Epic: Rabbithole-fki. Mockup: `docs/mockups/Rabbithole-fki.1.html` (panel C is the chosen design; panel D records the rejected cap).

## Problem Statement

On the learning tree map, every conversation below a first-level branch wears its branch family's ink. At the trunk the children read apart, because each takes its own ink. One level down they do not: all children of 1.2 are amber, so their branch lines, passage underlines and address chips look the same, and the learner cannot tell which line leads where. The deeper the tree, the worse it gets. Nothing on a conversation node shows how deep it sits, except reading its address digit by digit.

Where sibling lines leave a card, they share one vertical run through the gutter, and the line drawn last covers the others. Same-coloured lines hide this today; different colours would expose it.

## Solution

Inks are chosen at every fork instead of once per family. Siblings always take different inks, so every fork reads like the trunk's fork does today. An only child stays on its parent's ink, so a chain without forks stays one line. The theme keeps its four branch inks.

Each sibling line gets its own vertical run beside the others, ordered so lines never cross, and the lanes follow the cards while the learner drags them.

Each conversation node shows depth stops under its address chip: one porcelain ring per level below the trunk, joined by a line, the last ring filled, like a transit stop row. The row has no cap. Lines keep their 7px weight and full colour at every depth.

## User Stories

1. As a learner, I want the children of any conversation to have different line colours, so that I can tell which branch line leads to which child card.
2. As a learner, I want the trunk's children to keep taking inks 1 to 4 in address order, so that the top of my map looks as it does today.
3. As a learner, I want a child's ink to differ from its parent's ink whenever it has siblings, so that I can see where a fork starts.
4. As a learner, I want an only child to keep its parent's ink, so that a straight chain of questions reads as one line, not a stripe that looks like a fork at every step.
5. As a learner, I want a fifth child of a fork to reuse an ink in a fixed order, so that colours stay predictable when a conversation has many branches.
6. As a learner, I want a passage underline in a reply to wear the ink of the child it leads to, so that I can match each underline to its line on the map.
7. As a learner, I want the address chip after a branched passage to wear the same ink as its underline, so that passage, chip and line agree.
8. As a learner, I want each map card's band and address chip to wear its own conversation's ink, so that the card matches the line that lands in it.
9. As a learner, I want folded stubs to wear the ink of the child they stand for, so that a folded branch still matches its colour when unfolded.
10. As a learner, I want the Contents route strip in the sidebar to use the same inks as the map, so that the sidebar and the map agree.
11. As a learner, I want ghost-tree dots and visual-part outlines to use the same inks as the map, so that every place a branch appears keeps one colour.
12. As a learner, I want a conversation's ink never to change when I add a branch somewhere else in the tree, so that colours I have learned stay put.
13. As a learner, I want an only child to change ink when its parent gains a second child, so that the new fork reads apart like every other fork.
14. As a learner, I want the line key on the map to list the trunk's first branches with their inks, so that the key stays accurate under the new rule.
15. As a learner, I want sibling lines leaving one card to run side by side, so that no line hides under another.
16. As a learner, I want sibling lines never to cross each other, so that I can follow each one without guessing at a crossing.
17. As a learner, I want the lanes to reorder when I drag a child card past its sibling, so that the lines stay uncrossed after I rearrange the map.
18. As a learner, I want lines to a child left of its parent, or stacked above or below it, to keep separate lanes too, so that dragging cards anywhere keeps lines readable.
19. As a learner, I want lines to keep their 7px weight and 45/90 degree turns, so that the map still looks like a transit line diagram.
20. As a learner, I want depth stops under each card's address chip, so that I can see at a glance how deep a conversation sits.
21. As a learner, I want one stop per level with the current stop filled, so that the row reads like a transit stop display.
22. As a learner, I want the stop row to keep growing with depth, without a cap or a number, so that a deep conversation looks deep.
23. As a learner, I want the depth-1 stop not to look like the "Responding" activity dot, so that I never mistake depth for activity.
24. As a learner, I want the depth stops not to make the card band wider or taller, so that cards keep their size on the map.
25. As a learner, I want the trunk card to show no depth stops, so that the trunk stays the plain starting point.
26. As a learner using a screen reader, I want depth stops hidden from assistive technology, so that I hear the address once instead of a row of decorative rings.
27. As a learner using any theme in light or dark, I want the new inks and depth stops to read clearly, so that the change works in every appearance.
28. As a learner with an existing learning tree, I want my tree to show the new inks without any migration, so that old trees just look right.

## Implementation Decisions

- Ink stays derived, never stored. The function that already walks a learning tree to assign each conversation its address and ink changes its ink rule; every consumer keeps reading ink from it, so map lines, card bands, fold stubs, passage underlines, address chips, the Contents route strip, ghost-tree dots and visual-part outlines all follow without their own changes.
- Ink rule, with paper as ink 0 and series inks 1 to 4:
  - A child of the trunk takes `(i mod 4) + 1` for sibling index `i` (unchanged).
  - A child with no siblings takes its parent's ink.
  - Otherwise, with parent ink `p`, children take the list "the three inks other than `p` in ascending order, then `p`" at position `i mod 4`.
  - Sibling order is the existing address order (creation time, ties by id), so adding a branch never re-inks earlier siblings. The one exception is an only child gaining a sibling, which re-inks it, as story 13 asks.
- Ink count stays at four per theme. No theme files change.
- The line key keeps listing the trunk's direct children with their inks, relabelled from "Branch family inks" to "First branches".
- Sibling lanes: branch line routing keeps its current shape (sideways, 45 degree turn, vertical run, 45 degree turn, sideways) and gains a lane offset for the vertical run. Lanes are assigned among lines from the same parent whose vertical runs would overlap, ordered by the current vertical position of their child cards so no two cross, and recalculated during a drag. Each line is still routed live from its two cards; only the lane assignment needs the positions of all siblings, so it is computed where the map already knows all node positions and passed to each line. Lines in different gutters need no lane.
- Lane spacing keeps 7px lines from touching; the exact gap is a routine implementation choice.
- Depth is the number of address parts after the trunk (1.2.3 is depth 2). No stored field.
- Depth stops are a decorative SVG row in the card band under the address chip, `aria-hidden`. Sizes from the mockup: 6px porcelain rings with a 1.5px stroke, 11px apart, a 1.5px porcelain joining line, the last ring filled. No cap, no run-in line, no number. The trunk shows none. The depth-1 marker must differ from the 8px porcelain "Responding" dot by position, size or shape; the mockup places it under the chip, which already separates them.
- `GLOSSARY.md` (Branch ink, Depth stops) and `DESIGN.md` (line rules, map cards, do and don't) already describe this design.

## Testing Decisions

- Tests check behaviour seen from outside: which ink each conversation gets, where line points fall, what a card renders. They do not check internal helpers or how the walk is written.
- Ink rule: unit tests on the address and ink assignment, extending the existing tree-list tests. Cover trunk children 1 to 5, a fork of three under ink 2 (gets 1, 3, 4), a fork of four under ink 3 (gets 1, 2, 4, 3), an only child keeping its parent's ink, an only child re-inked once a sibling appears, and earlier siblings unchanged when a later sibling is added.
- Line key: extend the existing map-state tests for the legend so they still list only the trunk's children with their new inks.
- Lanes: unit tests on line routing, extending the existing line-route tests, plus a test on the lane assignment: siblings in one gutter get distinct vertical runs; lanes follow child card order and swap when two cards swap; a lone line keeps the gutter centre; the mirrored (child left of parent) and stacked (overlapping columns) cases also separate.
- Depth stops: a component test rendering a conversation card at depths 0, 1 and 9: no row for the trunk, one filled ring at depth 1, nine rings with the last filled at depth 9, and the row hidden from assistive technology. Use the jsdom harness as the existing navigation component test does.
- Contents route strip: the existing route-strip tests should keep passing; update expected inks only where the new rule changes them.
- No browser tests.

## Out of Scope

- More than four branch inks per theme.
- Showing depth with line width, tint or numbers.
- Fixing colours that look alike in some themes (amber and green in Platform light are close in lightness); recorded for later.
- Routing lines around third cards that sit in a gutter (an existing `shortcut:`).
- Long address chips squeezing card titles at deep levels (an existing issue).
- Changing diagram, chart or usage series colours, which keep the four theme inks as they are.

## Further Notes

- The mockup is static, uses a fallback font, and only covers Platform light and dark and Main Line dark; the other themes were not checked.
- In the mockup, depth stops are about 3.6px at 60% zoom and hard to count. The owner chose no cap anyway; depth stops are for close reading, and the address chip stays exact.
- The mockup's 9px focus path barely stands out from 7px lines; the porcelain ring around the current card carries focus. No change planned.
