// Attachment preparation: turns a learner's file into prepared parts the tutor receives.
// shortcut: plain-text files only; images and PDFs are refused until their preparation lands.

const utf8 = new TextDecoder('utf-8', { fatal: true });

// { name, type, bytes } -> { delivery, parts: [{ text }] }; throws with the learner-facing reason when unsupported.
export function prepareAttachment({ name, type, bytes }) {
  let text = null;
  if (!type.startsWith('image/') && type !== 'application/pdf')
    try {
      text = utf8.decode(bytes);
    } catch {}
  if (text === null || text.includes('\0'))
    throw new Error(`${name}: this file type can't be attached. Attach a plain-text file.`);
  return { delivery: 'text', parts: [{ text: `[Attached file: ${name}]\n${text}` }] };
}

// A learner message as the models read it: the typed question, then each attachment's prepared text.
export const withAttachments = (text, attachments = []) =>
  [text, ...attachments.map((a) => a.text).filter(Boolean)].filter((t) => t.trim()).join('\n\n');
