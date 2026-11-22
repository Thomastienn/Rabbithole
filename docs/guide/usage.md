# Using Rabbithole

Back to [README](../../README.md).

## Your learning journey

1. Choose **New chat**. Its map opens with one root conversation and a chat panel. Ask about a topic; the first question becomes its title.
2. Highlight a passage in a completed tutor answer and choose **Ask about selection**. Review the passage, enter your question and create the branch. With **Settings → Models → Automatic suggestions** on, the quick thinking model also underlines terms you probably do not know after each reply; click an underline to branch from it.
3. The child appears beside its source message and opens immediately. It receives the exact passage and a compact, fixed snapshot of relevant parent and ancestor context. Creating a branch saves the child at once and then sends that context to the quick thinking model for summarization; the child's first reply shows "Compacting parent context…", then "Thinking…", and starts once the snapshot is ready. Later parent messages do not change it; child discussions do not enter the parent's context.
4. Continue chatting or branch again at any depth. Drag empty map space to pan, scroll to zoom, drag a box to move it, and click a box to open it. Use the chevron to fold descendants; **Map menu** offers expand, collapse and keep-current-branch actions.
5. Expand the chat for reading or return to the map. On narrow screens the chat fills the workspace. **Return to parent conversation** opens the parent. Other conversations can reply while you navigate.
6. Open **Map menu → Learning trees** to revisit a saved chat. Messages save as they arrive. Layout changes save at most once a minute and when you close or reload the page or quit the desktop app, so only a crash can lose recent map adjustments. Renaming and confirmed deletion are available from chat actions.

## What the tutor can do

- **Attachments:** attach PNG, JPEG or WebP images, PDFs and plain-text files with **Attach files**, by pasting or by drag-and-drop. Each chip says how the file reached the tutor: sent as image, read as text, or OCR. A model that cannot read images gets local OCR text instead. Child conversations do not receive the files.
- **Tutor tools:** **Settings → Models → Tutor tools** turns tools on or off for every provider. They cover web search and page reading, image finding, offline Python, the memory note, concept lookup and recall of earlier conversations in any learning tree. Claude and Codex use their own web search (and Claude its page fetch); the app serves the other tools to them through a per-turn local MCP server, and to custom endpoint models through function calling. Pages, images and documents the tutor uses become resources: replies cite them with chips and the contents panel lists them.
- **Tutor style and memory note:** **Settings → Models** also holds the tutor style every chat model receives first, and the memory note the tutor keeps about you across all learning trees. You can edit or clear either.
- **Reply layouts:** the tutor can lay out a section as plain flow, figure beside text, gallery, comparison, steps, stages, key terms, callout, timeline, a check with a hidden answer, or wide. Every passage stays branchable.
- **Visuals and diagrams:** the conversation's chat model writes interactive HTML/SVG visuals and Mermaid diagrams where the tutor places them in a reply. Visuals run in a sandbox with no network. A visual streams in as it is written, with an amber border while it is still drawing. Stepped visuals show **Step** controls beside them. Click a tagged part to branch about it, or choose **Try a different version**. Visuals and videos can place stock objects from Microsoft Fluent Emoji (2D) and Polyfork (3D), downloaded on first use.
- **Familiarity and discussions:** each reply silently updates an estimate of how well you know the concepts it touched; the tutor uses it to pitch its answers, and the **Knowledge** view shows it read-only. Ask for a discussion to get a small group chat inside the reply, where classmates at different levels and the tutor talk the idea through. Reply inside the card; your next question in the conversation closes it and carries its gist forward.
- **Map previews:** each conversation box shows chips for its visuals, diagrams, videos and discussions; click one to open the chat at that item.
- **Usage:** each final reply shows a token line, including media work, and **Settings → Usage** charts history.

Requested videos are planned by the smart model, which also audits each cut and returns issues, never code. The conversation's chat model writes the shared set pieces, every cut's code and any fixes. Each cut is 2D or 3D: Remotion (with Three.js and a moving camera for 3D) or Manim for math. An explicit request for 2D makes every cut 2D. An explicit request for 3D makes most cuts 3D. Recurring objects are drawn once as set pieces, in 2D and 3D forms, so they look the same in every cut. A piece library in the **Videos** view lets later videos reuse the 2D forms. A video plays live as soon as its first cut is ready, while an MP4 renders in the background into the **Videos** library (with **Show in folder**). Videos aim for 1–2 minutes, with shorter or longer requests supported. Edge TTS supplies narration and timing; subtitles are embedded in the saved video and stay visible in enlarged playback. Playback starts paused. Rendering needs the supported Linux environment with bubblewrap and Chromium's system libraries. Source/media-size budgets and finite processing timeouts still apply; long or complex renders can fail. A failed video stays failed until explicit Retry.

## Keyboard controls

| Focus or action | Keys / control |
| --- | --- |
| Move between controls | Tab / Shift+Tab |
| New chat | Ctrl+Shift+O, also while typing |
| Hide or show the sidebar (top bar on narrow screens) | Ctrl+Shift+F |
| Activate a button; choose a menu item | Enter / Space; arrow keys in menus |
| Send a question / add a newline | Enter / Shift+Enter |
| Pan the focused map | Arrow keys; Shift moves farther |
| Move a focused conversation box | Arrow keys; Shift moves farther |
| Open a focused box | Enter / Space |
| Zoom and fit | Tab to minus, plus or **Fit tree**, then Enter |
| Fold branches, select a model, expand/collapse chat | Tab to the labeled control, then Enter |
| Add or remove a custom endpoint | **Map menu → Settings → Connections**, Tab to **Add endpoint** or a row's **Remove**; the model menu's **Custom endpoint settings** focuses Add endpoint directly |
| Swap model profiles | **Map menu → Settings → Models**, Tab to **Model profile**, Enter, then arrows and Enter; the chat, smart and quick thinking roles below edit the active profile |
| Select an exact passage | Tab to **Select passage in tutor reply N**, activate it, then hold Shift and use arrows in **Select tutor passage**; Tab to **Ask about selection** |
| Cancel passage selection / return from chat to map | Escape (close the current selection or form first) |
| Stop the selected conversation's reply | Tab to **Stop**, then Enter |

Optional **Settings → Vim canvas bindings** is off by default. With the map or box itself focused, `h j k l` act as arrows, uppercase moves farther, `=` or `+` zooms in, `-` zooms out and `f` fits. These aliases do not apply while typing, selecting text or using menus and dialogs. **Map menu → Help** also explains navigation.

