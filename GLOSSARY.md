# Rabbithole

A local app where a curious learner follows their own questions down a tree of connected conversations with an LLM tutor.

## Language

**Learner**:
The person exploring in the app: a curious self-learner following their own questions, not a student working to a syllabus. UI copy addresses them as "you".
_Avoid_: Student, user (in specifications), explorer

**Tutor**:
The role the chat model plays for the learner in a conversation: explaining, answering and following the learner's curiosity. Never shown as a persona in UI copy.
_Avoid_: Assistant, bot, guide

**Learning tree**:
One saved topic of study: a root conversation and every conversation branched from it. The UI may label it "chat".
_Avoid_: Tree (alone), map, chat (outside UI copy)

**Conversation**:
One question-and-answer thread with the tutor inside a learning tree. Never a whole learning tree.
_Avoid_: Node (alone), box, chat

**Conversation node**:
A conversation as drawn on the learning tree map: a chat-style preview of its questions and replies, linked to its parent and children by branches.
_Avoid_: Node (alone), preview node, box, card

**Focused chat**:
The full view of one conversation, where the learner reads replies, asks questions and creates branches.
_Avoid_: Chat page, conversation view

**Branch**:
The parent-to-child link created when the learner asks about a passage of a conversation, chooses one of its groundwork concepts, or asks a free branch from it.
_Avoid_: Edge, connection, subtree

**Free branch**:
A branch the learner starts with their own question instead of from a passage, groundwork or visual part. Like any child, it inherits the parent conversation up to that moment, so the learner can ask on the side, even about something unrelated, without cluttering the parent or switching to another learning tree. A learning tree still has one root; a thought the learner wants apart from it starts a new learning tree.
_Avoid_: Side question (for the link), forest, new root

**Address**:
A conversation's place in its learning tree: the root conversation (trunk) is 1, its children 1.1, 1.2 and so on down (1.1.2). Siblings are numbered in the order they were created (ties by id), so adding a branch never renumbers the conversations before it. Deleting a branch renumbers its later siblings.
_Avoid_: Path, index, number

**Branch ink**:
The series ink a conversation wears, chosen at each fork so siblings read apart. The trunk wears paper; its children take inks 1 to 4 in address order, then repeat. Below the trunk, the children of a conversation take the three inks other than their parent's in order, then the parent's, then repeat; an only child keeps its parent's ink. A passage underline, its address chip, the branch line on the map, the Contents route strip and the conversation node band wear the ink of the conversation they lead to.
_Avoid_: Branch family, family ink, colour group

**Depth stops**:
A row of stops under a conversation node's address chip, one porcelain ring per level below the trunk, joined by a line, the last filled. It shows at a glance how deep a conversation sits; its address gives the exact place. The row has no cap and grows with depth.
_Avoid_: Depth dots, depth badge, level number

**Passage**:
The exact contiguous text of a tutor reply, or of a line in a discussion, that a branch was created from. A branch created from groundwork has the groundwork concept's name as its passage instead.
_Avoid_: Selection, highlight, anchor

**Suggestion**:
A term or short phrase in a tutor reply marked as worth breaking down into a branch: a technical, academic or uncommon term the learner may not know or may want to explore, even when the reply explains it. The tutor marks most of them while answering, including terms it would otherwise only bold as important, and their underlines appear as the terms arrive, so the learner can branch while still reading. A passage the learner selected and asked a brief explanation of becomes a suggestion too, so they never have to select it again. Each suggestion names one concept, which can differ from its words: "fact" in a reply about Prolog names the concept Prolog fact. It carries no proposed question.
_Avoid_: Candidate, Explore further item

**Brief explanation**:
Two or three short sentences about a term or passage of a tutor reply, in plain everyday words a newcomer understands on one read, free to bold or italicise a key word, shown above the branch question box so the learner can understand it without branching. It appears on its own when the learner opens an unexplored suggestion, and only on request for a passage they selected themselves. It explains whatever the term needs in context, such as what it is or why it holds, pitched at the learner's familiarity with it, and leans on no other jargon it does not explain. It stays short and simple every time; detail is what a branch is for. It is kept and shows again when the learner points at that suggestion. Once a branch from it has a reply, pointing at it shows the branch question and the start of the child's first reply instead, as for any branched passage. It is not part of the conversation and the tutor never sees it. Opening one for a suggestion counts as weak evidence that the learner has seen the concept: it lifts an unknown concept a little and dips a well-known one a little.
_Avoid_: Peek, tooltip, definition, summary

**Brief batch**:
The brief explanations the quick thinking model writes ahead for every suggestion of one reply, once its suggestions are final, so opening a suggestion shows its brief without waiting. Each brief is kept as soon as it is written.
_Avoid_: Suggestion batch, ready briefs

**Groundwork**:
A concept that a tutor reply relies on without naming, which the learner may need first, offered as a choice above the reply as soon as the reply begins, before its text: at most three, often none, chosen by the tutor from what it knows of the learner's familiarity. Choosing one at once creates a child conversation that asks what it is. It is never a gate: the learner can ignore it.
_Avoid_: Prerequisite, suggestion, requirement

**Next question**:
A question the learner might ask next, offered under the latest tutor reply: one to three per teaching reply, none after a casual turn. Each is the kind of how, why or what-if a curious person would ask, raised by the reply but not answered in it. As a last resort, one may instead offer a video of the idea, only when the learner hints at wanting one or still does not follow after the explanation; choosing it asks for that video. Choosing one asks it at once in the same conversation; it never creates a branch.
_Avoid_: Follow-up, suggested question, prompt, suggestion

**Quick thinking model**:
The learner-chosen model for compacting prior discussion into inherited context for child conversations and naming new conversations, with its own configurable effort. After each tutor reply it judges familiarity, records the concepts and links the reply touched, merges any that duplicate known ones and may edit the memory note. It marks suggestions, groundwork and next questions only for a reply that arrives without the tutor's own.
_Avoid_: Helper model, cheap model

**Suggestion model**:
The previous name for the quick thinking model, from when it picked suggestions. Existing specifications use this name.

**Chat model**:
The model that answers learner messages in a conversation. Its Settings default starts new learning trees; children inherit their parent's current model and effort.

**Smart model**:
The learner-chosen model for planning videos and auditing their cuts; the chat model writes visuals and cut code. Its model and effort initially follow the Settings chat defaults and can each be overridden independently.

**First-run setup**:
The short screen a fresh install shows before anything else, where the learner installs Claude or Codex if missing and signs in to one, chooses a chat model so they can start asking, and last picks any add-ons to install, or skips them. It appears only on first run and is quick to finish; later changes happen in Settings.
_Avoid_: Onboarding, wizard, setup screen

**Add-on**:
An optional part of the app the learner installs only if they want the feature it enables: video tools, offline Python or web search. The base app chats without any add-on. The learner installs add-ons from first-run setup or the Add-ons page in Settings, and an installed add-on updates itself when a new app version needs a newer one.
_Avoid_: Component, plugin, extension, module

**Download**:
The app fetching an add-on in the background after the learner asked to install it, or when an installed add-on needs an update. The learner sees running, failed and newly finished downloads in the sidebar; saving a video as an MP4 is an export, not a download.
_Avoid_: Update (for the app itself), export

**Model profile**:
A named set of model choices the learner can swap between: a model and effort for the chat model default, the smart model and the quick thinking model.
_Avoid_: Agent, agent profile, preset

**Custom endpoint**:
A learner-added, named OpenAI-compatible provider. The learner can add several, and each appears under its own name wherever models are chosen.
_Avoid_: OpenAI provider, endpoint (alone)

**Effort**:
The supported reasoning setting chosen for a model role or conversation. It is independent of model selection; it does not promise a particular response quality or measured amount of computation.

**Reads images**:
Whether a chat model receives attached images as pictures. When it does not, the tutor gets the image's recognised text instead. Set per model; a model whose provider reports the ability starts with it on.
_Avoid_: Vision, multimodal, accepts images (alone)

**Attachment**:
An image, PDF or text file the learner sends with a question. It belongs to that question's conversation; child conversations learn of it only through their inherited context.
_Avoid_: Upload, file (alone), document

**Tutor style**:
The learner-editable teaching guidance every chat model receives: the tutor's purpose and how it explains. It starts as a default the learner can edit or restore, and it never replaces the app's fixed safety and media rules.
_Avoid_: System prompt, persona, instructions

**Knowledge graph**:
The single record, across all learning trees, of concepts the learner has met and how they relate.
_Avoid_: Learner profile, skill map

**Concept**:
One thing the learner can know, such as "Peterson's algorithm"; shown as a point in the knowledge graph. Different names for one concept, such as "thread" and "Threads", are merged into one automatically, the other names kept as aliases.
_Avoid_: Term, skill, node

**Topic**:
A broad, named group of related concepts, such as "Concurrency". Topics stay general and few; narrow or overlapping ones are merged into broader ones automatically. A concept belongs to one or two topics.
_Avoid_: Section, category, area

**Concept link**:
A connection between two concepts: either "related", or "builds on" when one concept needs the other first.
_Avoid_: Edge, dependency

**Explored concept**:
The one concept a conversation was created to explore: the concept of the suggestion or groundwork it was branched from, or otherwise the concept named for it together with its title, from its first question and anything attached to it. It is always a subject of study, never the activity of studying, such as "lecture learning" or "explaining a file". A conversation may have none.
_Avoid_: Topic, subject, tag

**Ghost tree**:
A faded miniature of another learning tree drawn on a learning tree's map, joined by dashed lines to each conversation node whose explored concept the other tree also explored. Each conversation node joins at most one ghost tree, the tree where the learner explored that concept most; each other tree appears at most once on a map, and a map shows at most five. Choosing a ghost tree opens the other tree's map with its matching conversations marked, where a ghost tree leads back, so related learning trees link both ways. The learner can hide ghost trees.
_Avoid_: Forest, linked tree, reference, ghost branch

**Familiarity**:
The app's estimate of how well the learner knows a concept, derived silently from what the learner's own messages show, such as asking about it, using it correctly in their own words or stating it wrongly (a misconception). The learner never rates or corrects it. Merely meeting a concept in a reply counts for little, since the learner may not have read it. With no evidence, it is guessed from linked concepts, or left unknown when none are known. It fades while a concept goes unused, fast after first learning and ever more slowly each time the learner shows it again. An estimate, never a measured mastery.
_Avoid_: Mastery, score, level

**Discussion**:
A group chat the learner asks for, placed inside a tutor reply like a visual. Three or four classmates and the tutor talk an idea through: classmates ask each other and the learner, and the tutor steps in to untangle or confirm. New lines arrive one at a time, at the pace of people typing, never all at once; lines the learner has already seen show at once when the discussion is reopened. The learner can type while lines arrive and sends once every written line has appeared. Lines still waiting when the discussion closes appear at once. The learner can reply inside it until they next ask in the conversation itself; the discussion then closes for good and stays readable. Only the learner's own messages count as familiarity evidence.
_Avoid_: Classroom, group chat, debate

**Classmate**:
A simulated fellow learner in a discussion, played by the chat model; only classmates relevant to the moment speak. A discussion's classmates sit at different levels around the learner's estimated familiarity, so it still fits if the estimate is wrong. Their mistakes are honest misunderstandings, never planted errors. Each classmate has their own way of thinking, fitting their level, and their own way of talking, like a real person in a casual online chat: everyday words, contractions, slang, the odd swear word or typo, short lines, rarely an emoji, and never buzzwords or a performed eagerness. They talk in the learner's language. Voices differ within a discussion; the tutor stays plain and clear. Classmates do not learn or carry over between discussions.
_Avoid_: Student, peer, persona

**Inherited context**:
The fixed background a child conversation receives at branch creation: the exact passage, when it has one, and a compact paragraph combining its parent's inherited context with the parent conversation, preserving important ideas. It supplies context without answering the child's question; that question is a separate learner message.
_Avoid_: Summary, compacted context

**Memory note**:
One short note about the learner kept across all learning trees: background, goals, preferences and notable progress. The tutor sees the whole note in every conversation. The tutor, or the quick thinking model after a reply, changes it only when something lasting is learned, rewriting or removing entries rather than adding so it stays short. A quiet "Memory updated" mark shows on the reply that changed it. The learner can read and edit it.
_Avoid_: Learner profile, memory (alone), notes

**Usage history**:
The record of reported model usage across learning trees and tasks, retained independently of deleted conversations and media. It contains usage measurements and attribution, not deleted learning content.

**Video library**:
The local collection of generated videos, available independently of their originating learning trees. A saved video remains until the learner explicitly trashes it, even when its source discussion is deleted.

**Export**:
Turning a playable video into an MP4 file on the learner's computer, done only when the learner asks for it. A video plays and stays in the video library without ever being exported.
_Avoid_: Render, download, save

**Everyday analogy**:
A familiar real-life situation used to open an explanation of a concept that is new or abstract to the learner, such as traffic police letting a set number of cars through for a semaphore. The formal idea is then mapped onto it, and where the analogy breaks down is said plainly. Replies, visuals and videos use one now and then, when it helps, never by habit; a video carries one analogy through its cuts.
_Avoid_: Metaphor (alone), real-life example, story

**Tutor tool**:
An action the chat model can take while answering, such as searching the web, reading a page, finding images, running Python or recalling the learner's earlier study. A provider's own tool is used where it has one; the app supplies the rest.
_Avoid_: Plugin, function, skill

**Skill**:
Fixed guidance on a craft, such as teaching, natural writing or animation, that the app gives a model for one kind of work. Some skills are always given; others the model loads only when its work needs them, such as 3D drawing for a 3D visual, and it must load those whenever that work applies. Skills are hidden from the learner and cannot be edited; the tutor style is the learner's own layer on top.
_Avoid_: Tutor tool, tutor style, prompt

**Resource**:
A web page, image, video or document the tutor drew on while answering or making a video, kept with its learning tree so the learner can go to the original directly. Replies cite resources rather than unnamed sources.
_Avoid_: Source (alone), reference, link

**Reply layout**:
The arrangement the tutor chooses for one section of a reply, from a fixed set: plain flow, figure beside text, image gallery, side-by-side comparison, steps, stages, key terms, callout, timeline, check or wide.
_Avoid_: Template, theme, design

**Visual**:
An interactive HTML/SVG/JS fragment shown inside a tutor reply where the tutor placed it, running in an isolated sandbox with no network or access to the app. Older Mermaid diagrams stay diagrams.
_Avoid_: Widget, canvas, artifact (in UI copy)

**New version**:
A redraw of a visual or video that the learner asks for, made from the current version and following their own instruction when they give one, otherwise taking a different approach. The version it replaces stays one switch away; older ones are not kept.
_Avoid_: Regenerate, retry, variant

**Visual part**:
A drawn object in a visual that the learner can point at and ask about, such as the reactor of a power plant. Visual parts nest: a larger part holds the smaller parts drawn within it, such as the reactor's control rods, so the learner can ask about a whole component or one of its details. Every meaningful object in a visual is a visual part; the visual's own controls, such as its buttons and sliders, are not.
_Avoid_: Part (alone), component, element

**Visual control**:
A ready-made control the app gives every visual, such as a button, slider, switch, readout or legend, so the controls of every visual look and work the same. A visual picks a control and its variant instead of building and styling its own. Visual controls are not visual parts.
_Avoid_: Widget, component, input

**Sketch**:
A small diagram the tutor writes in its reply from a fixed set of kinds, such as flow, stack, bars or sequence, drawn instantly by the app in its theme. Sketches show the smaller points inside a section, beside the visuals that carry its main ideas. Each drawn item can be asked about the way a visual part can, and a sketch can be expanded into a visual in its place. Sketches are not figures.
_Avoid_: Mini visual, quick visual, diagram

**Board**:
The surface a conversation can switch to, where the tutor talks the learner through an idea aloud while drawing it, one small change at a time in step with its words. What the tutor says is its reply in the conversation; the board shows ideas as pictures, with as little text as possible. The learner cuts in by voice or typing whenever they want and can draw on it with a pen to show what they mean. A conversation has at most one board.
_Avoid_: Whiteboard, canvas, interactive mode, lesson

**Learner-led**:
The default way a board runs: the tutor explains and keeps going, and the learner asks whenever something is unclear; the tutor does not ask the learner questions.
_Avoid_: Passive mode, lecture mode

**Tutor-guided**:
The other way a board runs, which the learner chooses: the tutor also checks in along the way and asks the learner short questions, never graded.
_Avoid_: Quiz mode, interactive mode, active mode

**Step**:
One stage of a visual that the learner moves through with Previous and Next, or watches in order with Play, which moves slowly enough to follow and pauses briefly on each step. Each step either continues the previous step's scene, changing what is already drawn in place, or changes to a new scene; one visual may mix both. A step animates what it changes, so the learner sees what moved and how, rather than a jump to the new picture. A visual that shows every stage at once has no steps.
_Avoid_: Slide, frame, page

**Cut**:
One continuous segment of a video with its own part of the narration and its own animation. A video is a planned sequence of cuts sharing one look, joined by transitions under a single narration track.
_Avoid_: Scene, clip, shot

**Set piece**:
A drawn object that recurs across the cuts of one video, such as a satellite or a house, defined once for the whole video so it looks the same in every cut. It has a 2D form and a 3D form of the same object, both in the house style, and takes its colours from the video's palette roles and its own true colours, so it can be reused in another video. A set piece may be built from other set pieces, its parts, such as a city drawn from many people, cars and houses, so a common object is drawn once and reused wherever it appears. A piece with no fitting part draws everything itself.
_Avoid_: Model, asset, prop, stock piece

**Part**:
A set piece used inside another set piece, such as the person in a city. It is a set piece of its own, saved and reused like any other; improving it improves every piece that uses it in future videos.
_Avoid_: Child piece, sub-piece, component

**Piece library**:
The local collection of set pieces from earlier videos, each with its 2D and 3D forms, shared across all learning trees and browsable from its own view. A new video reuses a close match, improves one into a new version of the same piece, or draws a new piece, and records each choice with its reason; that choice covers the 2D and 3D forms together, and parts are saved and reused as set pieces of their own. A cut audit that finds a saved piece poor or off the house style replaces it with a better version for future videos; saved videos keep how they looked. It holds only drawn set pieces, never exhibits.
_Avoid_: Component cache, asset library

**Stock piece**:
A ready-made 2D or 3D object from an outside catalog, used as it is instead of drawing its own. Retired: outside catalogs do not match the house style, so visuals and videos now draw every object themselves.
_Avoid_: Asset, model, prop

**House style**:
The one look every drawn object in a visual or video shares, across all videos. In 2D it is detailed flat illustration: recognisable shapes and parts, a few shades for form, clean edges; it may add layered depth or an isometric view where that helps, or stay flat. In 3D it is stylised modelling like a clean Blender scene: believable proportions, smooth shading, a few named finishes such as matte, metal or glass, soft low-contrast surface patterns such as wood grain or panel lines in the object's own colours, soft light and soft shadows, moderate detail. Hand-drawn, cartoon, emoji, faceted low-poly and photoreal looks are outside it. Manim math cuts keep their own look.
_Avoid_: Theme, art style (alone), look (alone)

**Focal object**:
The one thing a cut directs the viewer's attention to at a given moment, while the narration explains it. On-screen labels are attention cues for the focal object that fade once the point lands; in a 3D cut, a label or mark stays on its object while the camera moves. An overview may show the whole scene with no focal object.
_Avoid_: Focus (that is focus mode), highlight, subject

**Exhibit**:
A real image, short quote or video clip from the web that a video shows inside a cut, framed so it reads as real rather than drawn, with a short dim source line. It is a resource of its learning tree, never a set piece, and it does not have to match the house style.
_Avoid_: Stock piece, embed, asset, reference

**True colour**:
The real-world colour a video plan gives an object whose colour carries meaning, such as Earth's blue oceans or a rocket's orange tank, so it reads as the real thing. Abstract roles, such as a highlight or a route, keep the video's palette inks. A set piece keeps its true colours when another video reuses it.
_Avoid_: Custom colour, theme colour, hex colour

**Reference photo**:
A real photo of a real-world object that a video's set piece writer and cut audit look at so the drawing matches the real thing. It is kept as a resource of its learning tree but never shown in the video, unlike an exhibit.
_Avoid_: Exhibit, reference image, stock piece

**Continuing cut**:
A cut that carries on the previous cut's scene from exactly where it ended, joined to it by a hard cut so the two play as one unbroken shot.

**Scene change**:
A cut that starts a new scene, joined to the previous cut by a transition the video plan chooses.
_Avoid_: Cut (for the join itself)

**Cut audit**:
A single review of one written cut by the smart model, from its code and still frames, against the video plan, its set pieces and the previous cut's last frame. It reports problems with layout, consistency, house style, emphasis placement, labels crowding the focal object and missing or unnecessary detail without rewriting the cut; the chat model fixes a flagged cut before it becomes playable.
_Avoid_: Final pass, whole-video audit

**Visual frequency**:
The learner's one app-wide choice of how readily the tutor draws visuals and sketches: Sparing, Often, the default, or Only when asked. Often encourages a visual for each distinct concept a picture helps, never forcing one, with sketches added wherever a section has a shape; Only when asked draws either only at the learner's request. It does not affect videos.
_Avoid_: Visual mode, diagram setting

**Install folder**:
The one folder on Windows the learner chooses when installing, always named Rabbithole, holding the app, its add-ons and the learner's data. Updates keep the data; uninstalling deletes it unless the learner unticks that choice.
_Avoid_: Program folder, data folder (alone)

**Video mode**:
The learner's one app-wide choice of how much model work a video gets: Quality, the default, or Saving. Saving skips cut audits, piece improvements and reference photos, keeping only what a playable video needs. A video uses the mode set when it starts, including a Retry, and keeps how it was made.
_Avoid_: Quality setting, budget mode, cheap mode

**Focus mode**:
The learner's choice to shrink the app's sidebar to the sidebar rail on any page, giving the current page's content the rest of the width. One button at the top of the sidebar switches between the full sidebar and the rail. The sidebar is never fully hidden outside narrow screens.
_Avoid_: Full screen, zen mode, distraction-free mode, hidden sidebar

**Sidebar rail**:
The narrow strip of icons the sidebar becomes in focus mode, giving one-click access to the app's own controls without opening the full sidebar.
_Avoid_: Collapsed sidebar, mini sidebar, icon bar

**Sidebar**:
The panel on the left of every page holding the app's own controls (views, search, new chat, settings) above the page's own contents, such as a learning tree's conversations and resources.
_Avoid_: Top bar, band, nav, drawer (outside narrow screens)

**Theme**:
A named colour palette for the whole app, such as Main Line or Enamel, covering the ground, ink, porcelain and the four branch inks. Each theme has a light and a dark variant; Appearance chooses between them.
_Avoid_: Skin, colour scheme, tint

**Appearance**:
The learner's choice of Dark, Light or System, deciding which variant of the current theme is shown.
_Avoid_: Theme, mode

**Reading font**:
The learner's choice of typeface for tutor replies and other long text they read: the app's own reading face or their system font.
_Avoid_: Font (alone), body font, typography

**Interface font**:
The learner's choice of typeface for the app's own controls, labels and headings: the app's own interface face or their system font. Chosen separately from the reading font.
_Avoid_: Font (alone), UI font, typography
