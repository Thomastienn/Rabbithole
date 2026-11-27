# Sketches are text the app draws

Every picture in a reply was a visual: a separate call to another model that writes an HTML/SVG/JS fragment. That takes seconds and costs thousands of tokens per picture, so a reply carried one to three, and the smaller points inside a section stayed as words. We decided that the tutor also draws sketches. A sketch is a fenced block whose info string is `sketch` and one of 17 fixed kinds, with one short item per line. The app draws it the instant the fence closes, in the theme's colours, with no model call. A sketch is only text in the reply: there is no artifact record, and the history keeps its source. A broken sketch is hidden and logged, never shown as source. Sketches sit alongside visuals and do not replace them. The app's visual rules stay unchanged, and Visual frequency governs both. A hard idea still gets a visual, and its sub-points get sketches.

The owner accepted that any sketch rule takes some visuals from hard and mixed replies. In 10 benchmark questions, run twice, visuals per 10 replies fell from 17.5 to 12.5, while sketches rose to 27.5, with 0 broken. In exchange, the learner gets a picture for nearly every section, for about 30 tokens each. The look of a sketch is fixed by the app's kinds, not by the model, so it stays compact and consistent but can show only what its kinds allow; anything richer needs "Expand into visual".

The prototype and every benchmark are on the local branch `prototype/sketch`. The spec is `docs/sketches-spec.md`.

## Considered Options

- Cheaper visuals: the same marker drawn by a faster model. Each picture still waits on a call, so this never reaches instant, and every picture still costs a call.
- Mermaid blocks. They added fewer prompt tokens, but took about 30 ms to draw, drew tiny text on wide charts and offered no way to ask about an item.
- A `[[sketch: …]]` marker in the marker family of ADR 0016. It failed 5 of 136 sketches on Sonnet, against 0 of 238 for the fence, and its rule cost 70 to 95 more tokens.
- A rule balancing sketches against visuals, or capping a kind. Both took visuals away or read as forced, and the owner rejected them.
