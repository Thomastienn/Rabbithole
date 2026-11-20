import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { Copies } = await import('../../server/media/video-kit.tsx');

const vary = (i, rand) => ({
    x: Math.round(rand() * 1920),
    y: i,
    state: rand() < 0.5 ? 'wave' : 'walk',
});

test('2D copies draw the requested number of seeded, stable variations of a part', () => {
    const Person = ({ x, y, state }) => h('i', { 'data-x': x, 'data-y': y, 'data-state': state });
    const draw = (seed) => renderToStaticMarkup(h(Copies, { of: Person, count: 40, seed, vary }));
    const once = draw(3);
    assert.equal(once.match(/<i /g).length, 40);
    assert.equal(draw(3), once, 'the same seed draws the same copies every frame');
    assert.notEqual(draw(4), once, 'another seed varies them');
    assert.equal(
        new Set(once.match(/data-x="\d+"/g)).size > 30,
        true,
        'copies differ through props',
    );
    assert.match(
        once,
        /data-state="wave"[\s\S]*data-state="walk"|data-state="walk"[\s\S]*data-state="wave"/,
    );
});

test('3D copies draw each mesh of the part once per state with instancing', async (t) => {
    const dom = await render(h('div'), ui);
    t.after(dom.cleanup);
    const { createRoot, act, extend } = await import('@react-three/fiber');
    const THREE = await import('three');
    extend(THREE);
    const stub = {
        render() {},
        setSize() {},
        setPixelRatio() {},
        getPixelRatio: () => 1,
        shadowMap: {},
        xr: { addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} },
        domElement: document.createElement('canvas'),
    };
    const root = createRoot(stub.domElement);
    await root.configure({
        gl: stub,
        frameloop: 'never',
        size: { width: 160, height: 90, top: 0, left: 0 },
    });
    let rendered = 0;
    // A two-mesh person whose head sits one unit above its body.
    function Person3D({ state }) {
        rendered++;
        return h(
            'group',
            null,
            h('mesh', { name: `body-${state}` }, h('boxGeometry')),
            h('mesh', { name: `head-${state}`, position: [0, 1, 0] }, h('sphereGeometry')),
        );
    }
    const crowd = (i, rand) => ({
        position: [i, 0, Math.round(rand() * 10)],
        scale: 2,
        state: i % 2 ? 'wave' : 'walk',
    });
    let scene;
    const Grab = () => h('group', { ref: (g) => (scene = g?.parent) });
    await act(async () =>
        root.render(
            h(
                'group',
                null,
                h(Grab),
                h(Copies, { of: Person3D, count: 300, seed: 1, vary: crowd }),
            ),
        ),
    );
    t.after(() => root.unmount());
    assert.equal(rendered, 2, 'one hidden template per state, not one per copy');
    const instanced = [];
    scene.traverse((o) => o.isInstancedMesh && instanced.push(o));
    assert.equal(instanced.length, 4, 'body and head, for each state');
    assert.deepEqual(
        instanced.map((m) => m.count),
        [150, 150, 150, 150],
    );
    const head = instanced.find((m) => m.geometry.type === 'SphereGeometry');
    const m = new THREE.Matrix4();
    head.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    assert.deepEqual([p.x, p.y], [0, 2], 'the head sits one unit up, scaled by the copy');
    assert.equal(p.z, Math.round(p.z), 'placed at the seeded position');
    const first = [...head.instanceMatrix.array];
    await act(async () =>
        root.render(
            h(
                'group',
                null,
                h(Grab),
                h(Copies, { of: Person3D, count: 300, seed: 1, vary: crowd }),
            ),
        ),
    );
    const again = [];
    scene.traverse((o) => o.isInstancedMesh && again.push(o));
    assert.equal(again.length, 4, 'a rerender replaces the copies rather than adding more');
    assert.deepEqual(
        [...again.find((m) => m.geometry.type === 'SphereGeometry').instanceMatrix.array],
        first,
        'stable across frames',
    );
});
