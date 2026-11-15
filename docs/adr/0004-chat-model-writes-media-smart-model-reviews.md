# The chat model writes media; the smart model plans and reviews

The smart model wrote everything for a video (set pieces, every cut's code, every audit fix) and every visual. Those are the output-heavy calls, so most of the cost of media went to the most expensive model's output tokens, and visuals waited on the smart model's long reasoning before drawing. We decided that the conversation's chat model writes visuals, set pieces, cut code, repairs and audit fixes, and the smart model only plans each video, audits its cuts (returning issues, never code) and improves a saved set piece an audit finds poor. The smart model's output then shrinks to the plan and short issue lists, while its judgement still decides what a video shows and whether a cut is right. We accepted that media quality now follows the conversation's chat model, which varies by conversation and may be weaker, and that a video freezes two selections instead of one. The owner judges the quality by hand and can reverse the split.

## Considered Options

- The smart model does everything, as before. Best quality, highest cost, slowest visuals.
- The smart model writes and the chat model audits. Cheaper audits, but the audit is the judgement call, and a weaker reviewer misses what a stronger one would catch, while the costly output stays on the smart model.
- A setting to switch between splits. More flexible, but a second code path to keep working for a choice the owner can make once.
