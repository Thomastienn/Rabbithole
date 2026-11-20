import { createElement as h, useState } from 'react';
import { render } from './render.mjs';
import { ui } from './ui.mjs';
const { default: Passage } = await import('../../src/chat/Passage.tsx');

export async function passage(t) {
    let update, dom;
    const branched = [],
        opened = [];
    const text = 'repeat 😀 repeat 😀 **bold**';
    const message = { id: 'reply', role: 'assistant', text, status: 'completed' };
    function Fixture() {
        const [value, set] = useState({
            message,
            selecting: false,
            suggestions: undefined,
            branched: [],
            form: undefined,
        });
        update = set;
        return h(
            'div',
            { className: 'focused-chat' },
            h('header', { className: 'chat-header' }),
            h(Passage, {
                ...value,
                index: 1,
                addresses: new Map(),
                onBranch: (anchor, origin) => branched.push([anchor, origin.current]),
                onOpenChild: (id) => opened.push(id),
                openSelection: () => set((v) => ({ ...v, selecting: true })),
                closeSelection: () => set((v) => ({ ...v, selecting: false })),
            }),
        );
    }
    const highlights = new Map();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'Highlight');
    globalThis.Highlight = class extends Set {
        constructor(...ranges) {
            super(ranges);
        }
    };
    t.after(() =>
        original
            ? Object.defineProperty(globalThis, 'Highlight', original)
            : delete globalThis.Highlight,
    );
    const { container, act, cleanup } = await render(h(Fixture), (w) => {
        dom = ui(w);
        w.CSS.highlights = highlights;
        w.Range.prototype.getClientRects = () => [{ left: 1, right: 20, top: 10, bottom: 25 }];
    });
    t.after(cleanup);
    const section = () => container.querySelector('.passage > section');
    const underline = () => container.querySelector('u[tabindex]');
    return {
        container,
        act,
        update,
        dom,
        message,
        text,
        branched,
        opened,
        section,
        underline,
        highlights,
    };
}
