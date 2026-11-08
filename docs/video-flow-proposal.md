# Requested video generation and playback

Decision: `TreeTutor-vm4.2`. Status: draft for agreement.

The user agreed to draft an explicit in-chat request, inline generation status, locally saved playback and no autoplay. The detailed contract below remains proposed. This is a later increment after Mermaid; app implementation is not authorized. PRD.md remains the product authority. No visual theme or screen layout is selected here.

## Learner flow

An independent learner asks, for example, “Make a video explaining how Peterson fits into this tournament tree.” The request belongs to that conversation and uses its existing fixed inherited context. An ordinary explanation never starts a video automatically. If request intent is ambiguous, the tutor asks before starting generation.

Save the request and insert an artifact entry at its original position in the chat. Give it a descriptive title and readable status. The learner can continue chatting or navigate elsewhere while generation runs. Completion updates that entry without moving keyboard focus, scrolling the conversation or injecting generation messages into chat.

| State | Visible behavior | Available action |
| --- | --- | --- |
| Preparing | “Preparing video” while the isolated agent creates the composition. | Cancel; continue chatting. |
| Rendering | “Rendering video”; show progress only when reported by the renderer. | Cancel; continue chatting. |
| Ready | Title, short content description and inline player, initially paused. | Play, pause, seek, volume and fullscreen through native controls. |
| Failed | “Video could not be generated” with a brief actionable reason. | Retry the saved request; continue chatting. |
| Canceled | “Video generation canceled.” | Retry if wanted. |
| Interrupted | “Video generation interrupted” after app/server shutdown. | Retry explicitly; never silently restart paid inference. |
| Unavailable | Saved entry exists but its media file is missing or unreadable. | Explain unavailability; offer regeneration as a new attempt. |

Retry creates a separate attempt linked to the same saved request and frozen input, replacing the failed status entry rather than adding another learner message. A changed question is a new request. Ignore late events from superseded attempts. Cancel affects only this job; late output cannot publish a canceled attempt as ready.

Use native HTML video playback of a finished local file, rather than executing the generated React composition in the learner's browser. Keep the player within the chat width and preserve its aspect ratio. Use a labeled status announcement for state changes, without announcing every render-progress update. Tab reaches Cancel, Retry and the player; keyboard behavior must be verified in supported browsers. The player owns its keys while focused, so canvas handlers must not intercept them.

Include a concise text explanation alongside the video so the learning content is available without watching animation. If a later agreed implementation includes speech, provide synchronized captions as well. Narration, voices, soundtrack, duration presets, custom editing, exports and a separate video library are not chosen by this decision.

## Isolated task and result contract

The server creates one job and spawns an isolated generation subagent for each video request. These are TreeTutor's future runtime subagents; no video generation is performed as part of this design task.

| Boundary | Minimum content |
| --- | --- |
| Task identity | Server-owned job ID, attempt ID, tree ID, conversation ID and request-message ID. |
| Frozen task input | Exact video request, relevant saved conversation excerpt, fixed inherited branch context and any referenced passage with source IDs. Exclude unrelated branches and later messages. |
| Generation instructions | Learning objective, requested explanatory content, accessibility requirements and permitted local output/workspace. These instructions are separate from the tutor's conversational instructions. |
| Private work | Generation messages, Remotion source, tool output, diagnostics and revision history remain in the job workspace. They are never appended to tutor messages or used as inherited branch context. |
| Progress | Job/attempt ID and status, plus real rendering progress when available. These update UI state only. |
| Validated result | Server-issued artifact ID, title, concise explanation of what the finished video actually shows, media type, duration and local media reference; optional caption reference. |
| Tutor-visible result | Artifact ID, title and concise finished-content description, linked to the originating request. No source code, logs, private transcript or absolute filesystem paths. |

The tutor can refer to the result using its description; do not claim it watched or verified the frames. If frames need inspection for a later question, that is a separate explicit capability. Store the result description with the conversation so provider changes and resumed conversations retain it. Reuse the same result when reopening; do not regenerate it or replay completion into model history twice. Child branches inherit relevant finished-content information through the existing compact-context rule, never through generation transcripts.

Context isolation is separate from execution isolation. The future worker must have a dedicated workspace, no tutor credentials or unrelated learning files, bounded execution and controlled network access. Validate output references within that workspace, media readability and job ownership before publishing. Serve finished media through a same-origin artifact endpoint; never accept a generated absolute path or arbitrary URL as a browser media source. The exact worker sandbox and provider permission configuration remain implementation prerequisites, not capabilities proven by this document.

## Local persistence and restart

Use the proposed local database for job metadata and artifact associations, with completed files in the local app-data directory outside the repository. This follows the architecture proposal if agreed; it does not approve that stack independently.

Render into private temporary output. Validate and place the finished file in its final local location before marking its artifact ready. A failed save must not show a playable success. On restart, reconcile pending jobs and files: mark unfinished jobs interrupted, retain ready artifacts, and show unavailable state for missing output. A leftover unpublished file must not imply successful generation.

Persist request input, attempt status, owning conversation and the finished result description/reference. Keep raw work out of normal chat persistence and provider history; any diagnostic retention policy is a later implementation choice. Saving locally does not mean offline generation: the selected approved provider receives the task context. Never substitute API-key access when the subscription route is unresolved.

## Alternatives and scope

- **Finished file + native player, recommended:** ordinary playback and persistence; requires waiting for rendering before watching. Remotion documents programmatic video rendering through [renderMedia](https://www.remotion.dev/docs/renderer/render-media); HTML provides [native video controls](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video).
- **Interactive Remotion Player:** useful for future editable previews; introduces generated composition execution in the UI and a larger persistence contract. Defer until requested.
- **Separate video page or gallery:** adds navigation and storage UI beyond the requested inline result. Defer.

No new infrastructure is needed for this decision. Implementation remains `TreeTutor-vm4.3`, blocked by this decision and the preceding Mermaid increment. Provider eligibility and architecture approvals remain separate dependencies of the eventual app.

## Implementation acceptance checks

These checks are planned and have not run:

1. Request a video inside a nested child, navigate away and chat elsewhere during generation. Finished media appears only in its original conversation; play it using keyboard controls without autoplay or stolen focus.
2. Inspect submitted tutor histories and inherited branch snapshots before and after generation, provider changes and restart. Only the agreed task/result content crosses boundaries; private code, logs, revisions and unrelated branch context do not.
3. Fail generation and rendering separately; retry the same frozen request without duplicate learner messages. Cancel one job while another conversation runs; late events cannot overwrite its terminal state.
4. Restart during preparation/rendering and after completion. Unfinished work is interrupted; completed artifacts replay locally without inference. Missing media yields an honest unavailable state.
5. Exercise invalid output paths, unreadable media and failed persistence. Publish no invalid artifact; other chats remain usable. Verify worker permissions separately from transcript isolation.
6. Verify status announcements, visible focus, native playback controls and text alternative; test captions if speech is included. Confirm generated text descriptions accurately reflect the finished content.

Agreement needed before closing: retry/restart behavior, frozen task/result content and local artifact persistence. No app, rendering worker or live accessibility behavior has been tested.
