# Diagram artifact contract

**Scoped refinement, 2026-11-11:** The [workspace and media refinement spec](workspace-media-refinement-spec.md) requires simpler, colorful diagrams presented as small visual steps while preserving safe artifact handling. TreeTutor-86c.1 extends the contract below without changing stored source or passage offsets.

The tutor requests a diagram by appending this block to an explanation. Complex
ideas use several blocks, one per visual step in reading order:

````text
```treetutor-diagram
{"title":"Tournament rounds","description":"Round winners advance to the final.","intent":"Show two winners meeting in a final.","excerpt":"A and B advance to the final."}
```
````

Only `title`, `description`, `intent` and `excerpt` are accepted. They must be
nonempty strings, limited respectively to 120, 280, 600 and 1200 UTF-16 code
units. Each JSON body is limited to 3000 code units. Up to six diagram requests
per reply bound worker calls, not the number of shapes in a diagram. Extra fields,
malformed JSON and unclosed requests fail that step; valid steps still run.
An excessive batch or a mixture of diagram and video requests fails without
starting workers. Videos retain their single-request contract. Backtick or tilde fences of at least
three characters are recognized. The server removes recognized requests before
streaming or saving reply text. It withholds possible opening-fence prefixes
during streaming; ordinary code fences are flushed unchanged at completion.

The frozen task consists of exactly those four strings. The worker receives the
conversation's provider and selected model with `thread: null`, dedicated
generation instructions, no saved messages, no branch snapshot and no originating
conversation, message or tutor session ids. Authentication stays in the existing
native provider adapters; credentials are never added to task text. Claude uses
a new CLI session id; Codex starts a separate app-server thread. Neither worker
session nor its transcript is attached to the tutor.

Each step's generation and validation share a 60-second deadline and the originating turn's
Stop signal. All cards are published pending together; workers run sequentially
in reading order, each receiving only its own task. Stop preserves ready steps,
fails every remaining pending step and starts no queued worker.
Output is limited to 16 KiB of UTF-8 and 32 message items per step. The worker
must report completion and return bare Mermaid source. Oversized streamed output
aborts immediately. Late callbacks after abort or timeout are ignored. Codex
interrupts and releases a stalled turn without requiring a terminal event.

Before parsing, conservative checks reject interaction keywords (`click`, `href`,
`script`, `javascript`, `vbscript`, `callback`), HTML tags and entities,
configuration directives/frontmatter, resource URLs, images/icons, CSS directives,
CSS `url()`, Markdown links and backticks. This deliberately rejects some otherwise
valid labels and styling, including HTML line breaks. The contract accepts plain
text labels and trusted class assignments (`A:::blue` or `class A,B green`),
never generated class definitions or style rules. The app supplies the four
classes `yellow`, `blue`, `pink` and `green` only after source validation.
Accepted source must then pass Mermaid's real `parse` API, without rendering.
See the [Mermaid parser documentation](https://mermaid.js.org/config/usage.html#syntax-validation-without-rendering).
Parsing runs in a terminable Node worker with an empty environment. JSDOM supplies
the label sanitizer's DOM, with scripts and resource loading disabled. No SVG,
rendered HTML, JavaScript or generated executable file is saved.

SQLite `artifacts` records contain `id`, `conversation`, `message`, `kind`,
`status`, `title`, `description`, `source`, `error` and `created`. The kind is
`mermaid`; status moves from `pending` to `ready` or `failed`. Only ready records
retain validated source. Failed records retain a bounded public reason instead
of provider diagnostics, rejected source or task intent/excerpt. A diagram failure leaves
the completed explanation available. Stop marks the active reply interrupted
and its pending artifacts failed. Existing `created,rowid` ordering preserves
steps even when several are inserted within one millisecond; no schema change
or duplicate step/source storage is needed.

`GET /api/trees/:conversation` returns `artifacts` alongside messages.
`GET /api/trees/:conversation/artifacts/:artifact` requires the exact owning
conversation, including across parent/child conversations. Mismatches return 404.
There is no client attachment endpoint; message requests with `artifactId`,
`artifactIds` or `artifacts` reject with 400. Internal insertion requires an
assistant message in the same conversation, also enforced by a composite foreign
key. Finalization and reads always scope artifact ids to their owner.

Reply SSE emits `artifact` events containing the pending and final record. The
client reconciles them by artifact id within the owning conversation and reply.
An interrupted worker's final failure remains available through the conversation
GET. The turn stays active until generation/validation finishes or is stopped;
other conversations remain independent.

Tutor history and compaction use a separate projection: each ready record adds
only `{id,title,description}` metadata to its originating reply. Raw saved message
text remains canonical for passage anchors. Failed/pending artifacts, source,
task prompts and worker output never enter that projection. Compaction has
summary-only instructions. Native tutor sessions are discarded on diagram
requests, including failed requests, and on interrupted hidden-fence prefixes;
the next tutor session imports saved text plus ready metadata. This trades a
history import after each request for keeping raw request JSON out of resumed
tutor context. Later ordinary turns can resume their new session normally.

## Inline presentation

TreeTutor-vm4.8 displays artifacts after their originating reply, outside the
`Passage` text subtree. Description text stays visible and supplies the drawing's
image alternative. Each card and its scrollable drawing are keyboard reachable;
the Mermaid source disclosure works with Enter/Space. Pending generation and
rendering have separate status text. Generation failure retains the description
and public error; render failure retains the description and opens saved source.
Multiple diagrams under the same reply carry visible and accessible
"Step N of M" labels, including failed steps, so numbering remains stable.
Simple diagrams carry the main idea; the tutor's accompanying prose retains
technical detail. Worker instructions prefer short labels, purposeful arrows,
faithful everyday metaphors and top-to-bottom flow in the narrow reading column.

The renderer loads through a dynamic import only when an open chat has a ready
artifact. It repeats the shared 16-KiB/plain-text source checks before loading
Mermaid. It initializes strict security, disables HTML labels globally and for
flowcharts, suppresses Mermaid's error drawing and never binds callbacks. A
serialized render queue keeps each theme initialization with its own drawing.
The classic/base appearance takes colors and font metrics from the card's
computed Astryx tokens and rerenders when the system color scheme changes.
For flowcharts, trusted class definitions resolve chalk hues from theme tokens
with surface-colored labels. Solid, dashed, dotted and heavier borders add
non-color cues; node and arrow words still explain the relationships.

Rendered output becomes an SVG data image, never injected HTML. Output with
HTML labels, scripts, links or images is rejected; SVG image context also
disables scripting and navigation. The original CSP in `server/app.mjs` is
unchanged: `script-src 'self'` and the existing `img-src 'self' data:` suffice.
No unsafe script source, blob permission or remote rendering service is needed.
Large drawings retain their intrinsic size and scroll inside the card.
See [Mermaid security](https://mermaid.js.org/config/usage#securitylevel),
[theming](https://mermaid.js.org/config/theming.html) and
[SVG image restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image#restrictions).

Map previews add only `{id,title,status}` metadata under the owning message and
render a compact `Diagram: title` row. They never fetch Mermaid or include source.
Reopen, browser reload and server restart read the existing artifact records;
presentation never starts inference. Raw reply text and UTF-16 branch offsets
remain unchanged. Syntax validity alone does not establish simplicity or learner
comprehension.

## Recovery and boundaries (TreeTutor-vm4.1)

Opening the store marks any `pending` artifact left by a stopped or crashed
process `failed` with a public "interrupted" reason, alongside the existing
`streaming` to `interrupted` message rule. Recovery never retries or replays
generation; a later reply runs only the tutor and never duplicates the record.
Artifact finalization is scoped to the conversation captured by its own turn,
so a stopped job's late results cannot reach another conversation's diagram.
Worker permissions reuse the tutor's provider restrictions: Claude runs with no
tools, an empty strict MCP config, no setting sources or slash commands and one
turn; Codex uses a read-only sandbox, `approvalPolicy: never`, disabled shell,
patch, REPL, code, apps, skills and web search, and denies server-initiated tool
requests. There is no automatic retry, video, editing, export or API-key path.
