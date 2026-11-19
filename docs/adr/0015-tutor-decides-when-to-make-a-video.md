# The tutor decides when a video is wanted; no server check of the learner's words

`make_video` was refused unless the learner's message matched an English regex: a verb such as make, show or want shortly before "video", "animation" or "clip". It guarded against the tutor starting a video nobody asked for, which costs about a hundred thousand output tokens and minutes of work. It also refused real asks such as "can u quicky a short video how to play" and "can you do a video?", refused every ask in another language, and the tutor then invented a reason it failed. The tool-calls spec had already moved the "only when asked" rule into the tool's description, but the regex stayed. We decided to remove the server check and let the tutor judge. It starts a video only when it is sure the learner wants one. When the learner only hints at a video, or still does not follow after the explanation, the tutor may offer one as a next question, as a last resort, and choosing that offer counts as the ask. We accepted that a confident but wrong tutor can start an unwanted video, in exchange for never refusing a real ask in any wording or language and never spending a video's cost on a guess.

## Considered Options

- Loosen the regex. Fewer refusals, but still English-only and still a guess at intent from keywords.
- On a regex miss, show a "Start this video?" card instead of refusing. Safe, but a new card state, and every non-English ask would need the extra click.
- Let the tutor start videos on its own whenever one would help, as it does with visuals. Most helpful when right, but it spends a video's cost without the learner choosing it.
