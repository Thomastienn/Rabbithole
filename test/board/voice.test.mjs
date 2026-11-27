import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { streamedVoice } = await import('../../src/board/voice.ts');

// Stand-ins for the browser's MediaSource and audio element; they record what the voice feeds them.
// They prove the feeding order, not native playback (proved by hand in Chrome and Firefox).
function fakeMedia(t, { refuse = false } = {}) {
    const media = { sources: [], audios: [] };
    class SourceBuffer extends EventTarget {
        updating = false;
        appended = [];
        appendBuffer(bytes) {
            this.updating = true;
            this.appended.push([...bytes]);
        }
        settle() {
            this.updating = false;
            this.dispatchEvent(new Event('updateend'));
        }
    }
    class MediaSource extends EventTarget {
        readyState = 'closed';
        duration = NaN;
        constructor() {
            super();
            media.sources.push(this);
        }
        addSourceBuffer(type) {
            if (refuse) throw new Error(`refused ${type}`);
            return (this.buffer = new SourceBuffer());
        }
        endOfStream() {
            this.readyState = 'ended';
            this.duration = 3; // seconds of audio, 2 s of board time at 1.5×
        }
        open() {
            this.readyState = 'open';
            this.dispatchEvent(new Event('sourceopen'));
        }
    }
    class Audio extends EventTarget {
        currentTime = 0.3;
        paused = false;
        constructor() {
            super();
            media.audios.push(this);
        }
        play() {
            this.paused = false;
            return Promise.resolve();
        }
        pause() {
            this.paused = true;
        }
        removeAttribute() {}
    }
    const saved = {
        MediaSource: globalThis.MediaSource,
        Audio: globalThis.Audio,
        create: URL.createObjectURL,
        revoke: URL.revokeObjectURL,
    };
    Object.assign(globalThis, { MediaSource, Audio });
    URL.createObjectURL = () => 'blob:voice';
    URL.revokeObjectURL = () => {};
    t.after(() => {
        Object.assign(globalThis, { MediaSource: saved.MediaSource, Audio: saved.Audio });
        URL.createObjectURL = saved.create;
        URL.revokeObjectURL = saved.revoke;
    });
    return media;
}

const events = () => {
    const seen = [];
    return {
        seen,
        on: {
            duration: (ms, elapsed) => seen.push(['duration', ms, elapsed]),
            ended: () => seen.push(['ended']),
            failed: () => seen.push(['failed']),
        },
    };
};

test('board voice: feeds every chunk in order, ends the stream on audio end and reports its length', (t) => {
    const media = fakeMedia(t);
    const voice = streamedVoice();
    const { seen, on } = events();
    voice.chunk('1', new Uint8Array([1]));
    voice.play('1', on);
    voice.chunk('1', new Uint8Array([2, 3])); // before the source opens
    const [source] = media.sources;
    source.open();
    assert.deepEqual(
        source.buffer.appended,
        [[1, 2, 3]],
        'what arrived early goes in as one append',
    );
    voice.chunk('1', new Uint8Array([4])); // while the buffer is busy
    voice.end('1');
    assert.deepEqual(source.buffer.appended, [[1, 2, 3]], 'nothing appends while busy');
    source.buffer.settle();
    assert.deepEqual(source.buffer.appended, [[1, 2, 3], [4]]);
    assert.equal(source.readyState, 'open', 'the stream stays open until its chunks are in');
    source.buffer.settle();
    assert.equal(source.readyState, 'ended');
    assert.deepEqual(seen, [['duration', 2000, 200]], 'length and position in board time');
    media.audios[0].dispatchEvent(new Event('ended'));
    assert.deepEqual(seen.at(-1), ['ended']);
});

test('board voice: a browser that refuses the stream falls back to the estimate', (t) => {
    const media = fakeMedia(t, { refuse: true });
    const voice = streamedVoice();
    const { seen, on } = events();
    voice.chunk('1', new Uint8Array([1]));
    voice.play('1', on);
    media.sources[0].open();
    media.audios[0].dispatchEvent(new Event('error'));
    assert.deepEqual(seen, [['failed']], 'it fails once');
});

test('board voice: speed applies to the sentence playing and the next, and pause holds and resumes it', (t) => {
    const media = fakeMedia(t);
    const voice = streamedVoice();
    voice.play('1', events().on);
    const [audio] = media.audios;
    assert.equal(audio.playbackRate, 1.5, 'speech plays at 1.5× by default');
    assert.equal(audio.preservesPitch, true);
    voice.speed(1.25);
    assert.equal(audio.playbackRate, 1.25, 'the playing sentence changes speed at once');
    voice.pause(true);
    assert.equal(audio.paused, true);
    voice.pause(false);
    assert.equal(audio.paused, false, 'resume plays on from where it stopped');
    voice.play('2', events().on);
    assert.equal(media.audios[1].playbackRate, 1.25, 'the next sentence keeps the speed');
});
