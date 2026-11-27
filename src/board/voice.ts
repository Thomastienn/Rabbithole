// The tutor's voice: each sentence's audio streams into its own MediaSource and plays from its first chunk.
// WebM Opus, because Firefox's MediaSource refuses MP3; chunked playback was proved in Chrome and Firefox
// (Rabbithole-brd.7). Safari is the owner's check.
export type Voice = {
    chunk(id: string, bytes: Uint8Array): void;
    end(id: string): void;
    // duration is in board time, once the whole clip is in; failed means play it by its estimate instead.
    play(id: string, on: { duration(ms: number): void; ended(): void; failed(): void }): void;
    stop(): void;
};

// Speech plays at the default 1.5×, the speed the caption estimate assumes.
const RATE = 1.5;

export function streamedVoice(): Voice {
    type Clip = { chunks: Uint8Array[]; ended: boolean; feed?: () => void };
    const clips = new Map<string, Clip>();
    let release = () => {};
    const clip = (id: string) => {
        let c = clips.get(id);
        if (!c) clips.set(id, (c = { chunks: [], ended: false }));
        return c;
    };
    return {
        chunk(id, bytes) {
            clip(id).chunks.push(bytes);
            clip(id).feed?.();
        },
        end(id) {
            clip(id).ended = true;
            clip(id).feed?.();
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
                done = true;
                c.feed = undefined;
                clips.delete(id);
                audio.pause();
                audio.removeAttribute('src');
                URL.revokeObjectURL(url);
            };
            const fail = () => {
                if (done) return;
                release();
                on.failed();
            };
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
                    on.duration((source.duration * 1000) / RATE);
                };
                buffer.addEventListener('updateend', () => c.feed?.());
                c.feed();
            });
            audio.defaultPlaybackRate = RATE;
            audio.preservesPitch = true;
            audio.addEventListener('ended', () => {
                if (done) return;
                release();
                on.ended();
            });
            audio.addEventListener('error', fail);
            audio.src = url;
            audio.play().catch(fail);
        },
        stop() {
            release();
            clips.clear();
        },
    };
}
