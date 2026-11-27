# A board is a pool of pages the tutor moves between

A board holds a pool of titled board pages, each a separate 1600×900 space, instead of one strip of areas stacked downward. The tutor opens a new page with a `page` op that records the page and item it came from, and moves to any page with an `open` op. Items placed after that land on the open page. Each learner turn gets a short index of every page in the conversation, built by replaying the saved op lines, so the tutor can return to a side page or reuse one when a later question asks the same thing. Pages are op lines like any other, so saving, replay and branching stay unchanged, and an old `clear` replays as a new untitled page.

The owner saw a single board fill up with everything at once: the main idea, every side question and every repeat, until it was hard to follow. Under the old prompt, a side question was answered "on the same board" and `clear` happened only "when the board is getting full". Once the tutor cleared, it could not get back, because ops reached only the newest area. A conversation also replays only spoken captions to the model, so a tutor whose process restarted had no idea what was drawn. That is why the page index is needed.

When to open, leave or reuse a page is left to the tutor. The prompt encourages it but never requires it, and the app counts nothing and enforces no limit on items per page. The owner wants the tutor to judge when a page is cramped, not hit a fixed budget. The overlap guard from ADR 0028 still runs, now within each page. Coordinates stay as ADR 0028 decided, on each page's own 1600×900 space.

No prototype was run: the owner decided to build it directly. Whether the tutor actually opens, leaves and reuses pages under a soft prompt is the main risk, to be checked in manual runs once it is built.

## Considered Options

- **Prompt tuning only:** a "one idea per area" rule and an item budget on top of `clear`. It was rejected because the board would stay linear, and the tutor could never go back or reuse an earlier area.
- **A hard budget enforced by the app,** such as forcing a new page after N items. It was rejected because the owner wants the tutor to judge this, not follow a rule.
- **Several boards per conversation:** it was rejected because the glossary's one board per conversation holds, and pages give the same pool without a second surface, a second session or a second model process.
- **Pages shared across a learning tree's conversations:** this is deferred. The index lists only this conversation's pages.
