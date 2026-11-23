# The brief batch streams marker text instead of a tool call

The brief batch returned every brief explanation of a reply through one `write_briefs` call, per ADR 0013. A tool call reaches the server only once its arguments are complete, so nothing was saved until the whole batch ended, 7 to 15 seconds on Codex's Luna, and a suggestion opened meanwhile paid for its own call. Codex 0.171 also hides MCP tools behind its JavaScript `exec` tool, where the call is named `tools.mcp__rabbithole__write_briefs`, while our prompt named `write_briefs` and said not to execute code; on 2026-11-23 Luna answered that no `write_briefs` tool existed and the batch saved nothing (1 of 18 batches). We decided that the brief batch writes plain text: for each term, in order, a line `[[brief: term]]` with the term exactly as given, then its paragraph. The server reads the stream and saves each brief once the next marker or the end of a completed call closes it. A brief explanation is prose, so this keeps ADR 0013's rule that prose stays text; the batch was its one structured job made only of prose. Replaying the 18 real batch prompts on Luna in this format, all 37 runs returned every term exactly, in order, with nothing else, at 19 to 43 words per brief and faster than the tool call. We accepted a format the parser must read, and a brief lost when a model mangles its marker, in exchange for briefs saved one by one and no tool to discover.

This supersedes ADR 0013 for the brief batch only. Every other quick thinking job stays a tool call: in the same logs, Luna found the hidden tool in 67 of 67 calls to mark suggestions, record verdicts and name conversations.

## Considered Options

- Keep the tool call and tell Codex models its real name inside `exec`. It fixes discovery but still saves nothing until the end.
- One on-demand brief call per term, in parallel. No new format, but N times the input tokens and Codex's per-call overhead on each.
- Stream the tool call's arguments and parse partial JSON. Not possible: MCP delivers a call only when it is complete.
