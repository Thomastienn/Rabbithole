Small deterministic PDFs for attachment preparation tests. Regenerate locally with:

```sh
node test/fixtures/pdf/generate.mjs
```

- `typed.pdf`: typed lines and a spaced `TJ` text run.
- `figure.pdf`: a 48% figure, a caption after it, and a 0.25% logo (same source pixels).
- `scan.pdf`: a full-page image with an invisible, deliberately wrong OCR layer.
- `vector.pdf`: vector paths plus a text label; `empty.pdf`: paths without labels.
- `ordered.pdf`: typed, figure, scan and vector pages in sequence.
- `visibility.pdf`: visible text surrounding saved/restored invisible and clip-only text modes.
- `threshold.pdf`: exact 10%, 9.75%, transformed Form XObject and off-page images.
- `inline.pdf`, `gray.pdf`, `stencil.pdf`, `repeated.pdf`: inline RGB, packed monochrome,
  coloured bitmap stencil, and repeated image placements.

Images contain tiny known pixel arrays so tests can distinguish embedded pixels from a rendered
page. These are synthetic fixtures; they do not constitute live Claude/Codex or real OCR evidence.
