# Videos take the app theme they are made in

Every video was drawn in one fixed dark-paper palette, whatever theme or appearance the learner had chosen, so a video looked foreign beside the app, most of all in a light theme. Visuals already followed the theme. We decided that a video's palette comes from the app theme and appearance the learner had when the video was asked for: the ground is the theme's body background, raised is its surface, paper and muted are its primary and secondary text, seam and line are paper at low opacity, and the four inks amber, leaf, rust and lichen take the theme's yellow, green, pink and blue hue slots, in the order diagrams use. The video stores this palette in its style brief, so the plan, cut writers, the validator, the Remotion render, Manim clips, the live player and exports all use the same colours. A Retry keeps the palette of the plan it reuses, so kept cuts still match. A video saved before this change uses the default theme's dark palette. True colours (ADR 0009) are unchanged.

We accepted that a video keeps the theme it was made in, and does not change when the learner later switches theme, because Manim clips and exports are rendered pixels. In exchange, every new video matches the app it was made in.

This supersedes the fixed kit palette that ADR 0009 describes. Palette roles and true colours still stand.

## Considered Options

- Keep one fixed palette for every video. Videos stay consistent with each other but clash with every theme but one.
- Recolour videos live to the current theme. Manim clips and exported files are pixels, so only part of a video could follow, and a cut would no longer match its own clip.
