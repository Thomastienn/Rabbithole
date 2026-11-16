# One house style: every object drawn, real media only as exhibits

Videos mixed flat Fluent emoji, faceted low-poly Polyfork models, model-drawn SVG and three.js pieces, so objects in one video looked cartoonish, sketchy or realistic side by side. We decided on one house style for all visuals and videos (detailed flat illustration in 2D, stylised Blender-like modelling in 3D) and retired both stock catalogs, so every object is drawn in that style and reused through the piece library, which now saves each set piece's 2D and 3D forms. Real web images, quotes and video clips come back only as exhibits: framed as real, credited as resources, never standing in for a drawn object. The server fetches exhibits, and downloads and trims clips, then hands them to the cut as data, so the cut sandbox stays offline and the saved MP4 shows what played live. We accepted more model tokens per video, a video-downloader dependency and no licence checks on exhibits (the app is for personal use) in exchange for videos that look like one world.

## Considered Options

- Keep stock catalogs and restyle them. Recolouring cannot change a catalog's shapes, so Fluent stays emoji-like and Polyfork stays faceted.
- Keep stock catalogs only as a fallback when drawing fails. The fallback would bring back the mixed look in exactly the videos that already struggle.
- One style per video, chosen by the planner from a fixed set. Pieces in different styles could not be reused across videos, splitting the piece library.
- Embed web clips as live iframes. This needs network access in the sandbox, and the background MP4 render would not capture them.
