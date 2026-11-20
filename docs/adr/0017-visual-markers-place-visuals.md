# A marker in the text places each visual

ADR 0014 had `show_visual` carry `after`, a quote of the reply text the visual follows. Claude writes its whole reply before calling and quotes words as the learner reads them, so a quote across `**bold**` or other markup matched nothing and the visual fell to the end of the reply; four of Claude Sonnet's last six visuals landed at the very end. Finding a quote in the text stays a guess however tolerant the match. We decided that the tutor writes `[[visual: name]]` in its text exactly where the visual goes, in the marker family of ADR 0016, and its `show_visual` call carries the same name. The server places the visual at its marker; a call with no matching marker places the visual where the call ran, and a marker with no call is removed. A marker is text, so it may sit inside `:::wide` or `:::figure`, which hold visuals as well as images again, and the `side` argument is removed. We accepted one more short name per visual, which the tutor must repeat exactly between text and call, in exchange for a position that is part of the text itself on every provider.

This supersedes ADR 0014. Visuals still start drawing the moment their call runs (ADR 0013).

## Considered Options

- Keep `after` and match it while ignoring markdown. Fixes the case seen, but still guesses at a quote.
- Place every visual where its call ran. Lands at the end for every model that writes before it calls.
