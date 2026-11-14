# Videos are planned cuts played live, with Manim as a required engine

A video was one model-written Remotion composition, rendered frame by frame to an MP4 before the learner could watch it: about five minutes for a one-minute video, a single scene and a fixed resolution. We decided instead that the smart model plans a video as a sequence of cuts sharing a short style brief. The cuts are written and narrated in parallel and played live in the browser with `@remotion/player`, inside the same isolated sandbox as visuals. Playback starts when the first cut is ready and stays sharp at any size. A 1080p MP4 renders in the background only for the video library and downloads. For math cuts, the smart model may choose Manim, so TreeTutor installs a pinned Manim (Python) into a project-local environment, even though the app is otherwise Node-only. We accepted live execution of model-written code in the sandbox, and a Python and system-library dependency, in exchange for near-instant, sharper and better-edited videos.

## Considered Options

- Keep one composition and only raise render concurrency and tune the prompt. This was cheaper, but it kept the single cut and the render wait.
- Use KaTeX inside Remotion instead of Manim. This avoided Python, but the project owner wanted Manim's math animation.
