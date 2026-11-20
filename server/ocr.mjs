// OCR for chat models that cannot read images: one lazy tesseract.js worker per app.
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export const OCR_UNAVAILABLE =
    "This model can't read images and OCR language data couldn't be downloaded.";

// dir -> async (bytes) => text, with stop(). English data downloads on first use and is cached under dir/ocr.
// A failed start is forgotten, so the next send tries the download again.
export function tesseractOcr(dir, options = {}) {
    let worker = null;
    let queue = Promise.resolve();
    const start = async () => {
        const cachePath = join(dir, 'ocr');
        mkdirSync(cachePath, { recursive: true, mode: 0o700 });
        const { createWorker } = await import('tesseract.js');
        // Start with no language, then load English, so a failed download leaves a worker we can terminate.
        // errorHandler keeps tesseract.js from throwing the failure uncaught; the promise still rejects.
        const created = await createWorker([], 1, {
            cachePath,
            errorHandler: () => {},
            ...options,
        });
        try {
            await created.reinitialize('eng');
            return created;
        } catch (error) {
            await created.terminate();
            throw error;
        }
    };
    const recognize = (bytes) => {
        // The worker's image buffer is shared: concurrent conversations must take turns.
        const job = queue.then(async () => {
            worker ??= start().catch((error) => {
                worker = null;
                throw Object.assign(new Error(OCR_UNAVAILABLE), {
                    cause: error,
                    unavailable: true,
                });
            });
            const { data } = await (await worker).recognize(Buffer.from(bytes));
            return data.text.trim();
        });
        queue = job.catch(() => {});
        return job;
    };
    recognize.stop = () => queue.then(() => worker?.then((w) => w.terminate())).catch(() => {});
    return recognize;
}

// The text a non-vision model receives for an image.
export const ocrText = (name, text) =>
    text ? `[image: ${name}, read by OCR]\n${text}` : `[image: ${name}, OCR found no text]`;
