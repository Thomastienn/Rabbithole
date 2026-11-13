---
version: 1
slug: "docs-mockups-index-html"
primary_target: "docs/mockups/index.html"
related_targets: ["docs/mockups/mock.css"]
---

# TreeTutor redesign mockup (all screens, static)

Mode: Operate. Build path: code-led. Scope: a non-functional mockup of every screen and component, for handoff to implementing agents. The shipped app now follows this world; its surface contract is `.impeccable/surfaces/index-html.md` (Paperback Series, finish-reviewed 2026-11-13).

Audience and job: a learner in a long evening reading session who reads a tutor reply, branches from a passage, and finds their place in the learning tree. Must remain: every PRD flow, GLOSSARY.md vocabulary, dark default with a designed light appearance, borderless inline visuals and videos (docs/inline-visuals-spec.md).

## Direction contract

Chosen by the owner on 2026-11-12 at the Impeccable decision page. Round 1 dealt Paperback Series; the owner kept its layout and asked for colours drawn from the domain; round 2 locked the Seasonal Inks colourway. Picked sketch: `.impeccable/mocks/decision/paperback-seasonal.html`.

THESIS: A learning tree is a volume in a paperback series. The trunk is paper and each first-level branch family takes one muted leaf ink, worn by its passage underline, its branch line and its conversation node band. It refuses the category default of a grey chat column beside a sidebar list with one blue accent.

OWN-WORLD: Dark: bark-black ground (#1a1613), raised bark (#241f1a), deeper panels (#14110e), paper text (#efe6d6), moss shell band (#33432a). Series inks at equal weight: amber, leaf, rust, lichen. Leaf green is also the one action colour; paper is focus; a rose red is reserved for failures. Light: paper ground with the same inks darkened. Archivo for interface and titles, Literata for replies. 3px corners, hairline seams, an 8px module, flat ink bands, no texture.

STORY: The learner opens a volume, reads the reply at a book measure in the centre, sees where they are in the numbered contents on the left, and watches a branch they create appear on the map in its family's ink.

FIRST VIEWPORT: Desktop 1440x900. Moss band across the top: wordmark, learning-tree switcher, view tabs (Read, Map, Knowledge, Videos), search, New chat, Settings. Below, three columns: contents outline (264px, numbered 1, 1.1, 1.1.1 with ink dots, then figures and a context meter), reading column (focused chat, 640px measure, composer at the foot with the leaf-green Send), learning tree map (440px, conversation nodes with ink bands, draggable seam). Signature move: one ink per branch family from passage underline and address chip to branch line and node band; a new branch draws on in 350ms and shows at once under reduced motion.

FORM: Paperback Series, position 7 of seven grounded candidates (highlighter study notes, glossed scholarly page, transit diagram, cladogram plate, slip box, trail map, paperback series). seed:ed446011afd27ce7. Raises kept from declined challengers: one module for every alignment (grid specimen); the reply owns the centre (vertical feed); figures are numbered and listed in the contents (design annual); size encodes a real quantity, spine ticks per conversation (labanotation); context budget as a running length (cassette J-card).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
