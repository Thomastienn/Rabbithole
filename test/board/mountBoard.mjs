import '../support/tsx.mjs';
// The board under test: a fake board socket, a fake mic and mount(), shared by the board's component tests.
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: Board } = await import('../../src/board/Board.tsx');

// The board session's socket, driven by the test: it records what the board sends and plays what the server says.
class FakeSocket {
    static OPEN = 1;
    static last;
    readyState = 0;
    sent = [];
    constructor(url) {
        this.url = url;
        FakeSocket.last = this;
    }
    send(data) {
        this.sent.push(typeof data === 'string' ? JSON.parse(data) : { audio: data.byteLength });
    }
    close() {
        this.readyState = 3;
        this.onclose?.();
    }
    open() {
        this.readyState = 1;
        this.onopen?.();
    }
    server(message) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
    // A speech frame as the board session sends it: one byte of id length, the id, then the audio.
    audio(id, bytes) {
        this.onmessage?.({
            data: new Uint8Array([id.length, ...Buffer.from(id), ...bytes]).buffer,
        });
    }
}

// The browser's mic: getUserMedia records its constraints (or refuses), and frame() plays a worklet frame.
export function fakeMic(t, { refuse } = {}) {
    const mic = { asked: [], stopped: 0, frame: null };
    const saved = [globalThis.AudioContext, globalThis.AudioWorkletNode];
    globalThis.AudioContext = class {
        audioWorklet = { addModule: async (url) => (mic.module = url) };
        destination = {};
        createMediaStreamSource = () => ({ connect: () => {} });
        resume = async () => {};
        close = async () => {};
    };
    globalThis.AudioWorkletNode = class {
        port = {};
        constructor() {
            mic.frame = (samples) => this.port.onmessage({ data: samples });
        }
        connect() {}
    };
    t.after(() => ([globalThis.AudioContext, globalThis.AudioWorkletNode] = saved));
    mic.install = (w) =>
        Object.defineProperty(w.navigator, 'mediaDevices', {
            value: {
                async getUserMedia(constraints) {
                    mic.asked.push(constraints);
                    if (refuse) throw Object.assign(new Error('denied'), { name: refuse });
                    return { getTracks: () => [{ stop: () => mic.stopped++ }] };
                },
            },
        });
    return mic;
}

// The chat's branching state as the app hands it to the board; submitted keeps each branch sent from the rail.
function Host({ submitted, ...props }) {
    const [branch, setBranch] = useState();
    const [selectingMessage, setSelectingMessage] = useState();
    const thread = {
        addresses: new Map(),
        trees: [],
        branch,
        branching: false,
        selectingMessage,
        setSelectingMessage,
        startBranch: (parent, anchor) => setBranch({ parent, anchor, question: 'What is it?' }),
        setQuestion: (question) => setBranch((b) => ({ ...b, question })),
        closeBranch: () => setBranch(undefined),
        submitBranch: () => submitted.push(branch),
        explainBrief: async () => '',
        openConversation: () => {},
    };
    return h(Board, { ...props, thread });
}

// The rail starts collapsed here unless rail is set; mic installs a fake mic.
export async function mount(t, messages = [], speed, rail = false, mic) {
    const reloads = [];
    const submitted = [];
    let dom;
    const saved = globalThis.WebSocket;
    globalThis.WebSocket = FakeSocket;
    t.after(() => (globalThis.WebSocket = saved));
    const view = await render(
        h(Host, { conversation: 'c1', messages, reload: () => reloads.push('c1'), submitted }),
        (w) => {
            dom = ui(w);
            if (speed) w.localStorage.setItem('rabbithole.board-speed', speed);
            mic?.install(w);
        },
    );
    t.after(view.cleanup);
    const socket = FakeSocket.last;
    await view.act(async () => socket.open());
    if (!rail) await view.act(async () => button(view.container, 'Collapse transcript').click());
    const q = (selector) => view.container.querySelector(selector);
    // The composer input is contenteditable: typing replaces its text and fires input.
    const type = async (text) => {
        const input = q('[contenteditable=true]');
        await view.act(async () => {
            input.textContent = text;
            input.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
    };
    return {
        ...view,
        socket,
        q,
        type,
        reloads,
        submitted,
        frames: () => view.act(async () => dom.frames()),
    };
}
