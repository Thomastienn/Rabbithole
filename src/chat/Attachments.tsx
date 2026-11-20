import { type DragEvent, useEffect, useRef, useState } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Popover } from '@astryxdesign/core/Popover';
import {
  ArrowTopRightOnSquareIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { canAttach, refusalLine } from './attachmentTypes';

export type Attachment = { id: string; name: string; type: string; size: number; delivery: string };

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

// No model to answer: said in scarlet inside the composer frame, with the way forward.
export const noModelNote = (
  <p className="attachment-note">
    <ExclamationTriangleIcon aria-hidden />
    No model is connected. Open Settings, then Connections.
  </p>
);

// Paperclip, paste and drop all add here: unsupported files are refused on the spot, the rest join the tray.
// Spread `zone` on the composer; render `notices` (refusal line, drop note) inside its frame.
export function useAttach(files: File[], setFiles: (files: File[]) => void, isDisabled = false) {
  const [refused, setRefused] = useState<string[]>([]);
  const [dropping, setDropping] = useState(false);
  // Enter/leave fire for every child the drag crosses; count them so the state does not flicker.
  const depth = useRef(0);
  const add = (more: File[]) => {
    const ok = more.filter((f) => canAttach(f.type));
    setRefused(more.filter((f) => !canAttach(f.type)).map((f) => f.name));
    if (ok.length) setFiles([...files, ...ok]);
  };
  const carriesFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');
  const zone = {
    onDragEnter: (e: DragEvent) => {
      if (!carriesFiles(e) || isDisabled) return;
      depth.current++;
      setDropping(true);
    },
    onDragLeave: () => {
      if (depth.current && !--depth.current) setDropping(false);
    },
    onDragOver: (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      depth.current = 0;
      setDropping(false);
      // The field handles drops on itself; anywhere else in the composer lands here.
      if (e.defaultPrevented || !e.dataTransfer.files.length) return;
      e.preventDefault();
      if (!isDisabled) add([...e.dataTransfer.files]);
    },
  };
  const notices = (
    <>
      {refused.length > 0 && (
        <p className="attachment-note" role="alert">
          <ExclamationTriangleIcon aria-hidden />
          {refusalLine(refused)}
        </p>
      )}
      {dropping && (
        <div className="attachment-drop">
          <PaperClipIcon aria-hidden />
          <b>Drop to attach</b>
          <small>Images, PDFs and text files</small>
        </div>
      )}
    </>
  );
  return { add, clear: () => setRefused([]), dropping, zone, notices };
}

const sizeLabel = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const pendingPlaceholder = (count: number) =>
  count === 1 ? 'Ask about this file, or just send it' : 'Ask about these files, or just send them';

// Files chosen for the next question, as slips at the head of the composer (inside its frame).
export function PendingAttachments({
  files,
  remove,
}: {
  files: File[];
  remove: (index: number) => void;
}) {
  const tray = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<number | null>(null);
  const [urls, setUrls] = useState(new Map<File, string>());
  // Thumbnails are object URLs, revoked whenever the files change (remove, send) or the tray unmounts.
  useEffect(() => {
    const made = new Map(
      files.filter((f) => f.type.startsWith('image/')).map((f) => [f, URL.createObjectURL(f)]),
    );
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  // After a remove, focus the next slip's ×, else the previous one, else the question field.
  useEffect(() => {
    const i = focusAfter.current;
    if (i === null) return;
    focusAfter.current = null;
    const buttons = tray.current?.querySelectorAll<HTMLElement>('.attachment-end button');
    const target = buttons?.[Math.min(i, buttons.length - 1)];
    if (target) target.focus();
    else
      // The tray is gone once empty, so find the field through the composer.
      document.querySelector<HTMLElement>('.attachment-composer [role=textbox]')?.focus();
  }, [files]);
  if (!files.length) return null;
  return (
    <div ref={tray} className="attachment-tray" role="group" aria-label="Files to send">
      {files.map((file, i) => {
        const url = urls.get(file);
        return (
          <div key={`${i}-${file.name}`} className="attachment-slip">
            <span className="attachment-tile">{url ? <img src={url} alt="" /> : tile(file)}</span>
            <span className="attachment-link">
              <span className="attachment-name">{file.name}</span>
              <span className="attachment-delivery">{`${kind(file)} · ${sizeLabel(file.size)}`}</span>
            </span>
            <span className="attachment-end">
              <IconButton
                label={`Remove ${file.name}`}
                icon={<XMarkIcon />}
                variant="ghost"
                size="sm"
                onClick={() => {
                  focusAfter.current = i;
                  remove(i);
                }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

const DELIVERY: Record<string, string> = {
  text: 'read as text',
  image: 'sent as image',
  ocr: 'OCR text',
};
const isImage = (a: { type: string }) => a.type.startsWith('image/');
const kind = (a: { type: string }) =>
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
const tile = (a: { type: string; name: string }) =>
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
