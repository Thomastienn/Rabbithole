import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { FirstQuestion } = await import('../../src/chat/ChatStates.tsx');
const { MessageAttachments } = await import('../../src/chat/Attachments.tsx');

const transfer = (files) => ({ files, types: ['Files'], getData: () => '' });
const fire = (target, type, key, files) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, key, { value: transfer(files) });
    target.dispatchEvent(event);
    return event;
};

test('composer paperclip, paste and drop feed one handler; pending chips are removable and send alone', async (t) => {
    const submitted = [];
    let files;
    function Fixture() {
        const [pending, setPending] = useState([]);
        files = pending;
        return h(FirstQuestion, {
            draft: '',
            setDraft() {},
            files: pending,
            setFiles: setPending,
            busy: false,
            available: true,
            modelMenu: null,
            submit: (text) => submitted.push(text),
            modelError: '',
            loadModels() {},
            noModels: false,
        });
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    const picked = new File(['a'], 'picked.txt', { type: 'text/plain' }),
        pasted = new File(['b'], 'pasted.md', { type: 'text/markdown' }),
        dropped = new File(['c'], 'dropped.py', { type: 'text/x-python' });

    const input = container.querySelector('input[type=file]');
    let clicked = false;
    input.addEventListener('click', () => (clicked = true));
    await act(async () => button(container, 'Attach files').click());
    assert.ok(clicked, 'the paperclip opens the file picker');
    Object.defineProperty(input, 'files', { configurable: true, value: [picked] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

    const editor = container.querySelector('[role=textbox]');
    let event;
    await act(async () => (event = fire(editor, 'paste', 'clipboardData', [pasted])));
    assert.ok(event.defaultPrevented, 'a pasted file is not inserted as text');
    await act(async () => (event = fire(editor, 'drop', 'dataTransfer', [dropped])));
    assert.ok(event.defaultPrevented, 'a dropped file does not navigate away');
    assert.deepEqual(
        files.map((f) => f.name),
        ['picked.txt', 'pasted.md', 'dropped.py'],
    );
    assert.match(container.textContent, /picked\.txt.*pasted\.md.*dropped\.py/);

    const removes = [...container.querySelectorAll('button')].filter((b) =>
        /remove/i.test(b.getAttribute('aria-label') ?? ''),
    );
    assert.equal(removes.length, 3);
    await act(async () => removes[1].click());
    assert.deepEqual(
        files.map((f) => f.name),
        ['picked.txt', 'dropped.py'],
    );
    assert.doesNotMatch(container.textContent, /pasted\.md/);

    // Files alone are a question: Send is enabled with an empty draft.
    await act(async () => button(container, 'Send').click());
    assert.deepEqual(submitted, ['']);
});

function firstQuestion(t, { submit = () => {} } = {}) {
    const state = {};
    function Fixture() {
        const [pending, setPending] = useState([]);
        state.files = pending;
        return h(FirstQuestion, {
            draft: '',
            setDraft() {},
            files: pending,
            setFiles: setPending,
            busy: false,
            available: true,
            modelMenu: null,
            submit,
            modelError: '',
            loadModels() {},
            noModels: false,
        });
    }
    return render(h(Fixture), ui).then((page) => (t.after(page.cleanup), { ...page, state }));
}

test('dragging files over the composer shows the drop state until leave or drop, without child flicker', async (t) => {
    const { container, act, state } = await firstQuestion(t);
    const composer = container.querySelector('.attachment-composer');
    const field = container.querySelector('[role=textbox]');
    const dropping = () => composer.classList.contains('is-dropping');
    const note = () => container.querySelector('.attachment-drop');
    await act(async () => fire(composer, 'dragenter', 'dataTransfer', []));
    assert.ok(dropping(), 'files dragged over the composer show the drop state');
    assert.ok(note(), 'the drop note shows');
    // Crossing into a child fires enter on it before leave on the parent.
    await act(async () => fire(field, 'dragenter', 'dataTransfer', []));
    await act(async () => fire(composer, 'dragleave', 'dataTransfer', []));
    assert.ok(dropping(), 'moving over a child keeps the drop state');
    await act(async () => fire(field, 'dragleave', 'dataTransfer', []));
    assert.ok(!dropping() && !note(), 'leaving the composer clears it');

    // Text dragged from the page is not a file drop.
    await act(async () => {
        const event = new Event('dragenter', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', {
            value: { files: [], types: ['text/plain'] },
        });
        composer.dispatchEvent(event);
    });
    assert.ok(!dropping(), 'text drags show no drop state');

    await act(async () => fire(composer, 'dragenter', 'dataTransfer', []));
    const notes = new File(['n'], 'notes.txt', { type: 'text/plain' });
    let event;
    await act(async () => (event = fire(note(), 'drop', 'dataTransfer', [notes])));
    assert.ok(event.defaultPrevented, 'a drop on the note does not navigate away');
    assert.ok(!dropping(), 'dropping clears the drop state');
    assert.deepEqual(state.files, [notes]);
});

test('unsupported files are refused on add with one rose line; supported ones in the batch still join', async (t) => {
    const submitted = [];
    const { container, act, state } = await firstQuestion(t, {
        submit: (text) => submitted.push(text),
    });
    const line = () => container.querySelector('.attachment-note[role=alert]')?.textContent ?? '';
    const sheet = new File(['x'], 'worksheet.png', { type: 'image/png' }),
        docx = new File(['d'], 'lab-notes.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
    const input = container.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', { configurable: true, value: [sheet, docx] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    assert.deepEqual(state.files, [sheet], 'the supported file is still added');
    assert.equal(line(), 'lab-notes.docx wasn’t added. Attach images, PDFs or text files.');

    const editor = container.querySelector('[role=textbox]');
    const zip = new File(['z'], 'data.zip', { type: 'application/zip' }),
        gif = new File(['g'], 'loop.gif', { type: 'image/gif' });
    await act(async () => fire(editor, 'paste', 'clipboardData', [zip, gif]));
    assert.equal(line(), 'data.zip and loop.gif weren’t added. Attach images, PDFs or text files.');
    await act(async () => fire(editor, 'drop', 'dataTransfer', [docx]));
    assert.match(line(), /^lab-notes\.docx wasn’t added/, 'drops are checked too');
    assert.deepEqual(state.files, [sheet], 'refused files are never added');

    const md = new File(['m'], 'notes.md', { type: 'text/markdown' });
    await act(async () => fire(editor, 'paste', 'clipboardData', [md]));
    assert.equal(line(), '', 'the next add clears the line');
    assert.deepEqual(state.files, [sheet, md]);

    await act(async () => fire(editor, 'paste', 'clipboardData', [zip]));
    assert.ok(line());
    await act(async () => button(container, 'Send').click());
    assert.deepEqual(submitted, ['']);
    assert.equal(line(), '', 'sending clears the line');
});

test('pending files are tray slips with thumbnail or type, size meta, focus-keeping remove and revoked URLs', async (t) => {
    const made = [],
        revoked = [];
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = () => (made.push(`blob:${made.length}`), made.at(-1));
    URL.revokeObjectURL = (u) => revoked.push(u);
    t.after(() => Object.assign(URL, { createObjectURL, revokeObjectURL }));
    let setDraftFiles;
    function Fixture() {
        const [pending, setPending] = useState([
            new File(['x'.repeat(1.8 * 1024 * 1024)], 'worksheet.jpg', { type: 'image/jpeg' }),
            new File(['x'.repeat(2048)], 'notes.pdf', { type: 'application/pdf' }),
            new File(['y'], 'heap.py', { type: 'text/x-python' }),
        ]);
        setDraftFiles = setPending;
        return h(FirstQuestion, {
            draft: '',
            setDraft() {},
            files: pending,
            setFiles: setPending,
            busy: false,
            available: true,
            modelMenu: null,
            submit() {},
            modelError: '',
            loadModels() {},
            noModels: false,
        });
    }
    const { container, act, cleanup } = await render(h(Fixture), ui);
    t.after(cleanup);
    const composer = container.querySelector('.attachment-composer');
    const tray = composer.querySelector('.attachment-tray');
    assert.ok(
        composer.lastElementChild.contains(tray),
        'the tray sits inside the composer’s frame',
    );
    assert.equal(
        container.querySelector('.astryx-token, [class*=drawer]'),
        null,
        'no drawer or Tokens',
    );
    const slips = () => [...tray.querySelectorAll('.attachment-slip')];
    const meta = () => slips().map((s) => s.querySelector('.attachment-delivery').textContent);
    assert.deepEqual(meta(), ['Image · 1.8 MB', 'PDF · 2 KB', 'Text · 1 B']);
    assert.ok(
        slips()[0].querySelector('.attachment-tile img').getAttribute('src').startsWith('blob:'),
    );
    assert.deepEqual(
        slips()
            .slice(1)
            .map((s) => s.querySelector('.attachment-tile').textContent),
        ['PDF', 'PY'],
    );
    const field = container.querySelector('[role=textbox]');
    const placeholder = () =>
        container.textContent +
        (field.getAttribute('aria-placeholder') ?? '') +
        (field.dataset.placeholder ?? '');
    assert.match(placeholder(), /Ask about these files, or just send them/);

    const firstUrl = slips()[0].querySelector('img').getAttribute('src');
    await act(async () => button(container, 'Remove worksheet.jpg').click());
    assert.ok(revoked.includes(firstUrl), 'a removed image’s object URL is revoked');
    assert.equal(
        document.activeElement,
        button(container, 'Remove notes.pdf'),
        'focus moves to the next slip',
    );
    await act(async () => button(container, 'Remove heap.py').click());
    assert.equal(
        document.activeElement,
        button(container, 'Remove notes.pdf'),
        'else the previous slip',
    );
    assert.match(placeholder(), /Ask about this file, or just send it/);
    await act(async () => button(container, 'Remove notes.pdf').click());
    assert.equal(container.querySelector('.attachment-tray'), null);
    assert.equal(document.activeElement, field, 'with no slips left, focus goes to the field');
    assert.doesNotMatch(placeholder(), /just send/);

    // Sending clears the files, which revokes the remaining thumbnails.
    await act(async () => setDraftFiles([new File(['z'], 'red.png', { type: 'image/png' })]));
    const last = made.at(-1);
    await act(async () => setDraftFiles([]));
    assert.ok(revoked.includes(last), 'object URLs are revoked on send');
});

test('a sent slip names the file, its type and delivery, and the whole slip opens it in a new tab', async (t) => {
    const { container, cleanup } = await render(
        h(MessageAttachments, {
            conversation: 'c1',
            attachments: [
                { id: 'a1', name: 'heap.py', type: 'text/x-python', size: 20, delivery: 'text' },
                { id: 'a2', name: 'notes.pdf', type: 'application/pdf', size: 9, delivery: 'text' },
            ],
        }),
        ui,
    );
    t.after(cleanup);
    const [slip, pdf] = container.querySelectorAll('.message-files > .attachment-slip');
    const link = slip.querySelector('a');
    assert.equal(link.getAttribute('href'), '/api/trees/c1/attachments/a1');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.match(link.getAttribute('rel'), /noopener/);
    assert.equal(link.tabIndex, 0, 'the slip is reachable by keyboard');
    assert.equal(link.querySelector('.attachment-name').textContent, 'heap.py');
    assert.equal(link.querySelector('.attachment-delivery').textContent, 'Text · Read as text');
    assert.equal(slip.querySelector('.attachment-tile').textContent, 'PY');
    assert.ok(slip.querySelector('.attachment-end svg'), 'the open icon sits in the end slot');
    assert.equal(pdf.querySelector('.attachment-tile').textContent, 'PDF');
});

test('an image sent as an image is a plate showing the real image with its delivery', async (t) => {
    const { container, cleanup } = await render(
        h(MessageAttachments, {
            conversation: 'c1',
            attachments: [
                { id: 'a2', name: 'red.png', type: 'image/png', size: 7, delivery: 'image' },
            ],
        }),
        ui,
    );
    t.after(cleanup);
    assert.equal(container.querySelector('.attachment-slip'), null);
    const plate = container.querySelector('.attachment-plate');
    assert.equal(
        plate.querySelector('img.attachment-plate-image').getAttribute('src'),
        '/api/trees/c1/attachments/a2',
    );
    const link = plate.querySelector('a');
    assert.equal(link.getAttribute('href'), '/api/trees/c1/attachments/a2');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.match(link.textContent, /red\.png/);
    assert.equal(link.querySelector('.attachment-delivery').textContent, 'Sent as image');
});

test('an OCR slip opens its note from the magnifier by click and keyboard, never the file', async (t) => {
    const { container, act, cleanup } = await render(
        h(MessageAttachments, {
            conversation: 'c1',
            attachments: [
                { id: 'a1', name: 'notes.png', type: 'image/png', size: 20, delivery: 'ocr' },
            ],
        }),
        ui,
    );
    t.after(cleanup);
    const slip = container.querySelector('.attachment-slip');
    assert.ok(slip, 'an OCR image is a slip, not a plate');
    assert.equal(
        slip.querySelector('.attachment-tile img').getAttribute('src'),
        '/api/trees/c1/attachments/a1',
        'its tile is a thumbnail',
    );
    const link = slip.querySelector('a');
    assert.match(link.textContent, /notes\.png.*Image · OCR text/);
    const trigger = button(container, 'About OCR for notes.png');
    assert.ok(trigger.querySelector('svg'), 'OCR help has an icon');
    assert.ok(!link.contains(trigger), 'opening help cannot navigate to the attachment');
    assert.ok(slip.querySelector('.attachment-end').contains(trigger));
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    await act(async () => trigger.click());
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    const popup = () => document.querySelector('[role=dialog][aria-label="About OCR"]');
    assert.ok(popup(), 'the OCR help opens');
    await act(async () =>
        popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    // A native button: Enter and Space open the note from the keyboard.
    assert.equal(trigger.tagName, 'BUTTON');
});

test('PDF slips summarise typed, native image, mixed and OCR deliveries with OCR help', async (t) => {
    const deliveries = ['text', 'image', 'text,image', 'ocr', 'text,ocr'];
    const { container, act, cleanup } = await render(
        h(MessageAttachments, {
            conversation: 'c1',
            attachments: deliveries.map((delivery, id) => ({
                id: String(id),
                name: `notes-${id}.pdf`,
                type: 'application/pdf',
                size: 20,
                delivery,
            })),
        }),
        ui,
    );
    t.after(cleanup);
    assert.deepEqual(
        [...container.querySelectorAll('.attachment-delivery')].map((e) => e.textContent),
        [
            'PDF · Read as text',
            'PDF · Sent as images',
            'PDF · Read as text, sent as images',
            'PDF · OCR text',
            'PDF · Read as text, OCR text',
        ],
    );
    assert.equal(container.querySelectorAll('.attachment-slip').length, 5, 'PDFs are never plates');
    await act(async () => button(container, 'About OCR for notes-4.pdf').click());
    const popup = document.querySelector('[role=dialog][aria-label="About OCR"]');
    assert.ok(popup, 'PDF OCR opens the same help');
});
