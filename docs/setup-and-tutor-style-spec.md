# Setup and tutor style

Decided with the project owner on 2026-11-14 (grilling session). Spec A of four, delivered in order A, B, C, D: this spec, [titles and origin](titles-and-origin-spec.md), [visual asking and motion](visual-asking-and-motion-spec.md) and [attachments](attachments-spec.md). Terms follow `GLOSSARY.md`; **tutor style** was added in this session. Everything not named here keeps its current behavior.

## Problem Statement

A custom endpoint usually does not advertise which efforts its models accept, so the effort picker offers only Provider default, even when the learner knows the model takes "low", "high" or a vendor-specific value. The learner cannot send the effort they want.

A brand-new install is not empty: it creates a "Default" model profile and new learning trees assume the Codex provider. On a fresh computer, the learner meets choices they never made.

The tutor's purpose and teaching manner are fixed in code and mixed with the app's media rules. The learner cannot tell the tutor how to teach, and the built-in guidance does not say plainly that the tutor's job is to make this learner understand, without burying them in jargon.

## Solution

- **Typed effort.** For a custom endpoint model, the effort picker offers "Custom…", where the learner types an effort that is sent as-is. Typed efforts are remembered for that endpoint and model and appear in its list next time.
- **Empty first run.** A fresh install has no model profile and no chosen models. The learner can open the app and create learning trees; Send stays blocked with a link to Settings until a chat model is chosen. Settings shows "Not set" for every role without a model. Existing installs are unchanged.
- **Tutor style.** Settings has a Tutor style text, prefilled with a default written for teaching. Every chat model receives it ahead of the app's fixed safety and media rules, which the learner cannot change. "Restore default" returns to the built-in text, and an unedited tutor style follows improved defaults in later versions.

## User Stories

### Typed effort

1. As a learner using a custom endpoint, I want to type an effort the endpoint accepts, so that I can use reasoning levels the app does not know about.
2. As a learner, I want "Custom…" to appear only for custom endpoint models, so that Claude and Codex keep their reported efforts and I cannot send them invalid values.
3. As a learner, I want the typed effort trimmed and limited to 1–32 letters, digits, `-` or `_`, so that a typo with spaces or symbols is caught before it is sent.
4. As a learner, I want an effort I typed once to appear in that model's effort list next time, so that I do not retype it.
5. As a learner, I want remembered efforts kept per endpoint and model, so that one model's values do not appear for another.
6. As a learner, I want typed effort for the chat model default, the smart model and the quick thinking model, and for a conversation's own model menu, so that every place I choose effort behaves the same.
7. As a learner, I want the endpoint's own error shown in the reply when it rejects my effort, so that I know the value is wrong.
8. As a learner, I want a rejected effort to stay selected, so that I can correct it instead of starting over.
9. As a learner, I want a model profile to save a typed effort like any other effort, so that switching profiles restores it.

### Empty first run

10. As a learner on a new computer, I want no model profile created for me, so that my setup starts with nothing I did not choose.
11. As a learner on a new computer, I want no provider assumed for new learning trees, so that the app never picks Codex for me.
12. As a learner with no chat model chosen, I want to still open the app and create learning trees, so that I can look around before setting up.
13. As a learner with no chat model chosen, I want Send to explain "Choose a chat model in Settings" with a link that opens Settings, so that I know the one step needed.
14. As a learner, I want Settings to show "Not set" for each role without a model, so that I can see which features will not run.
15. As a learner with no quick thinking model, I want suggestions and model-written titles skipped without errors, so that the chat still works.
16. As a learner with no smart model, I want visuals and videos skipped without errors, so that replies still arrive.
17. As a learner who creates my first model profile, I want it to become the active profile, so that my choices take effect at once.
18. As an existing learner, I want my profiles, active profile and saved choices unchanged by this release, so that upgrading costs me nothing.

### Tutor style

19. As a learner, I want the tutor to know its purpose is to help me understand, not only to answer, so that replies teach.
20. As a learner, I want the default tutor style to teach only what is needed, then check my understanding, so that I am not overloaded.
21. As a learner, I want plain words with only the terms worth branching into, so that I learn without buzzwords hiding the idea.
22. As a learner, I want the occasional predict-then-reveal check offered by default, so that I practise recalling ideas instead of only reading them.
23. As a learner, I want to edit the tutor style in Settings, so that the tutor teaches the way I learn.
24. As a learner, I want my tutor style used by every chat model and provider, so that switching model keeps the same teaching manner.
25. As a learner, I want my edits to never break visuals, videos or safety, so that I can experiment freely.
26. As a learner, I want "Restore default" to return to the built-in tutor style, so that I can undo my experiments.
27. As a learner who never edited the tutor style, I want later versions' improved defaults, so that I am not stuck with the first draft.
28. As a learner, I want an edited tutor style to apply to my next message in every learning tree, so that I need not recreate trees.
29. As a learner, I want an empty tutor style to fall back to the default, so that I cannot accidentally remove all teaching guidance.

## Implementation Decisions

- **Effort shape.** An effort stays a string or null (Provider default) everywhere it is stored today: profiles, tree model and working model, smart and quick thinking settings. Typed effort adds no new type. Validation for custom endpoint selections: trimmed, 1–32 characters, letters, digits, `-` and `_`. Claude and Codex selections keep validating against their reported efforts.
- **Remembered efforts.** A new additive table keyed by endpoint id and model id holds learner-typed efforts. The endpoint model list merges them after advertised efforts. Deleting an endpoint deletes its rows.
- **Effort picker.** The shared effort options builder gains a "Custom…" option for custom endpoint models only. Choosing it reveals an inline text field; saving goes through the existing role and conversation model save paths. The existing "unsupported effort resets to Provider default" rule does not apply to typed efforts on custom endpoints.
- **Rejected effort.** No new handling: the endpoint error already surfaces through the reply error path, and the selection is not reset.
- **Empty first run.** The profiles migration seeds "Default" only when the old role rows hold a saved choice; a fresh database creates the profiles tables empty and no active profile. The store's active-profile read returns null rather than a profile. Creating the first profile makes it active. The tree creation default provider becomes null instead of Codex; a tree created with no chat default has no model until one is chosen.
- **Send gate.** The send route refuses a message when the conversation has no provider and model, with a stable error the client renders as "Choose a chat model in Settings" plus an Open Settings action. Background roles (quick thinking, smart) already skip when unset; this spec keeps that and adds "Not set" labels in Settings.
- **Tutor style storage.** A single-row setting holds the learner's tutor style, null meaning "use the built-in default". Saving text equal to the default, or empty text, stores null. Restore default stores null.
- **Prompt composition.** The tutor system prompt becomes tutor style first, then the fixed rules (safety, visual and video block contract). The existing per-tree instructions override, used by tests, is kept. All three providers already build their system prompt through the same composition function; only that function changes.
- **Default tutor style (draft for owner review).**

  > You are TreeTutor, a patient tutor. Your purpose is to help this learner understand, not only to answer. Find what they are really asking, explain only what they need for it, and build on what they already know. Prefer plain words and concrete examples; when a precise term matters, use it and say what it means in a few words. The learner can branch from any phrase to go deeper, so do not explain every side idea now, and leave room for one or two terms worth exploring. Keep answers short enough to hold in mind. After a new idea, check understanding now and then: ask the learner to predict an outcome or explain it back, or offer a predict-then-reveal visual. Correct misconceptions directly and kindly. If the question is unclear, ask one short clarifying question first.

- **Settings UI.** A Tutor style section with a multi-line text field, Save and Restore default, placed in the existing Settings window and following its section pattern.

## Testing Decisions

- Good tests here assert what the learner or a provider observes: the options offered, the value sent to the endpoint, the prompt a provider receives, the error shown. They do not assert table layouts or component internals.
- **Seams.** (1) The store, for the empty first run, profile seeding and remembered efforts (`test/store/profiles.test.mjs`, `test/store/upgrades.test.mjs` are prior art). (2) The prompt composition function, as a unit: tutor style placement, null and empty fallbacks, per-tree override. (3) The effort options builder, as a unit (`src/settings` model helpers). (4) `createApp` with the fake OpenAI-compatible endpoint, for a typed effort reaching `reasoning_effort` unchanged and the send gate error (`test/providers/openai-settings.test.mjs`, `test/http/app.test.mjs`). (5) Component tests for the Custom… field and the Tutor style section (`test/shell/chat-settings.test.mjs`).
- No browser scripts.

## Out of Scope

- Discovering efforts automatically from custom endpoints.
- Typed effort for Claude or Codex models.
- A setup wizard or onboarding flow beyond the Send gate and Settings labels.
- Per-learning-tree tutor styles.
- Pitching explanations from knowledge graph familiarity (zone of proximal development), a per-tree "why I am learning this" mission, and cited sources: recorded as later ideas from the `/teach` review.

## Further Notes

- The `/teach` review contributed the default tutor style's "only what is needed, then check" shape and the retrieval-practice nudge. Its mission, learning records and citation ideas need knowledge-graph prompt plumbing or web access and wait for a later spec.
- Owner edits to the default tutor style text above are expected before implementation.
