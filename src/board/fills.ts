// Quiet sounds under the tutor's voice, made with Web Audio and no assets (docs/board-polish-spec.md, from
// prototype/board-pacing): a room-tone bed through a reply and a pen sound while each op draws.
import type { Op } from './player';

// Levels in dB below the voice, which edge-tts clips put at about -22 dBFS mean (measured in the prototype).
const VOICE_DB = -22;
export const ROOM_DB = -40;
export const PEN_DB = -26;
export const WIPE_DB = -32;

const gainOf = (db: number) => 10 ** ((VOICE_DB + db) / 20);
const r = (a: number, b: number) => a + Math.random() * (b - a);

// Without Web Audio (an old browser, the component tests) the board stays as quiet as before.
export function boardFills(
    make = typeof AudioContext === 'undefined' ? undefined : () => new AudioContext(),
) {
    let ctx: AudioContext | undefined;
    let white: AudioBuffer | undefined;
    let pink: AudioBuffer | undefined;
    // Everything of one reply goes through its bus, so stopping fades the room and cuts pen strokes still scheduled.
    let bus: GainNode | undefined;
    let room: AudioBufferSourceNode | undefined;
    const audio = () => (ctx ??= make!());
    const out = () => {
        const c = audio();
        if (!bus) (bus = c.createGain()).connect(c.destination);
        return bus;
    };

    // 2 s of white noise, looped from a random offset for each stroke.
    const whiteNoise = (c: AudioContext) => {
        if (white) return white;
        white = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = white.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return white;
    };
    // 8 s of pink noise (Paul Kellet's filter), darkened above 2.5 kHz and cleared below 60 Hz like a quiet room
    // through a mic, scaled to an RMS of 1 so the gain alone sets its level.
    const pinkNoise = (c: AudioContext) => {
        if (pink) return pink;
        pink = c.createBuffer(1, c.sampleRate * 8, c.sampleRate);
        const d = pink.getChannelData(0);
        const lp = 1 - Math.exp((-2 * Math.PI * 2500) / c.sampleRate);
        const hp = 1 - Math.exp((-2 * Math.PI * 60) / c.sampleRate);
        let [b0, b1, b2, b3, b4, b5, b6, low, slow, sum] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < d.length; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + w * 0.0555179;
            b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856;
            b4 = 0.55 * b4 + w * 0.5329522;
            b5 = -0.7616 * b5 - w * 0.016898;
            const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
            b6 = w * 0.115926;
            low += lp * (p - low);
            slow += hp * (low - slow);
            d[i] = low - slow;
            sum += d[i] * d[i];
        }
        const rms = Math.sqrt(sum / d.length) || 1;
        for (let i = 0; i < d.length; i++) d[i] /= rms;
        return pink;
    };
    // One stroke: noise through a band-pass, faded in and out, its loudness moved to a random level every `step` s.
    const stroke = (
        at: number,
        len: number,
        peak: number,
        freq: number,
        q: number,
        step: number,
    ) => {
        const c = audio();
        const src = c.createBufferSource();
        src.buffer = whiteNoise(c);
        src.loop = true;
        const band = c.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = freq;
        band.Q.value = q;
        const gain = c.createGain();
        const g = gain.gain;
        g.setValueAtTime(0, at);
        g.linearRampToValueAtTime(peak * 0.8, at + Math.min(0.012, len / 3));
        for (let t = at + step; t < at + len - 0.02; t += step)
            g.linearRampToValueAtTime(peak * (0.55 + 0.45 * Math.random()), t);
        g.linearRampToValueAtTime(0, at + len);
        src.connect(band).connect(gain).connect(out());
        src.start(at, Math.random() * 1.5);
        src.stop(at + len + 0.02);
    };

    return {
        // The room tone starts with a reply's first sentence; later calls keep it going.
        room() {
            if (!make) return;
            const c = audio();
            void c.resume();
            if (room) return;
            room = c.createBufferSource();
            room.buffer = pinkNoise(c);
            room.loop = true;
            const gain = c.createGain();
            gain.gain.value = gainOf(ROOM_DB);
            room.connect(gain).connect(out());
            room.start();
        },
        // A marker on a whiteboard for `ms` of real time: short ticks for a label or formula, longer strokes for
        // shapes, components, drawings and code; `erase` gets a softer, lower wipe; page, open and pointer are silent.
        pen(op: Op, ms: number) {
            if (!make || op.top !== undefined || op.kind === 'pointer' || ms <= 0) return;
            const now = audio().currentTime + 0.01;
            const end = now + ms / 1000;
            // shortcut: band-passed white noise keeps about 0.16 of its full-scale RMS, a rough calibration by ear;
            // measure the output if the level needs to be exact.
            const wipe = op.kind === 'erase';
            const peak = gainOf(wipe ? WIPE_DB : PEN_DB) / 0.16;
            const short = ['text', 'math', 'dot', 'point'].includes(op.kind);
            for (let t = now; t < end - 0.03;) {
                const len = wipe
                    ? end - t
                    : Math.min(short ? r(0.05, 0.12) : r(0.15, 0.38), end - t);
                stroke(
                    t,
                    len,
                    peak,
                    wipe ? 900 : r(2600, 3800),
                    wipe ? 0.6 : 1.1,
                    wipe ? 0.12 : 0.03,
                );
                t += len + (short ? r(0.02, 0.05) : r(0.04, 0.09));
            }
        },
        // Pausing suspends the whole context: the room and strokes mid-draw hold and carry on together.
        pause(on: boolean) {
            if (!ctx) return;
            void (on ? ctx.suspend() : ctx.resume());
        },
        // The reply is over or cut: the room fades out and strokes not yet played are dropped.
        stop() {
            if (!ctx || !bus) return;
            const c = ctx;
            const b = bus;
            bus = undefined;
            const src = room;
            room = undefined;
            b.gain.setTargetAtTime(0, c.currentTime, 0.15);
            setTimeout(() => {
                src?.stop();
                b.disconnect();
            }, 1000);
            void c.resume();
        },
    };
}
