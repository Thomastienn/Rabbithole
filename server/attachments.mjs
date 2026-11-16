// Attachment preparation: turns a learner's file into prepared parts the tutor receives.
import { OCR_UNAVAILABLE, ocrText } from './ocr.mjs';
import { IMAGE_TYPES } from '../src/chat/attachmentTypes.ts';

// Images the chat models read natively; their stored text is the placeholder history and compaction see.
export { IMAGE_TYPES };

const utf8 = new TextDecoder('utf-8', { fatal: true });

// { name, type, bytes } -> { delivery, parts: [{ text }] }; throws with the learner-facing reason when unsupported.
export async function prepareAttachment(
  { name, type, bytes },
  { readsImages = true, recognize } = {},
) {
  if (type === 'application/pdf') {
    const { pdfParts } = await import('./pdf.mjs');
    const extracted = await pdfParts({ name, bytes });
    const parts = [],
      deliveries = new Set();
    for (const part of extracted) {
      if (!part.image) {
        parts.push(part);
        deliveries.add('text');
      } else {
        const prepared = await prepareAttachment(part, { readsImages, recognize });
        deliveries.add(prepared.delivery);
        parts.push(...(readsImages ? [part] : prepared.parts));
      }
    }
    return { delivery: [...deliveries].join(','), parts };
  }
  if (IMAGE_TYPES.includes(type)) {
    if (readsImages)
      return { delivery: 'image', parts: [{ text: `[image: ${name}]`, image: true }] };
    if (!recognize) throw new Error(OCR_UNAVAILABLE);
    let text;
    try {
      text = await recognize(bytes);
    } catch (error) {
      throw new Error(
        error.unavailable
          ? OCR_UNAVAILABLE
          : `${name}: OCR couldn't read this image. Try another image or a model that reads images.`,
      );
    }
    return { delivery: 'ocr', parts: [{ text: ocrText(name, text) }] };
  }
  let text = null;
  if (!type.startsWith('image/') && type !== 'application/pdf')
    try {
      text = utf8.decode(bytes);
    } catch {}
  if (text === null || text.includes('\0'))
    throw new Error(
      `${name}: this file type can't be attached. Attach a PDF, plain-text file or a PNG, JPEG or WebP image.`,
    );
  // The whole file goes into the prompt; beyond this it fills the model's context.
  if (bytes.length > 1024 * 1024)
    throw new Error(`${name}: this text file is over 1 MB. Attach a shorter excerpt.`);
  return { delivery: 'text', parts: [{ text: `[Attached file: ${name}]\n${text}` }] };
}

// A learner message as the models read it: the typed question, then each attachment's prepared text.
export const withAttachments = (text, attachments = []) =>
  [text, ...attachments.map((a) => a.text).filter(Boolean)].filter((t) => t.trim()).join('\n\n');

// PDF turns interleave text and images; older callers still supply one text prompt plus images.
export const inputParts = (tree, text) =>
  tree.parts ?? [{ text }, ...(tree.images ?? []).map((image) => ({ image }))];
