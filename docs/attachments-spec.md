# Attachments

Decided with the project owner on 2026-11-14 (grilling session). Spec D of four; see [setup and tutor style](setup-and-tutor-style-spec.md). Terms follow `GLOSSARY.md`; **attachment** was added in this session. Everything not named here keeps its current behavior.

## Problem Statement

The learner cannot give the tutor anything but typed text. Homework photos, lecture slides, scanned notes, textbook PDFs and code files must be retyped or described. Models differ: Claude and Codex read images, many custom endpoint models do not, and a PDF may hold typed text, embedded figures or pages of handwriting. Turning every page into an image would waste tokens; extracting only text loses scans and figures; plain OCR misreads handwriting.

## Solution

The learner attaches images (PNG, JPEG, WebP), PDFs and plain-text files to a question by the paperclip button, by pasting or by drag-and-drop. Each attachment shows as a chip on the question; clicking it opens the file. The app sends each file in the cheapest form that keeps its content:

- Text files are sent as text.
- Images are sent as images when the chat model can read images.
- PDFs are read by their structure: visible text is sent as text, substantial embedded images are sent as images, and a scanned page is sent as its page image.
- When the chat model cannot read images, the app runs local OCR on them and sends the text. The chip shows an OCR icon explaining that the tutor got recognised text, which can miss handwriting and diagrams, and suggesting a model that reads images. If OCR is unavailable too, sending fails with that reason.

Each chip says how its file reached the tutor: sent as image, read as text, or OCR. Child conversations do not receive the files; their inherited context carries what matters.

## User Stories

### Attaching

1. As a learner, I want to attach a file with a paperclip button, so that I can pick files from disk.
2. As a learner, I want to paste a screenshot into the question box, so that I can ask about what is on my screen quickly.
3. As a learner, I want to drop files onto the question box, so that I can drag from my file manager.
4. As a learner, I want to attach several files to one question, so that I can send a whole worksheet.
5. As a learner, I want to see the chosen files as chips before sending and remove any of them, so that I send only what I mean.
6. As a learner, I want to send attachments with no typed text, so that "here is my homework" is not required.
7. As a learner, I want images, PDFs and text files (including code) accepted, so that the common study files work.
8. As a learner, I want an unsupported file type refused with the reason before sending, so that I am not surprised later.
9. As a learner on my own computer, I want no app limits on file size or count, so that I can send whatever I need.
10. As a learner, I want the provider's "too long for this model" error shown in the reply when a file exceeds the model's context, so that I know to split it.

### How files reach the tutor

11. As a learner using Claude or Codex, I want images sent as images, so that the tutor sees them directly.
12. As a learner using a custom endpoint, I want an "Accepts images" switch for each model, off by default, so that the app never sends images to a model that cannot read them.
13. As a learner, I want text files sent as text, so that they cost as little as possible.
14. As a learner, I want a PDF's typed text sent as text, so that a long document does not become hundreds of images.
15. As a learner, I want a PDF's figures and photos sent as images, so that the tutor can explain diagrams in my slides.
16. As a learner, I want tiny logos and icons in a PDF skipped, so that I do not pay for decoration.
17. As a learner with a scanned or handwritten PDF, I want each scanned page sent as its image, so that the tutor reads my handwriting rather than a scanner's bad OCR.
18. As a learner, I want diagrams drawn as vector lines in a PDF to come through as their text labels, accepting that their shapes are lost, so that I know this limit exists.
19. As a learner whose chat model cannot read images, I want local OCR used automatically, so that my scans still reach the tutor in some form.
20. As a learner, I want an OCR icon on the chip that explains, on hover or click, that OCR text can miss handwriting and diagrams and that a model which reads images would do better, so that I understand a weak answer.
21. As a learner with no internet the first time OCR is needed, I want sending to fail with "This model can't read images and OCR language data couldn't be downloaded", so that I know why and can retry online or switch model.
22. As a learner, I want each chip to say "sent as image", "read as text" or "OCR", so that I know what the tutor actually saw.

### Afterwards

23. As a learner, I want my attachments kept with the question they came with, so that I can reopen them later.
24. As a learner, I want attachments deleted when their conversation is deleted, so that nothing lingers.
25. As a learner on a custom endpoint, I want images sent only on the turn I attached them, with later turns showing a placeholder, so that every later question does not pay for them again.
26. As a learner who needs the tutor to look again, I want to attach the image again, so that I control when it is re-sent.
27. As a learner branching from a reply about my attachment, I want the child's inherited context to include the document text and image names, so that the child knows what I was discussing without receiving the files.
28. As a learner, I want the conversation title written from the attachment's text when I sent only a file, so that it is named sensibly (spec B).
29. As a learner, I want attachment usage counted in the reply usage line like other input, so that I see what files cost.

## Implementation Decisions

- **Storage.** Attachments are files under the app data directory, one folder per conversation, with a new additive table: id, conversation, message, original name, media type, size, delivery summary (per file: image, text, OCR) and created time. A mixed PDF stores comma-separated delivery kinds and shows each label on its chip. Extracted images live beside the original PDF; Retry prepares the original again for the current model. Deleting a conversation deletes its rows and folder. Messages stay plain text.
- **Upload API.** The send route accepts multipart form data with the question text and files; the existing JSON body keeps working. Attachments are saved and prepared before the provider call; preparation failures refuse the send with the reason. The client serves an attachment back through an asset route scoped to its conversation, with a safe content type and `Content-Disposition` so files never execute in the app origin.
- **Preparation module.** One server module turns each saved file into prepared parts: `{ text }` or `{ image }` entries in order, given whether the chat model reads images. Text files: UTF-8 text with a file name header. Images: passed through when the model reads images, otherwise OCR text. PDFs: read with `pdfjs-dist`.
- **PDF reading.** For each page, from the operator list and text content: visible text (text render modes other than invisible) becomes text; each embedded image whose drawn area covers at least 10% of the page becomes an image part; a page whose content is one image covering most of the page plus only invisible text is a scan, sent as that image with its hidden OCR text ignored. Vector drawings are not rasterised; only their text survives.
- **OCR.** `tesseract.js` runs in a worker on the server for image parts when the chat model does not read images. Language data (English) downloads on first use and is cached in the app data directory. If OCR cannot start, preparation fails with the reason and the send is refused.
- **Model capability.** Claude and Codex models read images. Custom endpoint models gain a per-model `acceptsImages` flag, stored with the endpoint, default false, toggled in endpoint settings.
- **Provider adapters.** Each adapter accepts prepared parts with the learner message:
  - Codex: image parts as the app-server's local image input, text parts as text input.
  - Claude: the CLI switched to stream-json input for messages with images, carrying image content blocks.
  - Custom endpoints: OpenAI-compatible content arrays with `image_url` data URLs, only on the turn the attachment belongs to; history turns replace each image with `[image: name]`.
- **Compaction.** The quick thinking model receives attachment text and image names only.
- **Chip.** A message attachment chip shows name, type icon and delivery label; the OCR state adds an icon with an explanatory popover. The composer shows pending chips with remove buttons. Paste and drop feed the same handler as the paperclip.
  - Superseded on 2026-11-14 by the attachment layout redesign (epic TreeTutor-ppo, mockup `docs/mockups/attachments.html`, DESIGN.md Attachments). The chip becomes a **slip**. A sent question shows its files above the bubble, with images as **plates**. Pending files sit in a tray inside the composer. Dragging files over the composer shows a drop state. The slip's meta line shows type and size before sending and type and delivery after; it shows no page or image counts. Unsupported types are refused in the browser when added, and the server refusal stays as the backstop.
- **Dependencies.** Only widely used, actively maintained libraries: `pdfjs-dist` (Mozilla) and `tesseract.js`. Normal semver ranges; no exact pins required.

## Testing Decisions

- Tests assert the prepared parts and what each provider receives, plus what the chip shows; never library internals.
- **Seams.** (1) The preparation module as a unit with small fixture files in `test/fixtures/`: a text file, a typed PDF, a PDF with a large figure and a small logo, a scanned page with an invisible OCR layer, and a vector-only page; OCR stubbed behind an injected recogniser, plus one OCR-unavailable case. (2) Each provider adapter with its existing fake (`test/support/fake-openai.mjs`, the Codex protocol fixture, the Claude launcher fake): image parts shaped correctly, custom endpoint history placeholders (`test/providers/openai-stream.test.mjs`, `test/providers/codex.test.mjs` are prior art). (3) `createApp` with a fake provider for multipart send, storage, delete with the conversation, and the refusal paths (`test/http/app.test.mjs`). (4) A component test for the composer chips and the message chip states including the OCR popover.
- No real OCR run is kept: it downloads language data, and the real-tool scripts were removed (Rabbithole-4jx.5).

## Out of Scope

- Word, PowerPoint, spreadsheet and other Office formats.
- Rasterising vector diagrams in PDFs.
- OCR languages other than English.
- Branching from a passage inside an attachment.
- Attachments in the video library or the knowledge graph.
- Sending attachments to the smart model for visuals.

## Further Notes

- Unconfirmed: the exact Codex app-server image input shape and the Claude CLI stream-json image block support in the installed versions; the first implementation ticket confirms both against the real CLIs before the adapters are written.
- `tesseract.js` fetches its language data from a CDN by default; the owner accepted a first-use download.
