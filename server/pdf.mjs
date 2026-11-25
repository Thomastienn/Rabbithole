import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnnotationMode, getDocument, ImageKind, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Anthropic's API accepts at most 100 images per request; Codex accepts more.
const MAX_IMAGES = 100;
const assets = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const identity = [1, 0, 0, 1, 0, 0];
const compact = (s) => s.replace(/\s/g, '');

export class PdfLimitError extends Error {
    constructor(name, reason = 'its text is over 1 MB') {
        super(
            `${name}: this PDF is too large to send because ${reason}. Attach only the pages you need.`,
        );
    }
}

// TextContent restores spacing; operator glyphs supply visibility and order, including hidden OCR.
function textRuns(events, content) {
    const runs = events.filter((e) => e.raw !== undefined);
    const extracted = content.items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('');
    if (compact(extracted) !== compact(runs.map((r) => r.raw).join(''))) return;
    const positions = [];
    for (let i = 0; i < extracted.length; i++) if (/\S/.test(extracted[i])) positions.push(i);
    positions.push(extracted.length);
    let cursor = 0;
    for (const run of runs) {
        const end = cursor + compact(run.raw).length;
        run.raw = extracted.slice(positions[cursor], positions[end]);
        cursor = end;
    }
}

// Clip the drawn unit square to the page's CropBox before measuring its area.
function imageArea(matrix, box) {
    let polygon = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ].map((p) => {
        Util.applyTransform(p, matrix);
        return p;
    });
    for (const [axis, edge, sign] of [
        [0, box[0], 1],
        [0, box[2], -1],
        [1, box[1], 1],
        [1, box[3], -1],
    ]) {
        const clipped = [];
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
                b = polygon[(i + 1) % polygon.length];
            const insideA = sign * (a[axis] - edge) >= 0,
                insideB = sign * (b[axis] - edge) >= 0;
            if (insideA) clipped.push(a);
            if (insideA !== insideB) {
                const t = (edge - a[axis]) / (b[axis] - a[axis]);
                clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
            }
        }
        polygon = clipped;
    }
    return (
        Math.abs(
            polygon.reduce((sum, a, i) => {
                const b = polygon[(i + 1) % polygon.length];
                return sum + a[0] * b[1] - b[0] * a[1];
            }, 0),
        ) / 2
    );
}

// Encode only the decoded embedded pixels, never the page or its vector paths.
function png(image, factory, crop, maskColor) {
    const { width, height, data, kind } = image;
    const surface = factory.create(width, height);
    let cropped;
    try {
        const pixels = surface.context.createImageData(width, height);
        for (let i = 0; i < width * height; i++) {
            const p = i * 4;
            if (kind === ImageKind.GRAYSCALE_1BPP) {
                const byte =
                    data[
                        Math.floor(i / width) * Math.ceil(width / 8) + Math.floor((i % width) / 8)
                    ];
                pixels.data[p] =
                    pixels.data[p + 1] =
                    pixels.data[p + 2] =
                        byte & (128 >> ((i % width) % 8)) ? 255 : 0;
            } else {
                const source = i * (kind === ImageKind.RGBA_32BPP ? 4 : 3);
                pixels.data[p] = data[source];
                pixels.data[p + 1] = data[source + 1];
                pixels.data[p + 2] = data[source + 2];
            }
            pixels.data[p + 3] = maskColor
                ? pixels.data[p]
                    ? 0
                    : 255
                : kind === ImageKind.RGBA_32BPP
                  ? data[p + 3]
                  : 255;
        }
        surface.context.putImageData(pixels, 0, 0);
        if (maskColor) {
            surface.context.globalCompositeOperation = 'source-in';
            surface.context.fillStyle = maskColor;
            surface.context.fillRect(0, 0, width, height);
        }
        if (!crop) return surface.canvas.toBuffer('image/png');
        cropped = factory.create(crop.w, crop.h);
        cropped.context.drawImage(
            surface.canvas,
            crop.x,
            crop.y,
            crop.w,
            crop.h,
            0,
            0,
            crop.w,
            crop.h,
        );
        return cropped.canvas.toBuffer('image/png');
    } finally {
        if (cropped) factory.destroy(cropped);
        factory.destroy(surface);
    }
}

async function pageParts(page, factory, name, number, imageBudget) {
    const [ops, content] = await Promise.all([
        page.getOperatorList({ annotationMode: AnnotationMode.DISABLE }),
        page.getTextContent({ disableNormalization: true }),
    ]);
    const events = [],
        stack = [];
    let state = { matrix: identity, mode: 0, fill: '#000000' },
        newline = false;
    const pageArea = (page.view[2] - page.view[0]) * (page.view[3] - page.view[1]);
    const image = (source, matrix = state.matrix, crop, maskColor) => {
        if (imageArea(matrix, page.view) >= pageArea * 0.1) {
            if (imageBudget.remaining === 0)
                throw new PdfLimitError(name, `it has over ${MAX_IMAGES} images`);
            imageBudget.remaining--;
            events.push({ source, crop, maskColor });
        }
    };
    for (let i = 0; i < ops.fnArray.length; i++) {
        const op = ops.fnArray[i],
            args = ops.argsArray[i];
        if (op === OPS.save || op === OPS.paintFormXObjectBegin || op === OPS.beginGroup) {
            stack.push({ ...state });
            if (op === OPS.paintFormXObjectBegin && args[0])
                state.matrix = Util.transform(state.matrix, args[0]);
        } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd || op === OPS.endGroup) {
            state = stack.pop() ?? state;
        } else if (op === OPS.transform) state.matrix = Util.transform(state.matrix, args);
        else if (op === OPS.setTextRenderingMode) state.mode = args[0];
        else if (op === OPS.setFillRGBColor) state.fill = args[0];
        else if (op === OPS.setFillTransparent) state.fill = 'transparent';
        else if (
            [
                OPS.moveText,
                OPS.setTextMatrix,
                OPS.nextLine,
                OPS.setLeadingMoveText,
                OPS.endText,
            ].includes(op)
        )
            newline = true;
        else if (op === OPS.showText) {
            const raw = args[0]
                .map((g) => (typeof g === 'number' ? (g < 0 ? ' ' : '') : g.unicode))
                .join('');
            events.push({ raw, visible: (state.mode & 3) !== 3, newline });
            newline = false;
        } else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject)
            image(args[0]);
        else if (op === OPS.paintImageXObjectRepeat) {
            const [source, sx, sy, positions] = args;
            for (let j = 0; j < positions.length; j += 2)
                image(
                    source,
                    Util.transform(state.matrix, [sx, 0, 0, sy, positions[j], positions[j + 1]]),
                );
        } else if (op === OPS.paintInlineImageXObjectGroup) {
            for (const entry of args[1])
                image(args[0], Util.transform(state.matrix, entry.transform), entry);
        } else if (op === OPS.paintImageMaskXObject)
            image(args[0], state.matrix, undefined, state.fill);
        else if (op === OPS.paintImageMaskXObjectRepeat) {
            const [source, sx, kx, ky, sy, positions] = args;
            for (let j = 0; j < positions.length; j += 2)
                image(
                    source,
                    Util.transform(state.matrix, [sx, kx, ky, sy, positions[j], positions[j + 1]]),
                    undefined,
                    state.fill,
                );
        } else if (op === OPS.paintImageMaskXObjectGroup) {
            for (const entry of args[0])
                image(entry, Util.transform(state.matrix, entry.transform), undefined, state.fill);
        } else if (op === OPS.paintSolidColorImageMask) {
            image(
                { width: 1, height: 1, data: Uint8Array.of(0) },
                state.matrix,
                undefined,
                state.fill,
            );
        }
    }
    textRuns(events, content);
    const parts = [];
    let text = '',
        images = 0;
    const flush = () => {
        if (text.trim())
            parts.push({ text: `[Attached PDF: ${name}, page ${number}]\n${text.trim()}` });
        text = '';
    };
    for (const event of events) {
        if (event.raw !== undefined) {
            if (event.visible)
                text += (event.newline && text && !text.endsWith('\n') ? '\n' : '') + event.raw;
            continue;
        }
        flush();
        const object = (id) =>
            new Promise((resolve, reject) =>
                (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, resolve, reject),
            );
        let pixels = typeof event.source === 'string' ? await object(event.source) : event.source;
        if (event.maskColor) {
            if (typeof pixels.data === 'string')
                pixels = { ...pixels, ...(await object(pixels.data)) };
            pixels = { ...pixels, kind: ImageKind.GRAYSCALE_1BPP };
        }
        if (!pixels?.data) throw new Error('An embedded image could not be decoded.');
        const imageName = `${name}, page ${number}, image ${++images}`;
        parts.push({
            text: `[image: ${imageName}]`,
            image: true,
            name: imageName,
            type: 'image/png',
            bytes: png(pixels, factory, event.crop, event.maskColor),
        });
    }
    flush();
    if (!parts.length)
        parts.push({
            text: `[Attached PDF: ${name}, page ${number}]\n[No readable text or substantial embedded images; vector drawings are not sent.]`,
        });
    return parts;
}

export async function pdfParts({ name, bytes }, maxTextBytes) {
    const task = getDocument({
        data: Uint8Array.from(bytes),
        cMapUrl: join(assets, 'cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: join(assets, 'standard_fonts/'),
        wasmUrl: join(assets, 'wasm/'),
        iccUrl: join(assets, 'iccs/'),
        useWorkerFetch: false,
        isEvalSupported: false,
        isOffscreenCanvasSupported: false,
        isImageDecoderSupported: false,
        stopAtErrors: true,
    });
    try {
        const document = await task.promise,
            parts = [];
        const imageBudget = { remaining: MAX_IMAGES };
        let textBytes = 0;
        for (let number = 1; number <= document.numPages; number++) {
            const page = await document.getPage(number);
            const added = await pageParts(page, document.canvasFactory, name, number, imageBudget);
            page.cleanup();
            for (const part of added) if (!part.image) textBytes += Buffer.byteLength(part.text);
            if (textBytes > maxTextBytes) throw new PdfLimitError(name);
            parts.push(...added);
        }
        return parts;
    } catch (error) {
        if (error instanceof PdfLimitError) throw error;
        throw new Error(
            error.name === 'PasswordException'
                ? `${name}: this PDF needs a password. Attach an unlocked copy.`
                : `${name}: this PDF couldn't be read. Attach another PDF or its pages as images.`,
            { cause: error },
        );
    } finally {
        await task.destroy();
    }
}
