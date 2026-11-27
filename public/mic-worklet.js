// The board's mic (src/board/mic.ts): the first input channel, resampled to 16 kHz and posted 512 samples at a time.
// shortcut: linear resampling with no low-pass, fine for speech recognition; filter first if accuracy suffers.
class Mic16k extends AudioWorkletProcessor {
    step = sampleRate / 16000;
    at = 0;
    out = new Float32Array(512);
    n = 0;
    process([input]) {
        const samples = input?.[0];
        if (!samples) return true;
        // `at` is the next output position in this block's samples.
        for (; this.at < samples.length; this.at += this.step) {
            const i = Math.floor(this.at);
            const a = samples[i];
            const b = samples[i + 1] ?? a;
            this.out[this.n++] = a + (b - a) * (this.at - i);
            if (this.n === 512) {
                this.port.postMessage(this.out);
                this.out = new Float32Array(512);
                this.n = 0;
            }
        }
        this.at -= samples.length;
        return true;
    }
}
registerProcessor('mic-16k', Mic16k);
