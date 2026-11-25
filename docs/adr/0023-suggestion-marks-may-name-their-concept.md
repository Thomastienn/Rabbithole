# A suggestion mark may name its concept: `[[concept|shown]]`

ADR 0016 has the tutor wrap each suggestion as `[[term]]`, with the words inside the brackets taken verbatim from the reply. Tutors kept writing wiki-style aliases instead, such as `[[safe state|safe]]`, and the server showed `safe state|safe` in the reply because it treats the whole inside as reply text. In a planning measurement of 131 tutor runs on the same questions, the current prompt wrote an alias in 1 of 192 marks on Codex (Terra) and 2 of 128 on Claude (Sonnet), so the habit is not tied to one provider. Forbidding aliases outright removed them (0 of 185 and 0 of 54) but the owner found that rule too strict, since the tutor uses an alias exactly when a short word in the text stands for a longer concept, such as "fact" in a reply about Prolog. A type prefix in front of every mark, such as `[[s: term]]`, made things worse (4 of 188). Making the alias official raised its use to 50 of 194 marks, and those marks named the concept the tutor meant.

We decided that `[[concept|shown]]` is an official suggestion mark for every provider. The reply shows only `shown`, underlined as the suggestion, and `concept` is stored as that suggestion's concept, so quick thinking names concepts only for marks that come without one. Inside a Markdown table the tutor may escape the bar as `\|`, and the parser accepts both. A plain `[[term]]` still means the shown words and the concept name are left to quick thinking. We accepted a second mark shape the parser and prompt must carry, and shown text that is sometimes shorter than its concept, in exchange for no leaked bars and concepts named by the model that wrote the reply.

This extends ADR 0016; its other markers are unchanged.

## Considered Options

- Forbid aliases in the prompt. Removed them in the measurement, but the owner judged it too strict for a habit the tutor uses for a reason.
- A type prefix on every mark, so the parser knows what each mark is. More aliases, not fewer, and every mark grows.
- Strip everything before the bar silently. Hides the leak but throws away the concept the tutor meant.
