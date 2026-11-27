import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { sketchItemOf } from '../../src/sketch/itemPassage.ts';
import { sketchDrawnAt } from '../../src/markdown/markdownText.ts';
import ChatThread from '../../src/chat/ChatThread.tsx';
import { render } from '../support/render.mjs';
import { threadProps } from '../support/thread-props.mjs';
import { ui } from '../support/ui.mjs';

const freezing = [
    'title: Freezing below 0 °C',
    "Water freezes -> Water's entropy falls",
    'Water freezes -> Heat flows out',
    "Heat flows out -> Surroundings' entropy rises more",
    "Water's entropy falls -> *Total rises*",
    "Surroundings' entropy rises more -> *Total rises*",
].join('\n');
const speeds = [
    'title: Approximate eastward speed of the ground',
    'Equator: 465 m/s',
    '*60° latitude*: 233 m/s',
    'North Pole: 0 m/s',
].join('\n');

test("a sketch's items are asked about by pointer or keyboard, and a branched item shows its branch", async (t) => {
    const flow = `\`\`\`sketch flow\n${freezing}\n\`\`\``,
        bars = `\`\`\`sketch bars\n${speeds}\n\`\`\``,
        // A kind that draws no hit areas yet only draws.
        line = '```sketch line\nrange: 0..10\n2: Low\n8: High\n```',
        text = `Intro.\n\n${line}\n\n${flow}\n\n${bars}`;
    const asked = [],
        opened = [];
    const props = (extra) =>
        threadProps({
            tree: {
                id: 'root',
                messages: [{ id: 'r', role: 'assistant', status: 'completed', text }],
            },
            trees: [
                {
                    id: 'child',
                    parent: 'root',
                    messageId: 'r',
                    start: text.indexOf(flow),
                    end: text.indexOf(flow) + flow.length,
                    label: 'Heat flows out',
                    passage: 'Freezing below 0 °C › Heat flows out',
                },
            ],
            addresses: new Map([['child', { address: '1.2', ink: 2 }]]),
            startBranch: (parent, anchor, origin) => asked.push({ parent, anchor, origin }),
            openConversation: (id) => opened.push(id),
            ...extra,
        });
    let rerender;
    function Fixture() {
        const [p, set] = useState(props());
        rerender = set;
        // The ask box floats inside the focused chat, under its header.
        return h(
            'div',
            { className: 'focused-chat' },
            h('div', { className: 'chat-header' }),
            h(ChatThread, p),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    const [plain, freeze, speed] = container.querySelectorAll('figure.sketch');
    assert.equal(plain.querySelectorAll('button').length, 0);
    assert.equal(plain.querySelectorAll('li').length, 2);
    const items = (figure) => [...figure.querySelectorAll('.sr-only button')];
    // One Tab stop per sketch; the arrows, Home and End move through its items in reading order.
    assert.deepEqual(
        items(freeze).map((b) => b.tabIndex),
        [0, -1, -1, -1, -1],
    );
    await act(async () => items(freeze)[0].focus());
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft'])
        await act(async () =>
            items(freeze)
                .find((b) => b === document.activeElement)
                .dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })),
        );
    assert.ok(document.activeElement === items(freeze)[1]);
    assert.ok(freeze.querySelectorAll('[data-item]')[1].classList.contains('focused'));
    await act(async () =>
        document.activeElement.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }),
        ),
    );
    assert.ok(document.activeElement === items(freeze)[4]);
    await act(async () => document.activeElement.click());
    await act(async () => items(freeze)[2].focus());
    await act(async () => items(freeze)[2].blur());
    assert.equal(items(freeze)[2].tabIndex, 0, 'Tab returns to the item focused last');
    // A click on a bars row's hit area asks about that row.
    await act(async () =>
        speed
            .querySelectorAll('[data-item]')[1]
            .dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    );
    const anchors = asked.map((a) => a.anchor);
    assert.deepEqual(
        anchors.map(({ text, sketch, start, end, messageId }) => [
            messageId,
            text.slice(text.indexOf('›') + 2),
            sketch.title,
            sketch.label,
            [start, end],
        ]),
        [
            [
                'r',
                'Total rises',
                'Freezing below 0 °C',
                'Total rises',
                [text.indexOf(flow), text.indexOf(flow) + flow.length],
            ],
            [
                'r',
                '60° latitude',
                'Approximate eastward speed of the ground',
                '60° latitude',
                [text.indexOf(bars), text.length],
            ],
        ],
    );
    assert.ok(asked[0].origin.current === items(freeze)[4], 'Escape returns to the item');
    // The open box keeps its item outlined.
    await act(async () =>
        rerender(props({ branch: { parent: 'root', anchor: anchors[1], question: '' } })),
    );
    assert.ok(speed.querySelectorAll('[data-item]')[1].classList.contains('open'));
    // The ask box names the sketch and the item.
    const crumbs = container.querySelector('.branch-form nav');
    assert.deepEqual(
        [crumbs.querySelector('span').textContent, crumbs.querySelector('strong').textContent],
        ['Approximate eastward speed of the ground', '60° latitude'],
    );
    assert.match(container.querySelector('.branch-form input').placeholder, /60° latitude/);
    // A branched item is marked in its line colour, read with its address, and its chip opens the branch.
    const heat = freeze.querySelectorAll('[data-item]')[2];
    assert.ok(heat.classList.contains('branched'));
    assert.match(items(freeze)[2].getAttribute('aria-label'), /branch 1\.2$/);
    const chip = freeze.querySelector('[role="group"] button');
    assert.equal(chip.textContent, '1.2');
    await act(async () => chip.click());
    assert.deepEqual(opened, ['child']);
    assert.equal(speed.querySelector('[role="group"]'), null);
    // Going back from the branch to its source lands on the item.
    const source = {
        messageId: 'r',
        start: text.indexOf(flow),
        end: text.indexOf(flow) + flow.length,
        text: 'Freezing below 0 °C › Heat flows out',
    };
    await act(async () => rerender(props({ source, validSource: true })));
    assert.ok(document.activeElement === items(freeze)[2]);
    assert.ok(heat.classList.contains('focused'));
});

test("a sketch item branch's source is found while its sketch still draws that item", () => {
    const block = `\`\`\`sketch flow\n${freezing}\n\`\`\``,
        text = `Intro.\n\n${block}\n\nOutro.`,
        at = text.indexOf(block),
        item = (start, end, passage) => sketchItemOf(sketchDrawnAt(text, start, end), passage);
    assert.equal(item(at, at + block.length, 'Freezing below 0 °C › Heat flows out'), 2);
    assert.equal(item(at, at + block.length, 'Freezing below 0 °C › Not drawn'), -1);
    assert.equal(item(at, at + block.length, 'Other title › Heat flows out'), -1);
    assert.equal(item(at + 1, at + block.length, 'Freezing below 0 °C › Heat flows out'), -1);
    assert.equal(item(0, 6, 'Intro.'), -1);
});
