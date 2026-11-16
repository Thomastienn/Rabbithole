Remotion craft (fixed guidance):

- Drive every animation from useCurrentFrame() with interpolate() or spring(). CSS transition and animation and Tailwind animation classes do not render; never use them.
- Get fps from useVideoConfig() for every seconds-to-frames conversion, including Sequence from and durationInFrames, for example from={2 * fps}.
- Keep useCurrentFrame() in the smallest component that needs it, so unrelated parts do not re-render on every frame; keep frame coordinates unchanged when you extract a component across a timing boundary.
- interpolate() does not clamp by default: pass extrapolateLeft: "clamp" and extrapolateRight: "clamp" unless the value should keep moving past the range.
- Shape timing with the easing option: Easing.bezier(0.16, 1, 0.3, 1) for a quick settle, Easing.spring({damping: 200}) for a push with no bounce.
- For scale animations pass output: "perceptual-scale", because linear scale looks slower the larger it gets.
- Several keyframes take one input array and one output array; pass an easing array with one item fewer than the keyframes to ease each segment differently.
- posterize: n samples only every nth frame; use it only when a stepped look is the point.
