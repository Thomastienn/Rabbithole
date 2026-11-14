import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE_TYPES, prepareAttachment } from '../attachments.mjs';

export async function prepareUploads(files, options) {
  const attachments = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer()),
      name = file.name || 'attachment';
    const { delivery, parts } = await prepareAttachment({ name, type: file.type, bytes }, options);
    attachments.push({
      id: randomUUID(),
      name,
      type: file.type,
      size: file.size,
      delivery,
      text: parts.map((p) => p.text).join('\n\n'),
      parts,
      bytes,
    });
  }
  return attachments;
}

// Retry may use a different model: prepare the original images/PDFs before replacing the failed reply.
export async function prepareRetry(attachments, dir, conversation, options) {
  const prepared = [];
  for (const a of attachments) {
    if (!IMAGE_TYPES.includes(a.type) && a.type !== 'application/pdf') {
      prepared.push(a);
      continue;
    }
    const bytes = readFileSync(join(dir, 'attachments', conversation, a.id));
    const { delivery, parts } = await prepareAttachment({ ...a, bytes }, options);
    prepared.push({ ...a, delivery, parts, text: parts.map((p) => p.text).join('\n\n') });
  }
  return prepared;
}

const imageFile = (a, index) => (a.type === 'application/pdf' ? `${a.id}-${index}.png` : a.id);

// Called only after every attachment prepared successfully and Stop was checked.
export function savePrepared(attachments, folder) {
  if (!attachments.length) return;
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const a of attachments) {
    if (a.bytes) writeFileSync(join(folder, a.id), a.bytes, { mode: 0o600 });
    for (const [index, p] of (a.parts ?? []).entries())
      if (p.image && p.bytes)
        writeFileSync(join(folder, imageFile(a, index)), p.bytes, { mode: 0o600 });
  }
}

export function attachmentParts(text, attachments, folder) {
  const parts = text.trim() ? [{ text }] : [];
  for (const a of attachments) {
    for (const [index, p] of (a.parts ?? [{ text: a.text }]).entries()) {
      parts.push({ text: p.text });
      if (p.image)
        parts.push({
          image: {
            name: p.name ?? a.name,
            type: p.type ?? a.type,
            path: join(folder, imageFile(a, index)),
          },
        });
    }
  }
  return parts;
}
