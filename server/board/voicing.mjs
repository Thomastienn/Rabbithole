import { formatLog, errorCause } from '../log.mjs';

const VOICE_UNAVAILABLE = 'The voice is unavailable, so the tutor carries on in captions.';

// A group of sentences voiced as one request (docs/board-polish-spec.md, Joined speech), once it is closed: a reply's
// first sentence alone, then consecutive sentences until one carrying a pause, a change of rate, the reply's end
// or JOIN sentences; null while the group is still open.
const JOIN = 4;
const joined = ({ sentences: all, voiced: from, written }) => {
    if (!all[from]) return null;
    if (from === 0) return all.slice(0, 1);
    for (let i = from; ; i++) {
        const next = all[i + 1];
        if (all[i].pause || i + 1 - from === JOIN || (next && next.rate !== all[from].rate))
            return all.slice(from, i + 1);
        if (!next) return written ? all.slice(from) : null;
    }
};
// Each sentence's start in its group's clip, in ms: the offset of its first word, the words matched in order
// in the joined text; null when a word cannot be matched or a sentence has none.
const wordOffsets = (texts, words) => {
    const text = texts.join(' ');
    const starts = texts.map((_, i) => texts.slice(0, i).join(' ').length + (i && 1));
    const at = [0];
    let cursor = 0;
    for (const word of words) {
        const index = word.text ? text.indexOf(word.text, cursor) : -1;
        if (index < 0) return null;
        cursor = index + word.text.length;
        const k = starts.findLastIndex((start) => start <= index);
        at[k] ??= Math.round(word.at);
    }
    return texts.every((_, i) => at[i] !== undefined) ? at : null;
};
// The fallback: each sentence starts at the share of the group's characters before it.
const shares = (texts) => {
    const total = texts.reduce((n, t) => n + t.length, 0);
    let before = 0;
    return texts.map((t) => {
        const share = before / total;
        before += t.length;
        return share;
    });
};

// A board session's speech: speak(current) voices the turn's next closed group, if its turn has come.
// heard(current) marks the turn's first audio; sendAudio(id, chunk) sends a speech frame.
export function boardVoicing({ speech, send, sendAudio, heard, log }) {
    // Speech runs one group ahead of playback (docs/board-polish-spec.md, Joined speech): a group synthesizes once
    // the group before it starts playing, as one request whose audio goes under its first sentence's id.
    // A group with no audio yet is tried twice; when speech still fails, the rest of the turn is captions only.
    return function speak(current) {
        const group = joined(current);
        if (!speech || current.speaking || !group || current.shown <= current.started) return;
        current.started = current.voiced;
        current.voiced += group.length;
        current.speaking = true;
        const signal = current.job.controller.signal;
        const [first] = group;
        const texts = group.map((s) => s.text);
        let spoke = false,
            words;
        const say = () =>
            speech.speak(
                texts.join(' '),
                (chunk) => {
                    spoke = true;
                    if (current.done) return;
                    heard(current);
                    sendAudio(first.id, chunk);
                },
                signal,
                first.rate,
            );
        (current.silent
            ? Promise.resolve()
            : say().catch((error) => {
                  if (spoke || signal.aborted) throw error;
                  return say();
              })
        )
            .then(
                (w) => (words = w),
                (error) => {
                    if (signal.aborted) return;
                    log(
                        formatLog('warn', 'board', 'speech failed', {
                            id: current.reply,
                            cause: errorCause(error, texts),
                        }),
                    );
                    if (spoke) return;
                    current.silent = true;
                    send({ type: 'notice', notice: VOICE_UNAVAILABLE });
                },
            )
            .finally(() => {
                current.speaking = false;
                if (current.done) return;
                heard(current);
                if (spoke && group.length > 1) {
                    const at = Array.isArray(words) && wordOffsets(texts, words);
                    send({
                        type: 'offsets',
                        id: first.id,
                        ids: group.map((s) => s.id),
                        ...(at ? { at } : { share: shares(texts) }),
                    });
                }
                // A group that never spoke plays each of its sentences by its caption estimate.
                for (const s of spoke ? [first] : group) send({ type: 'audio-end', id: s.id });
                speak(current);
            });
    };
}
