import { createRequire } from 'node:module';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const { Constants } = require('@andresaya/edge-tts');
const protocol = require('@andresaya/edge-tts/dist/core/protocol.js');

// One fixed voice per Voice language (docs/board-spec.md); videos keep their own voice.
export const VOICES = { en: 'en-US-AriaNeural' };
// Firefox's MediaSource plays WebM Opus but not MP3 (src/board/voice.ts).
const FORMAT = 'webm-24khz-16bit-mono-opus';

// A small edge-tts client that keeps one socket for a board session's sentences: the library opens a socket
// per request and returns whole clips, and reusing one cut the first byte from about 350 ms to 80 ms.
// speak() streams one sentence's audio chunks and resolves at its turn.end; one sentence at a time.
export function edgeSpeech(
    voice = VOICES.en,
    open = (url, options) => new WebSocket(url, options),
) {
    let socket = null;
    const stamp = () => new Date().toUTCString();
    const connect = () =>
        (socket ??= (async () => {
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
            const opening = socket;
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
            socket = null;
            throw error;
        }));
    return {
        // Opens the socket while the model writes its first sentence.
        warm: () => connect().catch(() => {}),
        async speak(text, chunk, signal) {
            const ws = await connect();
            signal?.throwIfAborted();
            await new Promise((resolve, reject) => {
                const done = (error) => {
                    ws.off('message', message);
                    ws.off('close', closed);
                    signal?.removeEventListener('abort', abort);
                    if (error) reject(error);
                    else resolve();
                };
                const message = (data, binary) => {
                    if (!binary)
                        return (
                            protocol.parseTextFrame(data.toString()).path === 'turn.end' && done()
                        );
                    const frame = protocol.parseBinaryFrame(new Uint8Array(data));
                    if (frame.path === 'audio' && frame.body.length) chunk(frame.body);
                };
                const closed = () => done(new Error('edge-tts closed the socket'));
                // A stopped sentence's late frames would reach the next one, so its socket goes.
                const abort = () => {
                    socket = null;
                    ws.close();
                    done(signal.reason);
                };
                ws.on('message', message);
                ws.on('close', closed);
                signal?.addEventListener('abort', abort, { once: true });
                ws.send(
                    protocol.buildSSMLMessage(
                        protocol.generateUUID(),
                        stamp(),
                        protocol.buildSSML(text, voice, '+0Hz', '+0%', '+0%'),
                    ),
                );
            });
        },
        close() {
            socket?.then((ws) => ws.close()).catch(() => {});
            socket = null;
        },
    };
}
