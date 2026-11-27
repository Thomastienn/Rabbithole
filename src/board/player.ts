// The board player: shows the tutor's sentences one at a time, each for as long as it takes to say.
// Later tickets add ops, audio timing, speed, pause and interruptions here.
export type Sentence = { id: string; text: string };
export type Phase = 'start' | 'end';
type Clock = {
    setTimeout: (run: () => void, ms: number) => unknown;
    clearTimeout: (timer: unknown) => void;
};

// An estimated ten characters per second at 1× plays at fifteen at the default 1.5×.
const CHARS_PER_SECOND = 15;

export function boardPlayer(
    show: (sentence: Sentence) => void,
    report: (sentence: Sentence, phase: Phase) => void,
    clock: Clock = {
        setTimeout: (run, ms) => setTimeout(run, ms),
        clearTimeout: (timer) => clearTimeout(timer as number),
    },
) {
    let queue: Sentence[] = [],
        current: Sentence | undefined,
        timer: unknown;
    const next = () => {
        current = queue.shift();
        if (!current) return;
        const sentence = current;
        show(sentence);
        report(sentence, 'start');
        timer = clock.setTimeout(
            () => {
                report(sentence, 'end');
                next();
            },
            (sentence.text.length / CHARS_PER_SECOND) * 1000,
        );
    };
    return {
        add(sentence: Sentence) {
            queue.push(sentence);
            if (!current) next();
        },
        // Drops what has not started; the sentence on show keeps its caption.
        stop() {
            clock.clearTimeout(timer);
            queue = [];
            current = undefined;
        },
    };
}
