import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generateVisual } from '../../server/media/visuals.mjs';
import { toolMcp } from '../../server/tools/mcp.mjs';
import { THREEJS_SKILL, MOTION_DESIGN_SKILL, GSAP_SKILL } from '../../server/media/skills.mjs';
import { fixerTask, visualAnswer } from '../support/visual-kit.mjs';

const SCENE =
    '<div aria-label="A cube" role="img"></div><script>const renderer = new THREE.WebGLRenderer();</script>';
const PULSE =
    '<svg viewBox="0 0 10 10" role="img" aria-label="A dot"><circle cx="5" cy="5" r="2" style="animation: pulse 1s"/></svg><style>@keyframes pulse { to { opacity: 0.5; } }</style>';
const TWEEN =
    '<svg viewBox="0 0 10 10" role="img" aria-label="A dot"><circle cx="5" cy="5" r="2"/></svg><script>gsap.timeline().to(document.querySelector("circle"), { x: 3 });</script>';
const input = { request: { title: 'Cube', shows: 'A cube', alt: 'A cube' }, earlierTitles: [] };

// A writer fixture: each call runs one scripted attempt with the tree it was given.
function writer(attempts) {
    const calls = [];
    return {
        calls,
        generate: async (tree, text, emit, _save, signal) => {
            calls.push({ tree, input: fixerTask(text) });
            const output = visualAnswer(text, await attempts[calls.length - 1](tree, signal));
            emit({ type: 'item', item: 'answer', text: output });
            emit({ type: 'status', status: 'completed' });
        },
    };
}

// Calls load_skill over the per-attempt MCP server, the way Claude and Codex do.
async function loadSkill(tree, name, signal) {
    const turn = await tree.mcp.open(tree, () => {}, signal);
    const client = new Client({ name: 'fixture', version: '1' });
    try {
        await client.connect(
            new StreamableHTTPClientTransport(new URL(turn.url), {
                requestInit: { headers: turn.headers },
            }),
        );
        return (await client.callTool({ name: 'load_skill', arguments: { name } })).content[0].text;
    } finally {
        await client.close();
        turn.close();
    }
}

const run = (provider, tools) =>
    generateVisual(provider, {}, input, new AbortController().signal, 10000, () => {}, tools);

test('the visual writer receives the input kit catalogue', async () => {
    const visual = '<rh-button label="Check" variant="primary"></rh-button>';
    const provider = writer([async () => visual]);
    assert.equal(await run(provider), visual);
    const { instructions } = provider.calls[0].tree;
    for (const [tag, attributes] of Object.entries({
        button: ['label', 'variant'],
        'button-group': [],
        toggle: ['label', 'pressed'],
        switch: ['label', 'checked'],
        slider: ['label', 'min', 'max', 'step', 'unit', 'value'],
        number: ['label', 'min', 'max', 'step', 'unit', 'value'],
        choice: ['label', 'options', 'value'],
        text: ['label', 'placeholder', 'value'],
        reset: ['label'],
    })) {
        const entry = new RegExp(`<rh-${tag}(?: ([^>]*))?>`).exec(instructions);
        assert.ok(entry, `rh-${tag} is available to the writer`);
        for (const attribute of attributes)
            assert.match(entry[1], new RegExp(`\\b${attribute}\\b`));
    }
    for (const term of [
        'primary',
        'secondary',
        'quiet',
        'disabled',
        'input',
        'change',
        'click',
        'reset',
    ])
        assert.match(instructions, new RegExp(`\\b${term}\\b`));
});

test('a writer that loads threejs gets its text and its 3D visual is accepted', async () => {
    const mcp = toolMcp();
    let loaded;
    const provider = writer([
        async (tree, signal) => {
            assert.deepEqual(
                tree.tools.map((t) => t.name),
                ['load_skill'],
            );
            loaded = await loadSkill(tree, 'threejs', signal);
            return SCENE;
        },
    ]);
    try {
        assert.match(await run(provider, { capable: true, mcp }), /THREE\.WebGLRenderer/);
        assert.equal(loaded, THREEJS_SKILL);
        assert.equal(provider.calls.length, 1);
        assert.ok(!provider.calls[0].tree.instructions.includes(THREEJS_SKILL));
    } finally {
        await mcp.close();
    }
});

test('a 3D visual written without threejs is retried once with the skill in the prompt', async () => {
    const mcp = toolMcp();
    const provider = writer([async () => SCENE, async () => SCENE]);
    try {
        assert.match(await run(provider, { capable: true, mcp }), /THREE\.WebGLRenderer/);
        assert.equal(provider.calls.length, 2);
        assert.ok(provider.calls[1].tree.instructions.includes(THREEJS_SKILL));
        assert.ok(!provider.calls[1].tree.instructions.includes(MOTION_DESIGN_SKILL));
        assert.match(provider.calls[1].input.validationError, /threejs/);
    } finally {
        await mcp.close();
    }
});

test('an animated visual written without motion-design is retried once with it', async () => {
    const mcp = toolMcp();
    const provider = writer([async () => PULSE, async () => PULSE]);
    try {
        assert.match(await run(provider, { capable: true, mcp }), /@keyframes/);
        assert.equal(provider.calls.length, 2);
        assert.ok(provider.calls[1].tree.instructions.includes(MOTION_DESIGN_SKILL));
        assert.match(provider.calls[1].input.validationError, /motion-design/);
    } finally {
        await mcp.close();
    }
});

test('without tool support a text load_skill call is hidden and answered by the retry prompt', async () => {
    const call = '<tool_call>{"name": "load_skill", "arguments": {"name": "threejs"}}</tool_call>';
    const provider = writer([async () => call + SCENE, async () => SCENE]);
    const result = await run(provider, { capable: false });
    assert.doesNotMatch(result, /tool_call/);
    assert.equal(provider.calls[0].tree.tools, undefined);
    assert.match(provider.calls[0].tree.instructions, /<tool_call>/);
    assert.equal(provider.calls.length, 2);
    assert.ok(provider.calls[1].tree.instructions.includes(THREEJS_SKILL));
});

test('a gsap visual whose writer loads gsap and motion-design is accepted in one call', async () => {
    const mcp = toolMcp();
    const loaded = [];
    const provider = writer([
        async (tree, signal) => {
            loaded.push(await loadSkill(tree, 'gsap', signal));
            loaded.push(await loadSkill(tree, 'motion-design', signal));
            return TWEEN;
        },
    ]);
    try {
        assert.match(await run(provider, { capable: true, mcp }), /gsap\.timeline/);
        assert.deepEqual(loaded, [GSAP_SKILL, MOTION_DESIGN_SKILL]);
        assert.equal(provider.calls.length, 1);
        assert.match(provider.calls[0].tree.instructions, /- gsap: /);
    } finally {
        await mcp.close();
    }
});

test('a GSAP visual written without gsap is retried once with gsap and motion-design', async () => {
    const mcp = toolMcp();
    const provider = writer([async () => TWEEN, async () => TWEEN]);
    try {
        assert.match(await run(provider, { capable: true, mcp }), /gsap\.timeline/);
        assert.equal(provider.calls.length, 2);
        assert.ok(!provider.calls[0].tree.instructions.includes(GSAP_SKILL));
        assert.ok(provider.calls[1].tree.instructions.includes(GSAP_SKILL));
        assert.ok(provider.calls[1].tree.instructions.includes(MOTION_DESIGN_SKILL));
        assert.ok(!provider.calls[1].tree.instructions.includes(THREEJS_SKILL));
        assert.match(provider.calls[1].input.validationError, /gsap and motion-design/);
    } finally {
        await mcp.close();
    }
});
