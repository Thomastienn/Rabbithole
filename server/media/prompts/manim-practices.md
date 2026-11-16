Manim craft (fixed guidance; use only the names the kit exports, and skip any advice whose object the kit lacks):

- Animations: use .animate for simple changes; keep run_time between 0.5 and 3 seconds; use smooth for most motion and linear only for constant, mechanical motion; play conceptually related animations together.
- Creation: Write for text, Create for shapes, FadeIn when drawing does not matter.
- Transforms: prefer ReplacementTransform so the variable holds what is on screen; use TransformMatchingTex for equations; set path_arc when a curved path shows the move better.
- Groups: use LaggedStart with a small lag_ratio (0.05 to 0.2) for staggered builds and lengthen run_time with more items; use VGroup for vector objects, arrange after creating, give groups meaningful names, nest groups for rows and columns, and copy() a group before changing a reused one.
- LaTeX: always use raw strings r"..."; MathTex for pure math, Tex for text mixed with math; split an equation into parts you will animate separately, and use substrings_to_isolate so repeated terms can be targeted and transformed.
- Text: MathTex for math, since Text does not render LaTeX; keep font_size consistent for related text.
- Positioning: next_to keeps relationships, move_to places exactly, shift nudges, to_edge and to_corner place against the frame; adjust buff so elements never crowd.
- Updaters: ValueTracker for animated parameters, always_redraw for shapes that follow them, keep updater functions simple, use dt for time-based motion and clear updaters when done.
- Axes and graphs: set ranges without empty space, match x_length and y_length to the range ratio, use c2p for every coordinate, include numbers sparingly, set x_range on plots to skip undefined regions, label graphs and animate their creation.
- Shapes and lines: use Dot for points, set fill_opacity when a shape should be filled (the default is transparent), Arrow for direction and Brace to label a length.
