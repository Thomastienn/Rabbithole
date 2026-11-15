import { useRef } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Token } from '@astryxdesign/core/Token';
import { ChatComposerDrawer } from '@astryxdesign/core/Chat';
import { Popover } from '@astryxdesign/core/Popover';
import {
  ArrowTopRightOnSquareIcon,
  DocumentMagnifyingGlassIcon,
  DocumentTextIcon,
  PaperClipIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

export type Attachment = { id: string; name: string; type: string; size: number; delivery: string };

const icon = (type: string) => (type.startsWith('image/') ? <PhotoIcon /> : <DocumentTextIcon />);

// The paperclip opens the file picker; paste and drop reach the same add() through the input's onFiles.
export function AttachButton({
  add,
  isDisabled,
}: {
  add: (files: File[]) => void;
  isDisabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          add([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <IconButton
        label="Attach files"
        icon={<PaperClipIcon />}
        variant="ghost"
        size="sm"
        isDisabled={isDisabled}
        onClick={() => input.current?.click()}
      />
    </>
  );
}

export function PendingAttachments({
  files,
  remove,
}: {
  files: File[];
  remove: (index: number) => void;
}) {
  if (!files.length) return null;
  return (
    <ChatComposerDrawer label="Attachments">
      <HStack gap={1} wrap="wrap">
        {files.map((file, i) => (
          <Token
            key={`${i}-${file.name}`}
            label={file.name}
            icon={icon(file.type)}
            onRemove={() => remove(i)}
          />
        ))}
      </HStack>
    </ChatComposerDrawer>
  );
}

const DELIVERY: Record<string, string> = {
  text: 'read as text',
  image: 'sent as image',
  ocr: 'OCR text',
};
const isImage = (a: Attachment) => a.type.startsWith('image/');
const kind = (a: Attachment) =>
  a.type === 'application/pdf' ? 'PDF' : isImage(a) ? 'Image' : 'Text';
// A PDF sends its pages, so its image delivery reads in the plural.
const delivery = (a: Attachment) => {
  const pdf = a.type === 'application/pdf';
  const text = a.delivery
    .split(',')
    .map((d) => (DELIVERY[d] ?? d) + (d === 'image' && pdf ? 's' : ''))
    .join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const attachmentLabel = (a: Attachment) => `${kind(a)} · ${delivery(a)}`;
const tile = (a: Attachment) =>
  a.type === 'application/pdf' ? 'PDF' : (/\.(\w{1,4})$/.exec(a.name)?.[1] ?? 'TXT').toUpperCase();

const openIcon = <ArrowTopRightOnSquareIcon className="attachment-open" aria-hidden />;

// A question's files, right-aligned above its bubble: images sent as images are plates, everything else a slip.
// The name and meta form one link whose ::after covers the whole slip, so the slip opens the file.
export function MessageAttachments({
  conversation,
  attachments,
}: {
  conversation: string;
  attachments: Attachment[];
}) {
  return (
    <div className="message-files">
      {attachments.map((a) => {
        const href = `/api/trees/${conversation}/attachments/${a.id}`;
        const plate = isImage(a) && a.delivery === 'image';
        const link = (
          <a
            className="attachment-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${a.name}`}
          >
            <span className="attachment-name">{a.name}</span>
            <span className="attachment-delivery">{plate ? delivery(a) : attachmentLabel(a)}</span>
          </a>
        );
        if (plate)
          return (
            <div key={a.id} className="attachment-plate">
              <img className="attachment-plate-image" src={href} alt="" />
              <div className="attachment-plate-caption">
                {link}
                <span className="attachment-end">{openIcon}</span>
              </div>
            </div>
          );
        return (
          <div key={a.id} className="attachment-slip">
            <span className="attachment-tile">
              {isImage(a) ? <img src={href} alt="" /> : tile(a)}
            </span>
            {link}
            <span className="attachment-end">
              {a.delivery.split(',').includes('ocr') ? (
                <Popover
                  label="About OCR"
                  width={280}
                  content={
                    <div className="attachment-ocr-note">
                      <h3>The tutor read recognised text</h3>
                      <p>
                        This model can’t see images, so the app ran OCR on this file. OCR can miss
                        handwriting and diagrams. A model that reads images, such as Claude or
                        Codex, sees the page itself.
                      </p>
                    </div>
                  }
                >
                  <IconButton
                    label={`About OCR for ${a.name}`}
                    icon={<DocumentMagnifyingGlassIcon />}
                    variant="ghost"
                    size="sm"
                  />
                </Popover>
              ) : (
                openIcon
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
