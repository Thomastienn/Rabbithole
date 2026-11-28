// A board-time clock and a voice for test/board/player*.test.mjs, recording what the player asks of them.
export function fakeClock() {
    let now = 0;
    const timers = [];
    return {
        now: () => now,
        setTimeout: (run, ms) => {
            const timer = { at: now + ms, run };
            timers.push(timer);
            return timer;
        },
        clearTimeout: (timer) => timers.splice(timers.indexOf(timer) >>> 0, 1),
        advance(ms) {
            now += ms;
            for (let t; (t = timers.find((t) => t.at <= now));) {
                timers.splice(timers.indexOf(t), 1);
                t.run();
            }
        },
    };
}

export function fakeVoice() {
    const voice = {
        chunks: [],
        ends: [],
        playing: [],
        stopped: 0,
        controls: [],
        rooms: 0,
        pens: [],
    };
    return Object.assign(voice, {
        room: () => voice.rooms++,
        pen: (op, ms) => voice.pens.push([op.id, Math.round(ms)]),
        speed: (rate) => voice.controls.push(['speed', rate]),
        pause: (on) => voice.controls.push(['pause', on]),
        chunk: (id, bytes) => voice.chunks.push([id, bytes.length]),
        end: (id) => voice.ends.push(id),
        play: (id, on) => voice.playing.push({ id, ...on }),
        stop: () => voice.stopped++,
    });
}
