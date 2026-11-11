# Workspace and media refinement

Owner request: 2026-11-11. Design interview in progress, tracked by
TreeTutor-cnr and TreeTutor-cnr.1. This records requested product behavior;
implementation choices below are proposals until confirmed.

## Requested behavior

- Inherited context contains the selected passage and a compact paragraph
  about prior discussion. It must not answer the child's question. Keep the
  exact passage and the new question separate from the generated paragraph.
- Focused chat gives more room to reading: a smaller header and a floating,
  rounded composer with a circular send control beside it.
- Learning-tree navigation replaces the persistent search field with a search
  icon opening a floating search window. Rework the intrusive scrollbar while
  preserving access to every saved learning tree.
- Settings offers three model roles: quick thinking (the current suggestion
  model), chat (the default for newly opened conversations), and smart
  (selectable now, initially matching chat, reserved for later use).
  Conversation-level model selection remains available.
- Usage becomes a visual history with graphs, including multiple years and
  all-time accumulation rather than only today's text totals.
- The passage popover has fewer buttons, dismisses on outside click and loses
  its Cancel branch button.
- Diagrams become simpler, more colorful and approachable enough for children,
  with fewer shapes and connections.
- Explicit requests can produce 2D or 3D educational videos with attention to
  token usage. A shared local video library offers access, deletion and opening
  in the file explorer.

## Verified starting point

Source inspection on 2026-11-11, not live behavioral verification:

- Branch compaction in `server/app.mjs` receives the learner's new question and
  permits up to 1,200 words. It uses the parent conversation's model. The child
  already receives its question as a separate user message.
- Settings currently exposes suggestion-model selection and today's usage.
  Usage is attached to saved messages and suggestions; historical retention
  independent of conversation deletion still needs a design decision.
- The diagram worker forbids generated styling and has no simplicity budget.
- Video generation already uses isolated Remotion rendering and local MP4s.
  Its current policy supports short 2D compositions, not Three.js imports.
  Videos play in their originating conversation; there is no shared library
  or individual delete/reveal action. Conversation deletion removes its media.

## Confirmed context decision

The quick thinking model performs branch compaction. Its source is the parent's
existing inherited context (which already summarizes earlier ancestors) plus
the parent conversation. It combines these into the new child's compact
paragraph, preserving important ideas and removing repetition without adding
knowledge or answering the child's new question. Apply the same rule recursively
to grandchildren and deeper descendants.

The owner rejected the proposed 80–150-word target: allow substantially more
length when needed to preserve important ideas. No new numeric limit is agreed.
Keep the exact selected passage and child's question separate from the generated
paragraph. The fixed-snapshot and unchanged-parent-context rules still apply.

## Confirmed chat model defaults

New learning trees use the chat provider and model selected in Settings. Child
conversations inherit their parent's current provider and model, including at
deeper nesting levels. The learner can still switch provider or model within
each conversation. Changing the Settings default does not change existing
conversations.

## Confirmed smart model default

The smart model initially uses a "Same as chat default" setting: it follows the
Settings chat provider and model as that default changes. The learner can instead
select a specific provider and model independently. This follows the global chat
default, not a conversation's model override. Merely configuring the smart model
starts no model calls; its runtime use belongs to a future feature.

## Initial video research

Remotion supports [parameterized compositions](https://www.remotion.dev/docs/parameterized-rendering)
and [Three.js through React Three Fiber](https://www.remotion.dev/docs/three).
Reusing the existing renderer is therefore a plausible starting point for both
2D and 3D rather than introducing another rendering engine immediately.
Reusable scene components plus short structured scene data may reduce generated
tokens compared with fresh composition source for every video. This is an
engineering inference, not a measured saving; creative limits and render costs
still need evaluation. No rendering-engine selection is settled by this note.
