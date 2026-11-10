# Phrase-matched suggestions — TreeTutor-u7v.2

Verified 2026-11-10. The model receives the answer once and returns phrase text plus an optional concept. The server finds exact occurrences after the previous match, then anywhere without overlap, then with whitespace runs treated as equivalent. Matches still pass the shared exact-slice and UTF-16 surrogate-boundary check. Stored passage fields, graph extraction, branch behavior, corrections and usage accounting retain their existing contract.

Matching is case-sensitive. Whitespace fallback scans from the start for the first non-overlapping occurrence. Supplied offsets are ignored. The one-to-six-word and semantic selection rules are prompt instructions; the server does not attempt to classify definitions, topics or headings.

## Integration and build checks

- The new HTTP-seam checks first failed against the old implementation: phrase-only output produced no saved passages, and requests contained `answerWords`.
- `node --test test/suggestions.test.mjs`: 16/16 pass after implementation. Both native adapter protocols are exercised with **fake launchers**, not live inference. Coverage includes in-order occurrence selection, repeated phrases, exact-before-whitespace priority, fallback before the cursor, exhausted repeats, overlaps, missing/invalid picks, escaped punctuation, exact raw whitespace storage, rejected split surrogates, and ten kept passages without a count cap. The request contains the answer once and no offset table on both providers.
- Existing HTTP integration checks pass for concepts, links, evidence, restart persistence, suggestion branching and corrections. Unparseable output still saves a failed suggestion with reported usage; manual branching remains available.
- `npm test`: 153/153 pass, no skips, about 39 seconds.
- `npm run build`: type-check and production build pass; Vite reports its large-chunk warning.
- `npx astryx doctor --built dist`: exit 0, 20 pass, 0 fail, 2 font-loading warnings.
- `node --check scripts/verify-suggestion-phrases.mjs` and `git diff --check`: pass.

No UI changes or browser/E2E checks were needed for this server-contract task.

## Native comparison

[Raw successful evidence](suggestion-phrases-results.json) contains each saved question, answer, inherited context, familiarity and known-concept input; both prompts; every exact model pick; kept spans; graphs; provider-reported usage; and dropped-pick counts. These are **live native model calls**, separate from the fixture integration checks above.

Run once per prompt per reply, ten successful calls total, using native Codex app-server with `gpt-6-luna` for both formats. Every call starts a fresh session. Existing app-owned ChatGPT consent stays in its original directory under an exclusive lock; no credential copying or API-key substitution. The source SQLite database is opened read-only and backed up to an isolated snapshot. Inference does not change saved learning trees or graph data.

The corpus is the five most recent completed saved replies of at least 140 characters, ordered oldest first: two earlier synthetic root/leaf verification exchanges already in local storage, followed by three actual tournament-tree learning replies. This small mixed corpus is a spot check, not a broad quality benchmark. Both formats receive identical snapshot inputs, including current familiarity, rather than reconstructing historical graph state. No retry or prompt tuning was performed on the successful Codex comparison.

Reproduce against the then-current local database with:

```sh
node scripts/verify-suggestion-phrases.mjs /tmp/suggestion-phrases-results.json eadefce --codex
```

The old module is loaded from commit `eadefce` (full revision recorded in JSON); the new source SHA-256 is recorded there too. Re-running makes new paid model calls and may produce different picks.

An initial native Claude/Haiku old-prompt call failed with `You've hit your 5-hour limit · resets 4pm (America/Edmonton)`, despite a signed-in status. [Failed attempt](suggestion-phrases-claude-limit.json) records that error and unavailable usage. Claude was not retried; the shared comparison used Codex instead. This is not Claude-native acceptance evidence.

`input` below is provider-reported non-cache-read input, `output` is reported output. Only the old hallmark call also reported cache-read input: 7,040 tokens. Picks include dropped picks.

| Saved reply (message prefix) | Old input / output | Old picks / dropped | New input / output | New picks / dropped |
| --- | ---: | ---: | ---: | ---: |
| Root definition (`7b0486cf`) | 8,997 / 271 | 1 / 0 | 8,454 / 76 | 0 / 0 |
| Leaf definition (`24edfe19`) | 8,902 / 27 | 0 / 0 | 8,446 / 27 | 0 / 0 |
| Tournament tree (`6ed841cd`) | 15,721 / 614 | 12 / 0 | 9,156 / 353 | 6 / 0 |
| Winner tree (`4db47db0`) | 14,492 / 590 | 7 / 1 | 9,744 / 140 | 0 / 0 |
| Hallmark (`6bc8c6cb`) | 5,614 / 196 | 2 / 0 | 9,433 / 427 | 2 / 0 |
| **Total** | **53,726 / 1,698** | **22 / 1** | **45,233 / 1,023** | **8 / 0** |

Including cache reads, total input fell from 60,766 to 45,233 tokens (**25.6%**). Non-cache-read input fell **15.8%**; output fell **39.8%**. Provider overhead is included in these native usage values. These are token counts, not a dollar-cost estimate.

## Picks and interpretation

- Root definition: old picked the entire sentence defining the question's topic; new returned none. Leaf definition: both returned none.
- Tournament tree: old picked twelve items including the topic heading, section headings and a 312-character loser-tree explanation. New picked `knockout tournament`, `internal node`, `min-tournament`, `external sorting`, `naive 2n − 3`, and `Tournament sort`.
- Winner tree: old picked seven headings or long explanatory passages. One pick (`Updates are cheap…`) was dropped because its supplied offsets were wrong. New returned none, while still extracting concepts and links.
- Hallmark: old picked two long explanatory passages (92 and 353 characters). New picked `internal node` and `replaying its path`. This individual new call used more output tokens (427 versus 196); savings are aggregate, not universal.

All eight new picks anchored successfully as exact slices and were one to four words. The new output was generally shorter and avoided most definitions and headings, but semantic compliance is imperfect: `Tournament sort` came from a numbered heading and is explained directly afterwards. In the hallmark reply, `internal node` was tagged as `Loser tree`, an imprecise concept association. The tournament reply also omitted plausible unexplained terms such as `complete binary tree`. These limitations are retained in the evidence; the server only guarantees correct anchoring, and the comparison does not prove perfect relevance or recall. No saved input in this sample had familiarity at or above 0.8, so that exclusion is verified by prompt inspection rather than this live corpus.
