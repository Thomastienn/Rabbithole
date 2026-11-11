# Small colorful diagram steps — TreeTutor-86c.1

Verified 2026-11-11 against the workspace/media refinement spec, stories 63–68.
The implementation extends existing artifacts; it adds no storage migration,
diagram engine, dependency or fixed node limit.

## Behavior and decisions

The tutor can request several ordered visual steps. Every request still has just
title, description, intent and excerpt. Each step gets its own pending/ready/failed
artifact and isolated worker call. All pending cards appear together; sequential
workers bound concurrency and preserve reading order. Six requests per reply is
a runtime bound on model calls, not a shape-count rule. Text stays canonical and
retains the detailed explanation. No new learner control or automatic retry is
introduced.

Cards reuse Astryx Text, Heading, VStack, Collapsible and Lightbox. Multiple cards
receive visible and accessible step numbering. Every state retains its own text
alternative. Flowcharts can assign the four trusted chalk classes; the app alone
defines their colors and solid/dashed/dotted/heavier borders from current theme
tokens. Words and directed connections carry meaning without color. Generated
HTML (including line-break tags), scripts, styles, class definitions, links and
configuration remain rejected. Strict Mermaid parsing/rendering, isolated worker
context, SVG image delivery and the existing CSP are retained.

## Automated evidence

- `node --test test/*.test.mjs`: **188 passed**, including both subscription
  adapter fixtures, multiple steps, invalid tasks, unsafe and malformed source,
  metadata-only tutor context, Stop after a ready step, queued-worker prevention,
  late-result rejection, owned attachments and restart. These use controlled
  providers and real HTTP/SSE/SQLite, not live inference.
- `npm run build`: TypeScript and production Vite build passed. The existing
  large-chunk advisory remains.
- Token lint passed with the suite. Impeccable's detector returned no findings
  for the three changed frontend files.
- `node scripts/verify-diagram-rendering.mjs`: **11 checks passed** with actual
  Chromium and Mermaid. [Machine report](diagram-rendering-results.json) records
  source hashes, theme colors, text alternatives, keyboard enlarge/disclosure and
  focus return, exact repeated-emoji passage offsets, invalid persisted-source
  rejection without execution/network traffic, per-step SSE, five additional
  diagram families, narrow containment and actual server-process restart with
  identical artifacts and no inference. Large flowcharts also render: there is
  no fixed node-count rejection.

Colored node label contrast is **5.77–6.47:1 in light** and **6.87–8.97:1 in dark**.
The check resolves the current card and chalk tokens, verifies all four fills in
actual SVG, and checks dashed borders. Both appearances use visible descriptions
and matching image alternatives. A narrow-layout check preserves all three
step alternatives and contains the drawings. A flowchart starting with an ordinary
Mermaid comment also retains its trusted classes. After this final rendering
edge-case fix, the build, 17 relevant integration/token tests and the 11 browser
checks passed again.

## Live example and readability review

The new shared smoke used **Codex gpt-6.1-terra**, existing app-owned ChatGPT
consent in its original directory, isolated temporary learning data, and native
Codex app-server. No credential relocation, API-key fallback or provider fallback
was added to the product. One tutor call and four separate diagram worker calls
completed; all four artifacts passed validation and rendered in both appearances.
[Native report](diagram-steps-live.json) includes the actual reply, saved sources,
reported usage and seven passing checks. Its 30 seconds includes browser capture;
it is one observed run, not a performance benchmark.
The [saved-example reopening report](diagram-steps-reopen.json) then checks the
final renderer against those same real sources in both appearances and confirms
zero new model generation. It records final source hashes.

I inspected every live card in light and dark separately from checking syntax:

| Step | Readability assessment | Captures |
| --- | --- | --- |
| Sun warms water | One vertical chain, short labels and explicit warms/evaporates/rises arrows. The description states the same process without needing the picture. | [Light](diagram-steps/light-1.png), [dark](diagram-steps/dark-1.png) |
| Clouds form | One process chain, wrapped labels within the shapes, no crossing arrows. Technical terms stay in prose as well as the diagram. | [Light](diagram-steps/light-2.png), [dark](diagram-steps/dark-2.png) |
| Rain falls | A rounded cloud and two named shapes make the direction clear; precipitation has its written explanation in the reply. | [Light](diagram-steps/light-3.png), [dark](diagram-steps/dark-3.png) |
| Water flows back | One purposeful split distinguishes surface flow from soaking into ground. Labeled arrows and the description explain the split without its blue/green distinction. | [Light](diagram-steps/light-4.png), [dark](diagram-steps/dark-4.png) |

The diagrams are tall but readable in the reading column, with one point per
card instead of a combined web of arrows. The controlled seed-growth fixture
separately exercises a simple "leaf kitchen" metaphor and yellow/blue/pink/green
classes in both appearances. The real reply retains explanation of evaporation,
condensation, precipitation, plant water release and alternate water routes.
This visual review establishes legibility and explanatory structure for the
examples, not factual correctness of arbitrary generated replies or measured
child comprehension. No learner study was performed.

Claude was signed in but the [new attempt](diagram-steps-claude-quota.json) was stopped by its provider quota:
"You've hit your 5-hour limit · resets 7:40am (America/Edmonton)". Its saved reply
was failed with no artifacts. After diagnosing that native transcript result,
the shared smoke used authorized Codex. No quota retry loop or runtime restriction
bypass was attempted. Claude/Codex adapter integration fixtures both pass; this
slice does not claim new Claude native success or repeat the full text release.

The [inherited initial report](diagram-steps-live-initial.json) is retained as
earlier-attempt evidence: one of six generated diagrams was safely rejected.
It is not the passing native evidence for this change. A fixture-verifier failure
also exposed a selector counting Lightbox's hidden images twice; the corrected
visible-image assertion then passed. Neither failure was hidden or converted into
a fixture claim of native success.

Reproduce the explicit live check with:

```sh
TT_PROVIDER=codex node scripts/verify-diagram-steps-live.mjs docs/verification/diagram-steps-live.json
```

`TT_PROVIDER=claude` uses native Claude Code sign-in when capacity is available.
`TT_DIR=<prior report dir>` reuses saved example artifacts for captures without
new generation. The broad fixture runner explicitly excludes this native script,
so running `npm run verify` does not silently spend model calls on it. No broad
E2E suite was added or run. Git remains local and unstaged; Ralph owns the commit.
