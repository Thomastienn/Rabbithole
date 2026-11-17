# DeepTutor: learner memory and personalization (research note)

Read on 2026-11-17 from HKUDS/DeepTutor at commit 4c1e000 (2026-11-16) and its technical report, arXiv 2604.26962. The paper's appendices and the frontend beyond grep were not read. Decision from the grilling session that day: adopt nothing yet; revisit once real use shows where Rabbithole's personalization falls short.

## Paper versus code

The paper describes much more than the code ships.

- **Paper**: "Dynamic Personal Memory" as a Trace Forest (one tree per interaction: session summary, planning, tool and evidence nodes, each embedded), read through SearchTrace, ListTraces and ReadNodes tools. A learner profile of session history, an evidence-backed list of confusions and gaps, and the tutor's notes on its own teaching, updated after every interaction by three memory agents in parallel and injected per role under a token budget. No mastery score or knowledge-tracing model.
- **Evaluation (TutorBench)**: 30 knowledge bases, 90 simulated learner profiles, 270 tasks, an LLM student and an LLM judge scoring 1 to 5, on Gemini-3-Flash only. Overall 3.91 against 3.53 for a plain tutor; personalization 4.59 against 4.24. Judge agreement with humans on 45 sessions: Pearson r=0.82. No real-student study. The headline "+29.4%" is a solver-only result with personalization off, not a learning result.

## What the code implements

- **Per-concept knowledge** (`deeptutor/learning/`): knowledge points with a type and `prerequisite_ids`; quiz attempts and evidence; error records with an error type (structural, deviation, application, metacognitive) and a status (active, retrying, review, graduated). A learner's "I know this" override is stored apart from evidence. Teaching observations record whether an explanation helped and are never a mastery judgment. Mastery is weighted accuracy over the last five attempts, capped at 0.5 after one attempt and 0.8 after two. Spaced review uses R=exp(-t/S). All of it lives inside one learning path: concept ids are unique per path, so nothing carries across paths. Rabbithole's cross-tree knowledge graph is already ahead here.
- **Long-term memory** (`deeptutor/services/memory/`): plain files. An append-only trace, per-surface bullet documents whose lines each carry an id and cite their sources, and four summary files (recent, profile, scope, preferences). LLM consolidation runs in update, audit, dedup and merge modes. Facts without a source in the current input are dropped, absolutist words ("mastered", "always", "never") are filtered, summary claims are hedged, and an empty result counts as correct. Weaknesses: consolidation only runs when the user starts it, and injection pastes all four summary files whole.
- **Prerequisites**: validated (no unknown ids, self-references or cycles) but, by the code's own comment, they do not gate anything yet. The only use is listing the current concept's prerequisites and their status for the tutor.
- **Short definitions**: only a Reading-mode "Explain vocabulary" action on selected text, returning one to five terms; terms not found verbatim in the selection are dropped.
- **Sharing**: export only (Markdown books, PDF annotations, Anki with stable ids, calendar). No knowledge-base or learner-model export.

## Ideas worth revisiting

- Struggles with a kind and a resolved status, closed only by later learner evidence, to separate "struggles with X" from a single misconception.
- Teaching observations: what was tried on a concept and whether it helped.
- Memory note entries that cite the message they came from, with a check that drops unsourced ones and a ban on absolutist words.
- Recall results that give "days ago" instead of timestamps.
- A learner claim of "I know this", kept apart from evidence. This contradicts the glossary's rule that the learner never rates familiarity.

## Not worth copying

The paper's embedded Trace Forest and parallel memory agents (not in the code), whole-file memory injection, consolidation the learner must start, and per-path concept ids.
