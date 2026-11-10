# Custom OpenAI-compatible endpoint

This is an explicitly selected third provider, `openai`, alongside the native
Claude and Codex subscription adapters. It is registered only when configured.
New chats still default to Claude. A missing provider fails visibly; it never
routes a saved conversation to another provider.

## API and conversation contract

The base URL is the API root, including any path prefix (for example
`http://127.0.0.1:8080/v1`). TreeTutor appends `/models` for a GET and
`/chat/completions` for a POST. Both send `Authorization: Bearer <key>`.
HTTP and HTTPS are supported; use HTTPS for remote endpoints. User information,
queries and fragments in the URL are rejected. Redirects are refused so the
credential cannot travel to a redirected host.

The catalogue reads `data[].id`; identifiers also serve as labels, with the
first model the default when no model has been selected. Non-text models may
appear because the compatible model-list API does not specify modalities;
incompatible models fail visibly when used. Testing settings calls this
catalogue only: success proves reachability and listing, not chat capability.

Each generation sends `{ model, messages, stream: true }`. Messages are the
tutor instructions in a system message, the fixed inherited branch snapshot
and exact selected passage as labelled conversation data in that message,
then every completed saved user/assistant message in order and the new learner
message exactly once. Failed/interrupted assistant fragments are kept locally
but excluded from replay, matching the other adapters. No remote thread ID is
stored. Provider switching and branch compaction use the same existing paths;
compaction supplies its own instructions and a single data prompt.

Only choice zero's text deltas are emitted, using one local reply item ID.
SSE framing handles split bytes, UTF-8, LF/CRLF, comments and multiline data.
A `stop` finish completes; truncation, filtering, tool calls, upstream errors,
invalid streams and premature EOF fail visibly, retaining partial text.
The stream must contain a successful finish; `[DONE]` alone is insufficient.
Abort cancels fetch/body consumption. Model listing has a 30-second timeout;
generation has a five-minute timeout. Settings changes and shutdown abort all
requests through this adapter.

The compatibility surface follows the official [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
[streaming chunk reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events)
and [model catalogue reference](https://developers.openai.com/api/reference/resources/models/methods/list).
Tools, vision and Responses API support are outside this adapter.

## Settings and credential boundary

All routes inherit the existing loopback Host/Origin/cross-site checks. Every
POST also requires JSON and the server's CSRF token.

| Route | Behavior |
| --- | --- |
| `GET /api/settings/endpoint` | Return `{ configured, baseUrl }`, URL null when unset. |
| `POST /api/settings/endpoint` | Save `{ baseUrl, apiKey }`; return only status and URL. No network call or provider selection. |
| `POST /api/settings/endpoint/test` | Test the saved endpoint with model listing; return only status and URL, or a fixed actionable error. |
| `POST /api/settings/endpoint/clear` | Remove the saved endpoint and unregister the provider; saved discussions remain available. |

Both URL and key are stored in `openai-endpoint.json` in the server's app-data
directory (`TREETUTOR_DATA_DIR`, or `$XDG_DATA_HOME/treetutor`, normally
`~/.local/share/treetutor`). The directory is owner-only; credential files are
mode 0600, written atomically through a new owner-only temporary file and
renamed. Loading enforces owner-only permissions and refuses symlinks. The key
is held in private server memory and never placed in SQLite, provider process
environments, browser responses or logs. Clearing unlinks the credential file
instead of retaining a recoverable secret in trash. Invalid saved settings
leave the provider unconfigured and can be replaced or cleared through settings.

Errors use fixed local messages and never forward upstream bodies or exception
details. Catalogue entries containing the key are discarded; extra metadata is
ignored. Text output redacts exact key echoes, including echoes split across
stream chunks, before emission or persistence. This is a bounded exact-secret
boundary, not detection of arbitrary encodings or deliberately transformed
secrets. The configured endpoint necessarily receives the key and inference
history; its operator controls remote retention and billing.

The settings form and model menu integration belong to TreeTutor-sh8.5.
