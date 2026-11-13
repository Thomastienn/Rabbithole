# Custom OpenAI-compatible endpoint

Custom endpoints are explicitly selected providers alongside the native Claude
and Codex subscription adapters. The learner can save several, each with a
unique name (compared case-insensitively), a base URL and an API key. Each
saved endpoint registers as its own provider, labelled with its name in every
model menu. The endpoint migrated from the earlier single-endpoint setting keeps
provider id `openai`, so its conversations need no data migration; endpoints
added later get `openai:<stable id>`. New chats still default to Claude. A
missing provider fails visibly; it never routes a saved conversation to another
provider.

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
| `GET /api/settings/endpoints` | Return the ordered list `[{ id, name, baseUrl, lastTest }]`; never a key. `lastTest` is `null`, `{ ok: true, models, at }` or `{ ok: false, error, at }`. |
| `POST /api/settings/endpoints` | Add `{ name, baseUrl, apiKey }` and register it as a provider; return the list. No network call or provider selection. A taken name returns 400 with `Another endpoint is called <name>. Choose a different name.` |
| `POST /api/settings/endpoints/edit` | Edit `{ id, name, baseUrl, apiKey? }`. Without `apiKey` the saved key is kept, but only for the same base URL; a new base URL without a key returns 400 with `The base URL changed. Enter the API key again so the saved key is never sent to a new host.` The id stays, so conversations and profiles follow. Any change clears `lastTest` and aborts the endpoint's in-flight requests. |
| `POST /api/settings/endpoints/test` | Test `{ id }` by listing models (no chat message); store the result with the endpoint (it survives restarts) and return the list. A failed test stays until the next test or save. |
| `POST /api/settings/endpoints/remove` | Remove `{ id }`: delete its key, abort its in-flight requests and unregister only that provider; return the list. Saved discussions and profiles keep their content and fail visibly when used. |
| `GET /api/settings/endpoint` | Compatibility: `{ configured, baseUrl }` of the `openai` endpoint. |
| `POST /api/settings/endpoint` | Compatibility: save `{ baseUrl, apiKey }` into the `openai` endpoint (named "Custom endpoint" when new). |
| `POST /api/settings/endpoint/test` | Compatibility: test the `openai` endpoint with model listing; return status and URL, or a fixed actionable error. |
| `POST /api/settings/endpoint/clear` | Compatibility: remove the `openai` endpoint. |

Names are 1–80 characters without control characters and must not contain the
key. All URLs and keys are stored as one list in `openai-endpoints.json` in the server's app-data
directory (`TREETUTOR_DATA_DIR`, or `$XDG_DATA_HOME/treetutor`, normally
`~/.local/share/treetutor`). The directory is owner-only; credential files are
mode 0600, written atomically through a new owner-only temporary file and
renamed. Loading enforces owner-only permissions and refuses symlinks. The key
is held in private server memory and never placed in SQLite, provider process
environments, browser responses or logs. Removing an endpoint rewrites the file
without its key, and removing the last one unlinks the file, instead of
retaining a recoverable secret in trash. On first start after the upgrade, an
existing single-endpoint `openai-endpoint.json` is read once (with the same
ownership checks), becomes the first list entry named "Custom endpoint" with
id `openai`, and is deleted. Invalid saved settings
leave the provider unconfigured and can be replaced or cleared through settings.

Errors use fixed local messages and never forward upstream bodies or exception
details. Catalogue entries containing the key are discarded; extra metadata is
ignored. Text output redacts exact key echoes, including echoes split across
stream chunks, before emission or persistence. This is a bounded exact-secret
boundary, not detection of arbitrary encodings or deliberately transformed
secrets. The configured endpoint necessarily receives the key and inference
history; its operator controls remote retention and billing.

The learner-facing controls are in Map menu → Settings → Connections, under
Custom endpoints. Add endpoint opens an inline form (name, base URL, API key)
at the top of the list; Save refreshes the model catalogue, and the key field
is always cleared and never shown back. Each row shows the name and base URL
and its last test result (model count and when, or the failure with what to
do) with Test, Edit and Remove. Edit opens the same form in place of the row;
leaving the key empty keeps it, and changing the base URL warns and requires
the key again. Saving an edit runs a test. Remove asks for confirmation first
and never changes a conversation's provider. With no endpoints, an empty state
offers Add endpoint. Each model
menu groups models under the endpoint name. The compact model menu always
includes a Custom endpoint group, and any endpoint group that cannot list
models shows a settings action that focuses Add endpoint.
See [settings and menu verification](verification/custom-endpoint-settings.md).
