// The learner's mic: 16 kHz mono with echo cancellation, noise suppression and auto gain, 512 samples at a time.
// Rejects with the browser's error, a NotAllowedError when the learner or the browser blocks the mic.
export async function openMic(frame: (samples: Float32Array) => void): Promise<() => void> {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
    });
    // The context runs at the device's rate (Firefox refuses to mix rates); the worklet resamples to 16 kHz.
    const context = new AudioContext();
    try {
        await context.audioWorklet.addModule('/mic-worklet.js');
        const node = new AudioWorkletNode(context, 'mic-16k');
        node.port.onmessage = (e) => frame(e.data);
        context.createMediaStreamSource(stream).connect(node);
        // The worklet writes silence; joining the graph's output keeps it running in every browser.
        node.connect(context.destination);
        await context.resume();
    } catch (error) {
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
        throw error;
    }
    return () => {
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
    };
}

// The four level bars' heights, 0 to 1, from the latest frames' loudness.
export function levels(samples: Float32Array, previous: number[]): number[] {
    const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
    return [...previous.slice(-3), Math.min(1, 0.2 + rms * 6)];
}
