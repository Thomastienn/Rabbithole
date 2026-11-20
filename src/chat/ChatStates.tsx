import type { ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ChatComposer, ChatComposerInput } from '@astryxdesign/core/Chat';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { ArrowUpIcon } from '@heroicons/react/24/outline';
import {
  AttachButton,
  PendingAttachments,
  noModelNote,
  pendingPlaceholder,
  useAttach,
} from './Attachments';

export function FirstQuestion({
  draft,
  setDraft,
  files,
  setFiles,
  busy,
  available,
  modelMenu,
  submit,
  modelError,
  loadModels,
  noModels,
  needsModel,
  openSettings,
}: {
  draft: string;
  setDraft: (draft: string) => void;
  files: File[];
  setFiles: (files: File[]) => void;
  busy: boolean;
  available: boolean;
  modelMenu: ReactNode;
  submit: (text: string) => void;
  modelError: string;
  loadModels: () => void;
  noModels: boolean;
  needsModel: boolean;
  openSettings: (opener: HTMLElement) => void;
}) {
  const attach = useAttach(files, setFiles, busy);
  return (
    <VStack className="first-question" gap={3} hAlign="center">
      <Heading level={2}>Your first tree starts with a question.</Heading>
      <ChatComposer
        className={`single-ring-composer attachment-composer${attach.dropping ? ' is-dropping' : ''}`}
        {...attach.zone}
        elevation="none"
        value={draft}
        onChange={setDraft}
        footerActions={
          <>
            <AttachButton add={attach.add} isDisabled={busy} />
            {modelMenu}
          </>
        }
        isDisabled={busy}
        sendButton={
          !available ? (
            <IconButton label="Send" icon={<ArrowUpIcon />} variant="primary" isDisabled />
          ) : files.length && !draft.trim() && !busy ? (
            // The composer's own send needs text; files alone are a question too.
            <IconButton
              label="Send"
              icon={<ArrowUpIcon />}
              variant="primary"
              onClick={() => {
                attach.clear();
                submit('');
              }}
            />
          ) : undefined
        }
        onSubmit={(text) => {
          if (!available) return;
          attach.clear();
          submit(text);
        }}
        input={
          // Tray and notices go in the input slot so they sit inside the composer's frame.
          <>
            <PendingAttachments
              files={files}
              remove={(i) => setFiles(files.filter((_, j) => j !== i))}
            />
            {noModels && noModelNote}
            {attach.notices}
            <ChatComposerInput
              label="Your question"
              maxRows={4}
              value={draft}
              onChange={setDraft}
              onFiles={attach.add}
              isDisabled={busy || !available}
              placeholder={
                files.length
                  ? pendingPlaceholder(files.length)
                  : 'What would you like to understand?'
              }
            />
          </>
        }
      />
      {modelError && (
        <HStack className="failure-banner" role="alert" gap={2}>
          <Text>{modelError}</Text>
          <Button
            label="Retry loading models"
            variant="secondary"
            size="sm"
            onClick={() => void loadModels()}
          />
        </HStack>
      )}
      {needsModel && (
        <HStack className="failure-banner" role="status" gap={2}>
          <Text>Choose a chat model in Settings</Text>
          <Button
            label="Open Settings"
            variant="secondary"
            size="sm"
            onClick={(e) => openSettings(e.currentTarget)}
          />
        </HStack>
      )}
    </VStack>
  );
}

export function TreeLoading() {
  return (
    <VStack gap={3} className="tree-loading" role="status" aria-label="Loading tree">
      <Text className="sr-only">Loading tree…</Text>
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} />
      <Skeleton height={14} width="92%" />
      <Skeleton height={14} width="70%" />
    </VStack>
  );
}

export function TreeLoadFailure({ retry }: { retry: () => void }) {
  return (
    <HStack className="failure-banner" gap={3} vAlign="center">
      <Heading level={2}>Tree could not load</Heading>
      <Button label="Retry loading tree" variant="secondary" size="sm" onClick={retry} />
    </HStack>
  );
}
