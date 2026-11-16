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
The parent-to-child link created when the learner asks about a passage of a conversation.
_Avoid_: Edge, connection, subtree

**Address**:
A conversation's place in its learning tree: the root conversation (trunk) is 1, its children 1.1, 1.2 and so on down (1.1.2). Siblings are numbered in the order they were created (ties by id), so adding a branch never renumbers the conversations before it. Deleting a branch renumbers its later siblings.
_Avoid_: Path, index, number

**Branch family**:
A first-level branch of the trunk and every conversation beneath it. Each family takes one series ink in address order (amber, leaf, rust, lichen, then repeating); the trunk wears paper. A passage underline, its address chip, the branch line on the map and the conversation node band share their family's ink.
_Avoid_: Subtree, colour group

**Passage**:
The exact contiguous text of a tutor reply, or of a line in a discussion, that a branch was created from.
_Avoid_: Selection, highlight, anchor

**Suggestion**:
A term or short phrase in a tutor reply that the quick thinking model marked as worth breaking down into a branch: used but not explained, and likely unfamiliar to the learner. It carries no proposed question.
_Avoid_: Candidate, Explore further item

**Quick thinking model**:
The learner-chosen model for picking suggestions and compacting prior discussion into inherited context for child conversations, with its own configurable effort.
_Avoid_: Helper model, cheap model

**Suggestion model**:
The previous name for the quick thinking model, describing its suggestion-picking role. Existing specifications use this name.

**Chat model**:
The model that answers learner messages in a conversation. Its Settings default starts new learning trees; children inherit their parent's current model and effort.

**Smart model**:
The learner-chosen model for planning videos and auditing their cuts; the chat model writes visuals and cut code. Its model and effort initially follow the Settings chat defaults and can each be overridden independently.

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
One thing the learner can know, such as "Peterson's algorithm"; shown as a point in the knowledge graph.
_Avoid_: Term, skill, node

**Topic**:
A broad, named group of related concepts, such as "Concurrency". Topics stay general and few; narrow ones are merged into broader ones. A concept belongs to one or two topics.
_Avoid_: Section, category, area

**Concept link**:
A connection between two concepts: either "related", or "builds on" when one concept needs the other first.
_Avoid_: Edge, dependency

**Familiarity**:
The app's estimate of how well the learner knows a concept, derived silently from what the learner's own messages show, such as asking about it, using it correctly in their own words or stating it wrongly (a misconception). The learner never rates or corrects it. Merely meeting a concept in a reply counts for little, since the learner may not have read it. With no evidence, it is guessed from linked concepts, or left unknown when none are known. It fades while a concept goes unused, fast after first learning and ever more slowly each time the learner shows it again. An estimate, never a measured mastery.
_Avoid_: Mastery, score, level

**Discussion**:
A group chat the learner asks for, placed inside a tutor reply like a visual. Three or four classmates and the tutor talk an idea through: classmates ask each other and the learner, and the tutor steps in to untangle or confirm. New lines arrive one at a time, at the pace of people typing, never all at once; lines the learner has already seen show at once when the discussion is reopened. The learner can reply inside it until they next ask in the conversation itself; the discussion then closes for good and stays readable. Only the learner's own messages count as familiarity evidence.
_Avoid_: Classroom, group chat, debate

**Classmate**:
A simulated fellow learner in a discussion, played by the chat model; only classmates relevant to the moment speak. A discussion's classmates sit at different levels around the learner's estimated familiarity, so it still fits if the estimate is wrong. Their mistakes are honest misunderstandings, never planted errors. Each classmate has their own way of talking, like a real person in a casual online chat: everyday words, contractions and light slang, short lines, never buzzwords or a performed eagerness. Voices differ within a discussion; the tutor stays plain and clear. Classmates do not learn or carry over between discussions.
_Avoid_: Student, peer, persona

**Inherited context**:
The fixed background a child conversation receives at branch creation: the exact passage and a compact paragraph combining its parent's inherited context with the parent conversation, preserving important ideas. It supplies context without answering the child's question; that question is a separate learner message.
_Avoid_: Summary, compacted context

**Memory note**:
One short note about the learner that the tutor keeps across all learning trees: background, goals, preferences and notable progress. The tutor sees the whole note in every conversation and changes it only when it learns something lasting, adding, rewriting or removing entries. The learner can read and edit it.
_Avoid_: Learner profile, memory (alone), notes

**Usage history**:
The record of reported model usage across learning trees and tasks, retained independently of deleted conversations and media. It contains usage measurements and attribution, not deleted learning content.

**Video library**:
The local collection of generated videos, available independently of their originating learning trees. A saved video remains until the learner explicitly trashes it, even when its source discussion is deleted.

**Everyday analogy**:
A familiar real-life situation used to open an explanation of a concept that is new or abstract to the learner, such as traffic police letting a set number of cars through for a semaphore. The formal idea is then mapped onto it, and where the analogy breaks down is said plainly. Replies, visuals and videos use one when it helps, not always; a video carries one analogy through its cuts.
_Avoid_: Metaphor (alone), real-life example, story

**Tutor tool**:
An action the chat model can take while answering, such as searching the web, reading a page, finding images, running Python or recalling the learner's earlier study. A provider's own tool is used where it has one; the app supplies the rest.
_Avoid_: Plugin, function, skill

**Skill**:
Fixed guidance on a craft, such as teaching, natural writing or animation, that the app gives a model for one kind of work. Skills are hidden from the learner and cannot be edited; the tutor style is the learner's own layer on top.
_Avoid_: Tutor tool, tutor style, prompt

**Resource**:
A web page, image, video or document the tutor drew on while answering or making a video, kept with its learning tree so the learner can go to the original directly. Replies cite resources rather than unnamed sources.
_Avoid_: Source (alone), reference, link

**Reply layout**:
The arrangement the tutor chooses for one section of a reply, from a fixed set: plain flow, figure beside text, image gallery, side-by-side comparison or step cards.
_Avoid_: Template, theme, design

**Visual**:
An interactive HTML/SVG/JS fragment shown inside a tutor reply where the tutor placed it, running in an isolated sandbox with no network or access to the app. Older Mermaid diagrams stay diagrams.
_Avoid_: Widget, canvas, artifact (in UI copy)

**Step**:
One stage of a visual that the learner moves through with Previous and Next. Each step either continues the previous step's scene, changing what is already drawn in place, or changes to a new scene; one visual may mix both. A visual that shows every stage at once has no steps.
_Avoid_: Slide, frame, page

**Cut**:
One continuous segment of a video with its own part of the narration and its own animation. A video is a planned sequence of cuts sharing one look, joined by transitions under a single narration track.
_Avoid_: Scene, clip, shot

**Set piece**:
A drawn object that recurs across the cuts of one video, such as a satellite or a house, defined once for the whole video so it looks the same in every cut. It has a 2D form and a 3D form of the same object, both in the house style, and takes its colours from the video's palette roles, so it can be reused in another video. A set piece may be built from other set pieces, its parts, such as a city drawn from many people, cars and houses, so a common object is drawn once and reused wherever it appears. A piece with no fitting part draws everything itself.
_Avoid_: Model, asset, prop, stock piece

**Piece library**:
The local collection of set pieces from earlier videos, each with its 2D and 3D forms, shared across all learning trees and browsable from its own view. A new video reuses a close match, derives a variant from one, or draws a new piece; that choice covers the 2D and 3D forms together, and parts are saved and reused as set pieces of their own. A cut audit that finds a saved piece poor or off the house style replaces it with a better version for future videos; saved videos keep how they looked. It holds only drawn set pieces, never exhibits.
_Avoid_: Component cache, asset library

**Stock piece**:
A ready-made 2D or 3D object from an outside catalog, used as it is instead of drawing its own. Retired: outside catalogs do not match the house style, so visuals and videos now draw every object themselves.
_Avoid_: Asset, model, prop

**House style**:
The one look every drawn object in a visual or video shares, across all videos. In 2D it is detailed flat illustration: recognisable shapes and parts, a few shades for form, clean edges. In 3D it is stylised modelling like a clean Blender scene: believable proportions, smooth shading, simple materials, moderate detail. Hand-drawn, cartoon, emoji, faceted low-poly and photoreal looks are outside it. Manim math cuts keep their own look.
_Avoid_: Theme, art style (alone), look (alone)

**Focal object**:
The one thing a cut directs the viewer's attention to at a given moment, while the narration explains it. On-screen labels are attention cues for the focal object that fade once the point lands; an overview may show the whole scene with no focal object.
_Avoid_: Focus (that is focus mode), highlight, subject

**Exhibit**:
A real image, short quote or video clip from the web that a video shows inside a cut, framed so it reads as real rather than drawn, with a short dim source line. It is a resource of its learning tree, never a set piece, and it does not have to match the house style.
_Avoid_: Stock piece, embed, asset, reference

**Continuing cut**:
A cut that carries on the previous cut's scene from exactly where it ended, joined to it by a hard cut so the two play as one unbroken shot.

**Scene change**:
A cut that starts a new scene, joined to the previous cut by a transition the video plan chooses.
_Avoid_: Cut (for the join itself)

**Cut audit**:
A single review of one written cut by the smart model, from its code and still frames, against the video plan, its set pieces and the previous cut's last frame. It reports problems with layout, consistency, house style, emphasis placement, labels crowding the focal object and missing or unnecessary detail without rewriting the cut; the chat model fixes a flagged cut before it becomes playable.
_Avoid_: Final pass, whole-video audit

**Focus mode**:
The learner's choice to hide the app's sidebar on any page, leaving only the current page's content. One button at the top left hides and shows the sidebar: a menu icon while it is hidden, a close icon while it is shown.
_Avoid_: Full screen, zen mode, distraction-free mode

**Sidebar**:
The panel on the left of every page holding the app's own controls (views, search, new chat, settings) above the page's own contents, such as a learning tree's conversations and resources.
_Avoid_: Top bar, band, nav, drawer (outside narrow screens)

**Theme**:
A named colour palette for the whole app, such as Paperback or Forest, covering surfaces, ink, accent and the four series inks. Each theme has a light and a dark variant; Appearance chooses between them.
_Avoid_: Skin, colour scheme, tint

**Appearance**:
The learner's choice of Dark, Light or System, deciding which variant of the current theme is shown.
_Avoid_: Theme, mode
