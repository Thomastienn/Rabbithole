// Attachment preparation: turns a learner's file into prepared parts the tutor receives.
// shortcut: PDFs are refused until their preparation lands.
import { OCR_UNAVAILABLE, ocrText } from './ocr.mjs';

// Images the chat models read natively; their stored text is the placeholder history and compaction see.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const utf8 = new TextDecoder('utf-8', { fatal: true });

// { name, type, bytes } -> { delivery, parts: [{ text }] }; throws with the learner-facing reason when unsupported.
export async function prepareAttachment(
  { name, type, bytes },
  { readsImages = true, recognize } = {},
) {
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
      `${name}: this file type can't be attached. Attach a plain-text file or a PNG, JPEG or WebP image.`,
    );
  return { delivery: 'text', parts: [{ text: `[Attached file: ${name}]\n${text}` }] };
}

// A learner message as the models read it: the typed question, then each attachment's prepared text.
export const withAttachments = (text, attachments = []) =>
  [text, ...attachments.map((a) => a.text).filter(Boolean)].filter((t) => t.trim()).join('\n\n');
