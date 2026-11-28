import { createRequire } from 'node:module';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const { Constants } = require('@andresaya/edge-tts');
const protocol = require('@andresaya/edge-tts/dist/core/protocol.js');

// One fixed voice per Voice language (docs/board-spec.md); videos keep their own voice.
// The keys are also the Settings list (src/shell/preferences.ts VOICE_LANGUAGES).
export const VOICES = {
    en: 'en-US-AriaNeural',
    zh: 'zh-CN-XiaoxiaoNeural',
    nl: 'nl-NL-ColetteNeural',
    fr: 'fr-FR-DeniseNeural',
    de: 'de-DE-KatjaNeural',
    it: 'it-IT-ElsaNeural',
    ja: 'ja-JP-NanamiNeural',
    pt: 'pt-BR-FranciscaNeural',
    es: 'es-ES-ElviraNeural',
};
// Firefox's MediaSource plays WebM Opus but not MP3 (src/board/voice.ts).
const FORMAT = 'webm-24khz-16bit-mono-opus';
// edge-tts fails in bursts with sockets that open but send nothing (docs/board-spec.md).
const FIRST_BYTE_MS = 2500;

// A small edge-tts client that keeps one socket for a board session's sentences: the library opens a socket
// per request and returns whole clips, and reusing one cut the first byte from about 350 ms to 80 ms.
// speak() streams one request's audio chunks and resolves at its turn.end with its words, [{ text, at }] with at
// in ms of audio, from the word-boundary metadata the config message asks for; one request at a time.
// It rejects when the first audio chunk takes longer than firstByte ms.
export function edgeSpeech(
    voice = VOICES.en,
    open = (url, options) => new WebSocket(url, options),
    firstByte = FIRST_BYTE_MS,
) {
    let socket = null;
    const stamp = () => new Date().toUTCString();
    const connect = () => {
        if (socket) return socket;
        const opening = (async () => {
            const url = protocol.buildSynthesisUrl(
                Constants.WSS_URL,
                Constants.TRUSTED_CLIENT_TOKEN,
                await protocol.generateSecMsGec(Constants.TRUSTED_CLIENT_TOKEN, Date.now()),
                Constants.VERSION_MS_GEC,
                protocol.generateUUID(),
            );
            const ws = open(url, {
                headers: { ...Constants.getBaseHeaders(), ...Constants.WSS_HEADERS },
            });
            // The service closes idle sockets; the next sentence opens a fresh one.
            ws.on('close', () => socket === opening && (socket = null));
            ws.on('error', () => {});
            await new Promise((resolve, reject) => {
                ws.once('open', resolve);
                ws.once('close', () => reject(new Error('edge-tts closed the socket')));
            });
            ws.send(protocol.buildConfigMessage(stamp(), FORMAT));
            return ws;
        })().catch((error) => {
            // A connect given up on by a timed-out sentence may fail after the retry opened its own socket.
            if (socket === opening) socket = null;
            throw error;
        });
        return (socket = opening);
    };
    const close = () => {
        socket?.then((ws) => ws.close()).catch(() => {});
        socket = null;
    };
    return {
        // Opens the socket while the model writes its first sentence.
        warm: () => connect().catch(() => {}),
        // rate: the prosody rate in percent, slower below 0 (docs/board-sketches-spec.md, Pacing).
        async speak(text, chunk, signal, rate = 0) {
            const late = new AbortController();
            const timer = setTimeout(
                () => late.abort(new Error(`edge-tts sent no audio within ${firstByte} ms`)),
                firstByte,
            );
            const stop = signal ? AbortSignal.any([signal, late.signal]) : late.signal;
            // A stopped or late sentence's frames would reach the next one, so its socket goes.
            stop.addEventListener('abort', close, { once: true });
            try {
                stop.throwIfAborted();
                const ws = await Promise.race([
                    connect(),
                    new Promise((_, reject) =>
                        stop.addEventListener('abort', () => reject(stop.reason), { once: true }),
                    ),
                ]);
                stop.throwIfAborted();
                const words = [];
                return await new Promise((resolve, reject) => {
                    const done = (error) => {
                        ws.off('message', message);
                        ws.off('close', closed);
                        stop.removeEventListener('abort', abort);
                        if (error) reject(error);
                        else resolve(words);
                    };
                    const message = (data, binary) => {
                        if (!binary) {
                            const { path, body } = protocol.parseTextFrame(data.toString());
                            if (path === 'audio.metadata')
                                for (const b of protocol.parseMetadata(body))
                                    // Offsets come in 100 ns ticks.
                                    if (b.type === 'WordBoundary')
                                        words.push({ text: b.text, at: b.offset / 10000 });
                            return path === 'turn.end' && done();
                        }
                        const frame = protocol.parseBinaryFrame(new Uint8Array(data));
                        if (frame.path !== 'audio' || !frame.body.length) return;
                        clearTimeout(timer);
                        chunk(frame.body);
                    };
                    const closed = () => done(new Error('edge-tts closed the socket'));
                    const abort = () => done(stop.reason);
                    ws.on('message', message);
                    ws.on('close', closed);
                    stop.addEventListener('abort', abort, { once: true });
                    ws.send(
                        protocol.buildSSMLMessage(
                            protocol.generateUUID(),
                            stamp(),
                            protocol.buildSSML(
                                text,
                                voice,
                                '+0Hz',
                                `${rate < 0 ? '' : '+'}${rate}%`,
                                '+0%',
                            ),
                        ),
                    );
                });
            } finally {
                clearTimeout(timer);
                stop.removeEventListener('abort', close);
            }
        },
        close,
    };
}
