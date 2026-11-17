# Video token report (one-off)

Built on 2026-11-17 from the live database (`~/.local/share/rabbithole/trees.sqlite`, last written 2026-11-17 01:14 local time), opened with `sqlite3 -readonly`. Nothing was written to it. The figures cover every `usage_events` row with `task='video'` at that time. The database predates the stage and cut columns (Rabbithole-75l.2), so this report has no per-stage split.

## Does input include cached tokens?

No. Every adapter stores `input` without cache reads and puts those in `cacheRead`:

- Claude (`server/providers/claude.mjs:259`): `input = input_tokens + cache_creation_input_tokens`; `cacheRead = cache_read_input_tokens`. Anthropic's `input_tokens` already excludes both cache reads and cache writes, so cache writes count as input and cache reads do not.
- Codex (`server/providers/codex.mjs:261`): `input = inputTokens - cachedInputTokens`, `cacheRead = cachedInputTokens`, because Codex's `inputTokens` includes cached reads (comment at line 335).
- OpenAI-compatible (`server/providers/chatStream.mjs:52`): `input = prompt_tokens - cached_tokens`, `cacheRead = cached_tokens`.

So the prompt tokens a model actually read are **input + cached**, and that is the "total in" column below. All video calls in this database went through Codex.

## Method

A video's usage is the set of events whose id is `video:<attempt>:<call>`, where `<attempt>` is the video artifact's current attempt. This is the same join the card uses (`videoUsage` in `server/store/usage.mjs`). "Calls" counts every event. "Reported" counts the events that have token counts: a call with no reported usage is counted as a call and adds no tokens.

## Saved videos

The library has 10 videos and there are 9 video artifacts, all `ready`. Seven artifacts join to usage.

| Video | Created (UTC) | Model | Calls | Reported | Input | Output | Cached | Total in |
|---|---|---|---:|---:|---:|---:|---:|---:|
| How a hook protects a file | 2026-11-12 | none joined | 0 | 0 | 0 | 0 | 0 | 0 |
| Adaptive bitrate streaming | 2026-11-13 | none joined | 0 | 0 | 0 | 0 | 0 | 0 |
| Follow a video through Starlink | 2026-11-14 | gpt-6.1-sol | 31 | 31 | 416,823 | 61,741 | 89,728 | 506,551 |
| Starship's Planned Journey to Mars | 2026-11-15 | gpt-6.1-sol | 16 | 16 | 243,156 | 40,246 | 19,456 | 262,612 |
| Starship to Mars: The Orbital Mechanics | 2026-11-15 | gpt-6.1-sol | 18 | 18 | 270,932 | 51,968 | 34,176 | 305,108 |
| How a four-stroke gasoline engine works | 2026-11-16 | gpt-6.1-sol | 10 | 10 | 129,652 | 11,986 | 20,480 | 150,132 |
| | | gpt-6.1-terra | 13 | 13 | 146,693 | 35,921 | 41,344 | 188,037 |
| Inside a four-stroke gasoline engine | 2026-11-16 | gpt-6.1-sol | 13 | 13 | 155,998 | 19,414 | 37,376 | 193,374 |
| | | gpt-6.1-terra | 13 | 13 | 185,010 | 47,206 | 57,984 | 242,994 |
| Semaphores: two permits, two threads | 2026-11-16 | gpt-6.1-sol | 11 | 11 | 149,331 | 7,177 | 19,584 | 168,915 |
| | | gpt-6.1-terra | 15 | 15 | 193,587 | 25,622 | 71,936 | 265,523 |
| Artemis I: Around the Moon and Home | 2026-11-17 | gpt-6.1-sol | 17 | 15 | 249,479 | 27,051 | 22,272 | 271,751 |
| | | gpt-6.1-terra | 29 | 29 | 525,188 | 62,706 | 124,032 | 649,220 |
| How Starlink Loads Your Video | 2026-11-14 | no artifact | 0 | 0 | 0 | 0 | 0 | 0 |

"How Starlink Loads Your Video" (`ade263cb-…`) is in the `videos` library table but has no artifact, so it has no attempt to join through.

### Totals for joined usage, by model

| Model | Videos | Calls | Reported | Input | Output | Cached | Total in |
|---|---:|---:|---:|---:|---:|---:|---:|
| gpt-6.1-sol | 7 | 116 | 114 | 1,615,371 | 219,583 | 243,072 | 1,858,443 |
| gpt-6.1-terra | 4 | 70 | 70 | 1,050,478 | 171,455 | 295,296 | 1,345,774 |
| All | 7 | 186 | 184 | 2,665,849 | 391,038 | 538,368 | 3,204,217 |

## Events that join to no current attempt

There are 52 video events (36 with counts), all on `gpt-6.1-sol`: input 243,279, output 174,302, cached 101,632, total in 344,911. Together with the joined rows they make up all 238 video events (input 2,909,128, output 565,340, cached 640,000).

| Attempt | First call (UTC) | Calls | Reported | Input | Output | Cached | Note |
|---|---|---:|---:|---:|---:|---:|---|
| c49a1809-… | 2026-11-12 06:45 | 1 | 1 | 4,792 | 2,596 | 4,224 | Id is `video:<attempt>` with no call suffix. The attempt is the current one for "How a hook protects a file". |
| 5d2f9762-… | 2026-11-13 23:26 | 1 | 1 | 5,320 | 4,698 | 4,224 | Same id shape. Current attempt of "Adaptive bitrate streaming". |
| 7e7e7d7a-… | 2026-11-14 21:35 | 19 | 11 | 77,469 | 61,948 | 28,160 | Earlier attempt, message shared with "Follow a video through Starlink". |
| 1d838ed2-… | 2026-11-14 21:40 | 19 | 11 | 58,088 | 52,898 | 47,232 | Earlier attempt, same message. |
| 041b8e3f-… | 2026-11-14 23:47 | 10 | 10 | 84,063 | 47,557 | 9,600 | Earlier attempt, same message. |
| 62de9d91-… | 2026-11-16 17:56 | 1 | 1 | 6,728 | 1,904 | 4,096 | Earlier attempt, message of "How a four-stroke gasoline engine works". |
| 160882fe-… | 2026-11-16 19:00 | 1 | 1 | 6,819 | 2,701 | 4,096 | Earlier attempt, linked to the "Follow a video through Starlink" message. |

The attempt is the first 36 characters after `video:`. The video each row is linked to comes from the event's `message` column. The first two rows have no message link and match their video only by the exact attempt id.
