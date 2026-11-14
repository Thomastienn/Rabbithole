import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAttachment } from '../../server/attachments.mjs';
import { OCR_UNAVAILABLE } from '../../server/ocr.mjs';

test('non-vision models get only OCR text for PNG, JPEG and WebP images', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    let called = false;
    assert.deepEqual(
      await prepareAttachment(
        { name: 'homework', type, bytes },
        {
          readsImages: false,
          recognize: async (input) => {
            assert.equal(input, bytes);
            called = true;
            return 'Binary heaps';
          },
        },
      ),
      { delivery: 'ocr', parts: [{ text: '[image: homework, read by OCR]\nBinary heaps' }] },
    );
    assert.ok(called);
  }
});

test('vision models bypass OCR; plain text also bypasses OCR for non-vision models', async () => {
  const recognize = () => assert.fail('OCR must not run');
  assert.deepEqual(
    await prepareAttachment(
      { name: 'notes.png', type: 'image/png', bytes: new Uint8Array() },
      { readsImages: true, recognize },
    ),
    { delivery: 'image', parts: [{ text: '[image: notes.png]', image: true }] },
  );
  assert.equal(
    (
      await prepareAttachment(
        { name: 'notes.txt', type: 'text/plain', bytes: new TextEncoder().encode('Notes') },
        { readsImages: false, recognize },
      )
    ).delivery,
    'text',
  );
});

test('empty OCR is identified explicitly; startup and recognition errors refuse preparation', async () => {
  const file = { name: 'scan.png', type: 'image/png', bytes: new Uint8Array() };
  assert.deepEqual(
    await prepareAttachment(file, { readsImages: false, recognize: async () => '' }),
    { delivery: 'ocr', parts: [{ text: '[image: scan.png, OCR found no text]' }] },
  );
  for (const recognize of [
    undefined,
    async () => {
      throw Object.assign(new Error('download failed'), { unavailable: true });
    },
  ])
    await assert.rejects(prepareAttachment(file, { readsImages: false, recognize }), {
      message: OCR_UNAVAILABLE,
    });
  await assert.rejects(
    prepareAttachment(file, {
      readsImages: false,
      recognize: async () => {
        throw new Error('invalid image');
      },
    }),
    {
      message:
        "scan.png: OCR couldn't read this image. Try another image or a model that reads images.",
    },
  );
});
