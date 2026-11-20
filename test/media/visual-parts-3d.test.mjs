import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { trackPointerHandlers, watchParts } from '../../src/media/visualParts.ts';

// An atom scene on a 200x200 canvas: nested parts, a named but unflagged object, a hidden part,
// and the visual's own drag-to-orbit handler on the canvas.
function atom() {
    const { window: w } = new JSDOM(
        '<div id="visual"><canvas id="scene"></canvas><button id="reset">Reset</button></div>',
        { pretendToBeVisual: true },
    );
    trackPointerHandlers(w);
    const root = w.document.getElementById('visual'),
        canvas = w.document.getElementById('scene'),
        posted = [];
    canvas.addEventListener('pointerdown', () => {});
    w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
    });
    const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    const ball = (name, radius, x, y = 0) => {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius),
            new THREE.MeshBasicMaterial(),
        );
        Object.assign(mesh, { name });
        mesh.position.set(x, y, 0);
        mesh.userData.part = true;
        return mesh;
    };
    const atomGroup = Object.assign(new THREE.Group(), { name: 'Atom' });
    atomGroup.userData.part = true;
    const shell = ball('Shell', 0.3, -1.5);
    shell.userData.part = false;
    const hidden = ball('Ghost', 0.3, 0, 1.5);
    hidden.visible = false;
    atomGroup.add(ball(' Nucleus ', 0.5, 0), ball('Electron', 0.2, 1.5), shell, hidden);
    scene.add(atomGroup);
    const drew = watchParts(w, root, (m) => posted.push(m));
    // Stands in for a WebGLRenderer frame, which needs a GPU; the sandbox's renderer calls drew after each.
    const draw = () => {
        scene.updateMatrixWorld();
        camera.updateMatrixWorld();
        drew(canvas, scene, camera);
    };
    draw();
    const at = (type, clientX, clientY, id = 'scene') =>
        w.document
            .getElementById(id)
            .dispatchEvent(new w.MouseEvent(type, { bubbles: true, clientX, clientY }));
    return { w, posted, at, draw, camera, drew };
}

// Pixels per world unit at the origin: fov 50 at distance 5 over 200px.
const unit = 100 / (5 * Math.tan((25 * Math.PI) / 180));
const names = (m) => m.parts.map((p) => p.name);
const centre = (p) => [p.x + p.width / 2, p.y + p.height / 2];

test('hovering a 3D object names the smallest flagged object under the pointer with its trail and on-screen bounds', () => {
    const { posted, at } = atom();
    at('pointermove', 100, 100);
    const hover = posted.pop();
    assert.equal(hover.type, 'part');
    assert.deepEqual(names(hover), ['Atom', 'Nucleus']);
    const [atomBox, nucleus] = hover.parts;
    assert.ok(nucleus.width > 20 && nucleus.width < 60, `nucleus ${nucleus.width}px wide`);
    assert.deepEqual(centre(nucleus).map(Math.round), [100, 100]);
    assert.ok(atomBox.width > nucleus.width, 'the group bounds hold every child');
    at('pointermove', 101, 100);
    assert.equal(posted.length, 0, 'the same part posts once');
    at('pointermove', 100 + 1.5 * unit, 100);
    assert.deepEqual(names(posted.pop()), ['Atom', 'Electron']);
    at('pointermove', 100 - 1.5 * unit, 100);
    assert.deepEqual(
        names(posted.pop()),
        ['Atom'],
        'a named object without the flag is no part of its own',
    );
    at('pointermove', 100, 100 - 1.5 * unit);
    assert.deepEqual(posted.pop(), { type: 'leave' }, 'a hidden object is no part');
    at('pointermove', 5, 5);
    assert.deepEqual(posted, [], 'empty space picks nothing');
});

test('the rectangle follows the object as the camera moves', () => {
    const { posted, at, draw, camera } = atom();
    at('pointermove', 100, 100);
    const before = posted.pop().parts[1];
    camera.position.x = 0.2;
    draw();
    const after = posted.pop();
    assert.deepEqual(names(after), ['Atom', 'Nucleus']);
    assert.ok(
        centre(after.parts[1])[0] < centre(before)[0] - 2,
        'the box moved left with the view',
    );
    draw();
    assert.equal(posted.length, 0, 'a still frame posts nothing');
    at('pointermove', 0, 0, 'reset');
    posted.length = 0;
    camera.position.x = 0;
    draw();
    assert.deepEqual(posted, [], 'off the canvas, frames post nothing');
});

test('one click asks about the object, and dragging to orbit never picks', () => {
    const { posted, at } = atom();
    at('pointerdown', 100, 100);
    at('pointermove', 140, 100);
    at('click', 140, 100);
    assert.ok(!posted.some((m) => m.type === 'pick'), 'an orbit drag never picks');
    at('pointerdown', 100, 100);
    at('click', 101, 100);
    const pick = posted.pop();
    assert.equal(pick.type, 'pick');
    assert.deepEqual(names(pick), ['Atom', 'Nucleus']);
    assert.equal(pick.step, null);
});

test('while the host picks from the keyboard, the scene posts its flagged objects as parts, and their bounds follow the camera', async () => {
    const { w, posted, draw, camera, drew } = atom();
    const frame = () => new Promise((resolve) => w.requestAnimationFrame(() => resolve()));
    drew.watch(true);
    await frame();
    const { type, parts, step } = posted.pop();
    assert.deepEqual([type, step], ['tree', null]);
    const [atomPart] = parts;
    assert.deepEqual(
        [atomPart.name, atomPart.parts.map((p) => p.name)],
        ['Atom', ['Nucleus', 'Electron']],
        'unflagged and hidden objects are no parts',
    );
    const nucleus = atomPart.parts[0];
    assert.deepEqual(centre(nucleus).map(Math.round), [100, 100]);
    camera.position.x = 0.2;
    draw();
    await frame();
    assert.ok(
        centre(posted.pop().parts[0].parts[0])[0] < centre(nucleus)[0] - 2,
        'the box moved left with the view',
    );
    drew.watch(false);
    camera.position.x = 0;
    draw();
    await frame();
    assert.deepEqual(posted, []);
});

test('a branched 3D object keeps its rectangle, which follows the camera, and a hidden one has none', async () => {
    const { w, posted, draw, camera, drew } = atom();
    const frame = () => new Promise((resolve) => w.requestAnimationFrame(() => resolve()));
    drew.mark([
        ['Atom', 'Nucleus'],
        ['Atom', 'Ghost'],
    ]);
    await frame();
    const { type, marks } = posted.pop();
    assert.equal(type, 'marks');
    assert.deepEqual(
        marks.map((m) => m.trail),
        [['Atom', 'Nucleus']],
    );
    assert.deepEqual(centre(marks[0]).map(Math.round), [100, 100]);
    camera.position.x = 0.2;
    draw();
    await frame();
    assert.ok(
        centre(posted.pop().marks[0])[0] < centre(marks[0])[0] - 2,
        'the rectangle moved left with the view',
    );
});
