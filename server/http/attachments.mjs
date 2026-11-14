import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
      bytes,
    });
  }
  return attachments;
}

// Retry may use a different model: prepare the original images before replacing the failed reply.
export async function prepareRetry(attachments, dir, conversation, options) {
  const prepared = [];
  for (const a of attachments) {
    if (!IMAGE_TYPES.includes(a.type)) {
      prepared.push(a);
      continue;
    }
    const bytes = readFileSync(join(dir, 'attachments', conversation, a.id));
    const { delivery, parts } = await prepareAttachment({ ...a, bytes }, options);
    prepared.push({ ...a, delivery, text: parts.map((p) => p.text).join('\n\n') });
  }
  return prepared;
}
