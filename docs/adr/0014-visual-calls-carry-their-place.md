# Visual calls carry their place in the reply

ADR 0013 placed a visual at the reply text streamed when its call ran, relying on the tutor to stop its message at the call and carry on after "queued". Models do not have to stop there: in a Chat Completions or Messages response all text comes before the tool calls, and many models write the whole reply first and call last, so every visual from such a response landed at the end. One tutor even wrote its own "[show_visual pending]" placeholder inside a `:::figure` where it meant the visual to go, because a figure asked it to put a call in the middle of a text block. We decided that `show_visual` carries its own place: a required `after` with the last few words of reply text the visual follows, and an optional `side` of left or right that sets it beside the section after it. The server uses `after` only when the call came after text in the same response, matching exactly, then ignoring case and whitespace, then falling back to the end of that response's text. `:::figure` stays for images only. We accepted a few more output tokens per visual and a placement that can miss when the tutor misquotes itself, in exchange for visuals that land where the tutor meant on every provider, without asking weak models to interleave text and calls.

This amends ADR 0013's placement only; visuals still start drawing the moment their call runs.

## Considered Options

- Tell the tutor to end its message at the call. Free, but unenforced, and the models that ignore it are the weak ones this app tries to serve.
- Treat placeholder text such as "[show_visual pending]" as a marker. Matches what one model did, but it is an invented text format, which ADR 0013 moved away from.
- Batch every visual after the prose, anchored to a quoted phrase (rejected in ADR 0013). Here the anchor is only a fallback when the call already arrived after its text, so nothing waits for the reply to end.
- Keep `:::figure` around visuals. One layout syntax for images and visuals, but it is the reason a model must put a call inside a text block.
