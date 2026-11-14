import { useRef } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Token } from '@astryxdesign/core/Token';
import { ChatComposerDrawer } from '@astryxdesign/core/Chat';
import { DocumentTextIcon, PaperClipIcon } from '@heroicons/react/24/outline';

export type Attachment = { id: string; name: string; type: string; size: number; delivery: string };

const DELIVERY: Record<string, string> = { text: 'read as text' };

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
            icon={<DocumentTextIcon />}
            onRemove={() => remove(i)}
          />
        ))}
      </HStack>
    </ChatComposerDrawer>
  );
}

export const attachmentLabel = (a: Attachment) =>
  `Text file · ${DELIVERY[a.delivery] ?? a.delivery}`;

// A question's files: each chip names the file, its type and how it reached the tutor, and opens it.
export function MessageAttachments({
  conversation,
  attachments,
}: {
  conversation: string;
  attachments: Attachment[];
}) {
  return (
    <HStack gap={1} wrap="wrap" className="message-attachments">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={`/api/trees/${conversation}/attachments/${a.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${a.name}`}
        >
          <Token
            label={a.name}
            icon={<DocumentTextIcon />}
            endContent={<span className="attachment-delivery">{attachmentLabel(a)}</span>}
          />
        </a>
      ))}
    </HStack>
  );
}
