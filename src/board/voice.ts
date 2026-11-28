// The tutor's voice: each sentence's audio streams into its own MediaSource and plays from its first chunk.
// WebM Opus, because Firefox's MediaSource refuses MP3; chunked playback was proved in Chrome and Firefox
// (Rabbithole-brd.7). Safari is the owner's check.
import { boardFills } from './fills';
import type { Op } from './player';

export type Voice = {
    chunk(id: string, bytes: Uint8Array): void;
    end(id: string): void;
    // Duration and elapsed time are in board time. Failed falls back to the estimate.
    play(
        id: string,
        on: { duration(ms: number, elapsed: number): void; ended(): void; failed(): void },
    ): void;
    // The learner's speed applies to the sentence playing and those after it.
    speed(rate: number): void;
    pause(on: boolean): void;
    stop(): void;
    // The room tone under a reply, and a pen sound for an op drawing for `ms` of board time (./fills.ts).
    room(): void;
    pen(op: Op, ms: number): void;
};

// Board time runs at the default 1.5×, the speed the caption estimate assumes.
export const DEFAULT_SPEED = 1.5;

export function streamedVoice(fills = boardFills()): Voice {
    type Clip = { chunks: Uint8Array[]; ended: boolean; feed?: () => void };
    const clips = new Map<string, Clip>();
    let release = () => {};
    let rate = DEFAULT_SPEED,
        current: { audio: HTMLAudioElement; start: () => void } | undefined;
    const clip = (id: string) => {
        let c = clips.get(id);
        if (!c) clips.set(id, (c = { chunks: [], ended: false }));
        return c;
    };
    return {
        chunk(id, bytes) {
            const c = clip(id);
            c.chunks.push(bytes);
            c.feed?.();
        },
        end(id) {
            const c = clips.get(id);
            if (!c) return;
            c.ended = true;
            c.feed?.();
        },
        play(id, on) {
            release();
            const c = clip(id);
            let done = false,
                source: MediaSource,
                audio: HTMLAudioElement;
            try {
                source = new MediaSource();
                audio = new Audio();
            } catch {
                clips.delete(id);
                return on.failed();
            }
            const url = URL.createObjectURL(source);
            release = () => {
                if (done) return;
                done = true;
                c.feed = undefined;
                clips.delete(id);
                current = undefined;
                audio.pause();
                audio.removeAttribute('src');
                URL.revokeObjectURL(url);
            };
            const fail = () => {
                if (done) return;
                release();
                on.failed();
            };
            // Pausing before playback begins rejects play() with AbortError; resuming plays it afresh.
            const start = () =>
                audio.play().catch((e: unknown) => {
                    if ((e as Error)?.name !== 'AbortError') fail();
                });
            source.addEventListener('sourceopen', () => {
                if (done) return;
                let buffer: SourceBuffer;
                try {
                    buffer = source.addSourceBuffer('audio/webm; codecs=opus');
                } catch {
                    return fail();
                }
                c.feed = () => {
                    if (done || buffer.updating || source.readyState !== 'open') return;
                    // edge-tts sends frames of about 120 bytes, so whatever has arrived goes in as one append.
                    try {
                        if (c.chunks.length) {
                            const next = new Uint8Array(c.chunks.reduce((n, b) => n + b.length, 0));
                            let at = 0;
                            for (const b of c.chunks) {
                                next.set(b, at);
                                at += b.length;
                            }
                            c.chunks = [];
                            return buffer.appendBuffer(next);
                        }
                        if (!c.ended) return;
                        source.endOfStream();
                    } catch {
                        return fail();
                    }
                    on.duration(
                        (source.duration * 1000) / DEFAULT_SPEED,
                        (audio.currentTime * 1000) / DEFAULT_SPEED,
                    );
                };
                buffer.addEventListener('updateend', () => c.feed?.());
                c.feed();
            });
            audio.defaultPlaybackRate = rate;
            audio.playbackRate = rate;
            audio.preservesPitch = true;
            current = { audio, start };
            audio.addEventListener('ended', () => {
                if (done) return;
                release();
                on.ended();
            });
            audio.addEventListener('error', fail);
            audio.src = url;
            start();
        },
        speed(r) {
            rate = r;
            if (current) current.audio.playbackRate = r;
        },
        pause(on) {
            fills.pause(on);
            if (!current) return;
            if (on) current.audio.pause();
            else current.start();
        },
        stop() {
            release();
            clips.clear();
            fills.stop();
        },
        room: () => fills.room(),
        pen: (op, ms) => fills.pen(op, (ms * DEFAULT_SPEED) / rate),
    };
}
