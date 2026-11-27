import { formatLog, errorCause } from '../log.mjs';
import { FRAME, utterances } from './hearing.mjs';

const SPEECH_FAILED =
    "The speech model didn't download. Check your connection, then press the mic to try again.";
const SPEECH_UNAVAILABLE = 'Voice questions are unavailable here, so type your question.';

// A board session's mic: off as the board opens; on once the learner asks for it and the speech models are ready.
// While the tutor thinks or speaks (busy) it does not listen (cutting in by voice is a later ticket).
export function boardMic(hearing, { send, log, ask, busy, closed }) {
    let ears = null,
        mic = null,
        scoring = Promise.resolve(),
        recognizing = false,
        rest = new Float32Array(0);
    const on = async () => {
        if (mic) return send({ type: 'mic', status: 'on' });
        if (!hearing) {
            send({ type: 'notice', notice: SPEECH_UNAVAILABLE });
            return send({ type: 'mic', status: 'off' });
        }
        const asked = (ears = {});
        try {
            const models = await hearing((loaded, total) => {
                if (ears === asked) send({ type: 'mic', status: 'loading', loaded, total });
            });
            if (ears !== asked || closed()) return;
            mic = { models, score: models.detector(), cut: utterances() };
            send({ type: 'mic', status: 'on' });
        } catch (error) {
            if (ears !== asked) return;
            ears = null;
            log(formatLog('warn', 'board', 'speech model failed', { cause: errorCause(error) }));
            send({ type: 'notice', notice: SPEECH_FAILED });
            send({ type: 'mic', status: 'off' });
        }
    };
    const off = () => {
        ears = mic = null;
        rest = new Float32Array(0);
        send({ type: 'mic', status: 'off' });
    };
    // Mic audio: 16 kHz mono float32 samples, cut into Silero frames and scored one at a time.
    const listen = (samples) => {
        const current = mic;
        if (!current || busy() || recognizing) {
            // A typed question cut the learner's speech short.
            if (current?.cut.reset()) send({ type: 'hearing', on: false });
            return;
        }
        const all = new Float32Array(rest.length + samples.length);
        all.set(rest);
        all.set(samples, rest.length);
        let at = 0;
        for (; at + FRAME <= all.length; at += FRAME) {
            const frame = all.slice(at, at + FRAME);
            scoring = scoring
                .then(async () => {
                    if (mic !== current || busy() || recognizing) return;
                    const said = current.cut.push(frame, (await current.score(frame)) > 0.5);
                    if (said === 'start') return send({ type: 'hearing', on: true });
                    if (!said) return;
                    send({ type: 'hearing', on: false });
                    if (said === 'end') return;
                    recognizing = true;
                    const text = await current.models.recognize(said).catch((error) => {
                        log(
                            formatLog('warn', 'board', 'recognition failed', {
                                cause: errorCause(error),
                            }),
                        );
                        return '';
                    });
                    recognizing = false;
                    if (!text || mic !== current || closed()) return;
                    send({ type: 'heard', text });
                    ask(text);
                })
                .catch((error) => {
                    recognizing = false;
                    log(
                        formatLog('warn', 'board', 'voice detection failed', {
                            cause: errorCause(error),
                        }),
                    );
                });
        }
        rest = all.slice(at);
    };
    // Only whole float32 samples, at most a second at a time.
    const audio = (data) => {
        if (data.length % 4 || data.length > 16000 * 4) return;
        const bytes = new Uint8Array(data);
        listen(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4));
    };
    return { on, off, audio };
}
