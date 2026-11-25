import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { prepareAttachment } from '../../server/attachments.mjs';
import { OCR_UNAVAILABLE } from '../../server/ocr.mjs';

const fixture = (name) =>
    new Uint8Array(readFileSync(new URL(`../fixtures/pdf/${name}.pdf`, import.meta.url)));
const prepare = (name, options) =>
    prepareAttachment(
        {
            name: `${name}.pdf`,
            type: 'application/pdf',
            bytes: fixture(name),
        },
        options,
    );
const native = { recognize: () => assert.fail('Native PDF delivery must skip OCR') };
function image(part, width = 2, height = 2) {
    assert.equal(part.image, true);
    assert.equal(part.type, 'image/png');
    assert.equal(Buffer.from(part.bytes).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(part.bytes.readUInt32BE(16), width, 'embedded pixels, not a rasterised page');
    assert.equal(part.bytes.readUInt32BE(20), height);
}

async function pixels(part) {
    const decoded = await loadImage(part.bytes);
    const canvas = createCanvas(decoded.width, decoded.height),
        context = canvas.getContext('2d');
    context.drawImage(decoded, 0, 0);
    return [...context.getImageData(0, 0, decoded.width, decoded.height).data];
}

test('PDF typed text uses text parts, preserving lines and spaced glyphs without consuming the original bytes', async () => {
    const bytes = fixture('typed'),
        original = bytes.slice();
    const result = await prepareAttachment(
        { name: 'typed.pdf', type: 'application/pdf', bytes },
        native,
    );
    assert.deepEqual(result, {
        delivery: 'text',
        parts: [{ text: '[Attached PDF: typed.pdf, page 1]\nBinary heaps\nParent child' }],
    });
    assert.deepEqual(bytes, original, 'pdfjs must not transfer away the bytes needed for storage');
});

test('PDF figures use drawn area: a large image survives and a small logo is skipped, in content order', async () => {
    const result = await prepare('figure', native);
    assert.equal(result.delivery, 'text,image');
    assert.equal(result.parts.length, 3);
    assert.match(result.parts[0].text, /page 1\]\nA large figure$/);
    image(result.parts[1]);
    assert.deepEqual(
        await pixels(result.parts[1]),
        [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255],
    );
    assert.equal(result.parts[1].name, 'figure.pdf, page 1, image 1');
    assert.match(result.parts[2].text, /Figure caption$/);
});

test('PDF scans send the embedded page image and ignore invisible OCR; render-mode state restores correctly', async () => {
    const scan = await prepare('scan', native);
    assert.equal(scan.delivery, 'image');
    assert.equal(scan.parts.length, 1);
    image(scan.parts[0]);
    assert.doesNotMatch(scan.parts[0].text, /WRONG|hidden OCR/);
    const visible = await prepare('visibility', native);
    assert.deepEqual(visible, {
        delivery: 'text',
        parts: [{ text: '[Attached PDF: visibility.pdf, page 1]\nVisible before\nVisible after' }],
    });
});

test('PDF vectors are never rasterised: only labels survive; pages without readable content are explicit', async () => {
    assert.deepEqual(await prepare('vector', native), {
        delivery: 'text',
        parts: [{ text: '[Attached PDF: vector.pdf, page 1]\nVector label' }],
    });
    const empty = await prepare('empty', native);
    assert.equal(empty.delivery, 'text');
    assert.equal(empty.parts.length, 1);
    assert.equal(empty.parts[0].image, undefined);
    assert.match(empty.parts[0].text, /No readable text.*vector drawings are not sent/);
});

test('PDF includes the exact 10% boundary and form transforms; inline and 1-bit images become PNGs', async () => {
    const threshold = await prepare('threshold', native);
    assert.equal(
        threshold.parts.length,
        2,
        '10% image and transformed form, skipping 9.75% and off-page images',
    );
    threshold.parts.forEach((p) => image(p));
    const inline = await prepare('inline', native);
    image(inline.parts[0], 2, 1);
    const gray = await prepare('gray', native);
    image(gray.parts[0], 8, 2);
    assert.deepEqual((await pixels(gray.parts[0])).slice(0, 8), [255, 255, 255, 255, 0, 0, 0, 255]);
    const stencil = await prepare('stencil', native);
    image(stencil.parts[0], 8, 2);
    assert.deepEqual((await pixels(stencil.parts[0])).slice(0, 8), [0, 0, 0, 0, 51, 128, 26, 255]);
    const repeated = await prepare('repeated', native);
    assert.equal(repeated.parts.length, 5, 'each drawn occurrence qualifies independently');
    repeated.parts.forEach((p) => image(p));
});

test('non-vision PDF preparation OCRs only qualifying images, keeping typed text and page order', async () => {
    const calls = [];
    const result = await prepare('ordered', {
        readsImages: false,
        recognize: async (bytes) => {
            assert.equal(Buffer.from(bytes).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
            calls.push(bytes);
            return `Recognised ${calls.length}`;
        },
    });
    assert.equal(calls.length, 2, 'figure and scan only; logo and vectors do not go through OCR');
    assert.equal(result.delivery, 'text,ocr');
    assert.ok(result.parts.every((p) => !p.image && !p.bytes));
    assert.deepEqual(
        result.parts.map((p) => p.text.split('\n').at(-1)),
        [
            'Parent child',
            'A large figure',
            'Recognised 1',
            'Figure caption',
            'Recognised 2',
            'Vector label',
        ],
    );
    assert.doesNotMatch(JSON.stringify(result), /WRONG hidden OCR/);
    assert.equal(
        (await prepare('typed', { readsImages: false, recognize: native.recognize })).delivery,
        'text',
    );
});

test('PDF OCR failure refuses preparation; malformed PDFs have an actionable reason', async () => {
    await assert.rejects(prepare('scan', { readsImages: false }), { message: OCR_UNAVAILABLE });
    await assert.rejects(
        prepare('scan', {
            readsImages: false,
            recognize: async () => {
                throw Object.assign(new Error('download failed'), { unavailable: true });
            },
        }),
        { message: OCR_UNAVAILABLE },
    );
    await assert.rejects(
        prepareAttachment({
            name: 'bad.pdf',
            type: 'application/pdf',
            bytes: new Uint8Array([0, 1]),
        }),
        {
            message:
                "bad.pdf: this PDF couldn't be read. Attach another PDF or its pages as images.",
        },
    );
});

test('PDFs over the text or image limit are refused, asking for only the needed pages', async () => {
    await assert.rejects(prepare('long', native), {
        message:
            'long.pdf: this PDF is too large to send because its text is over 1 MB. Attach only the pages you need.',
    });
    await assert.rejects(prepare('pictures', native), {
        message:
            'pictures.pdf: this PDF is too large to send because it has over 100 images. Attach only the pages you need.',
    });
});
