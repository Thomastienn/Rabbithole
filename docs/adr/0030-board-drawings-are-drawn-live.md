# Board drawings are drawn live, never reused from the piece library

The board gets a `drawing` op: the tutor writes a small SVG inline in its board reply, a few paths in the drawing's own units, and the board draws them stroke by stroke in colours chosen from the app's theme. Drawings are never taken from the piece library, even though it already saves a 2D form of every set piece from visuals and videos.

The owner found board pages plain: sketch-like components cover structure, but not an object or a scene. Visuals look good but take too long to generate for a board that talks in real time, and the owner rejected stock icons as ugly. A saved piece would draw instantly and in house style, but it would appear finished. The board's point is that the learner watches the idea being made in step with the tutor's words, so a drawing must be built live. We accept rougher pictures than visuals and more tokens per board reply, and we cap a drawing at about a dozen paths to keep replies fast.

## Considered Options

- **Reuse a saved piece by name, falling back to a live drawing:** this was rejected because a reused piece shows up whole instead of being drawn while the tutor speaks.
- **A background call to the visual model:** this was rejected because the drawing would arrive seconds after the sentence about it, the same slowness that rules visuals out on the board.
- **A stock icon set:** this was rejected because the owner finds icons ugly and out of place next to the house style.
