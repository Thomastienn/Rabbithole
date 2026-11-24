# Concepts merge automatically

The knowledge graph had a manual "Merge concepts" dialog and no other deduplication beyond case-insensitive names and a prompt asking the quick thinking model to reuse known names. By 2026-11-24 the graph held 655 concepts and 74 topics, no merge had ever been made, and plain duplicates had piled up: Threads and thread, promise and Promises, Perseverance and Perseverance rover, and topics such as Networking and Computer networking. A learner will never search hundreds of concepts for duplicates, and split concepts split their familiarity evidence, which weakens every estimate the tutor sees. We decided that when a concept or topic is recorded, a close embedding match is confirmed by the quick thinking model and the two are merged at once, keeping the other name as an alias; a one-time cleanup merges the duplicates already saved, and the manual dialog is removed. A merge moves evidence, links and topics onto the kept concept and deletes the other, so a wrong merge cannot be cleanly undone. We accepted that risk, kept small by requiring both the embedding match and the model's confirmation, in exchange for a graph that stays clean without the learner.

## Considered Options

- Keep the manual dialog. Unused in practice, so duplicates keep growing.
- Suggest merges for the learner to approve. Still asks the learner to review the graph, which they have said they will not do.
- Merge on embedding similarity alone. Cheaper, but near neighbours such as Lock and Locking, or Dispatch and Dispatcher, are not always the same concept.
