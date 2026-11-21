# Models return structured data only through plain tool calls

Tutor replies embedded fenced JSON blocks for visuals, videos, discussions, the verdict and the notes, beside eight `:::` layouts, and the smart model returned each video plan as one large JSON object. Frontier models coped. Every other model we tried mangled a block, mixed the layout and block syntaxes, or failed one plan field, and no non-frontier model ever got a video past its plan. We decided that anything structured a model returns comes back as an ordinary tool call, while prose and code stay text. The tutor calls a visual tool where the visual belongs; the server starts drawing at once and answers "queued" so the reply continues. Videos, discussions and, at the end of each reply, the verdict and notes go through tool calls too. The smart model builds a video plan through small calls, one per colour, recurring object and cut, and the cut audit reports through calls. The server validates each call itself and returns a plain error that the model fixes for that call alone; we never turn on strict or constrained schema modes. Models without native tool calling write the same call as Hermes-style `<tool_call>` text, the format most open models are trained on. We accepted an extra request after each mid-reply call, cached on most providers, and the verdict arriving at the end of a reply instead of near its start, in exchange for a format models are trained on and failures confined to one call.

ADR 0008 still holds that the chat model marks suggestions and next questions itself; only their delivery changes from a hidden block to a tool call.

ADR 0016 later moved the verdict and notes out of the tutor's tool calls: the tutor marks its notes inline, and quick thinking writes the verdict. ADR 0017 places each visual by a marker in the text. ADR 0018 moves visuals and discussions from tool calls to markers that carry their fields; videos stay tool calls.

## Considered Options

- Keep the fenced blocks and loosen their parsing. Cheapest, but the blocks stay an invented format every model must learn from the prompt.
- Batch every call after the prose, anchored to a quoted phrase. One request per reply, but visuals would start only after the reply ends, which is too slow.
- Provider strict or JSON-schema modes. Guaranteed shape, but support is uneven across endpoints and proxies, and plain calls are what models are trained on.
- Give the verdict and notes back to the quick thinking model. A smaller tutor prompt, but suggestions and next questions would arrive after the reply.
- Wrap Hermes Agent as the harness. It brings the same conventions, but adds a Python runtime and a competing memory and skill system, and gives up provider-first tools (ADR 0003).
