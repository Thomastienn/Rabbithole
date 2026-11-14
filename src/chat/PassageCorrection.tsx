import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import EllipsisHorizontalIcon from '@heroicons/react/24/outline/EllipsisHorizontalIcon';
import type { Graph } from '../knowledge/KnowledgePage';

export default function PassageCorrection({
  name,
  api,
  disabled,
  children,
}: {
  name: string;
  api: (path: string, body?: unknown) => Promise<Graph>;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [correction, setCorrection] = useState<'known' | 'unknown' | null>(null);
  const [saving, setSaving] = useState<'known' | 'unknown'>();
  const [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const version = useRef(0);
  useEffect(() => {
    const current = ++version.current;
    void api('/api/graph')
      .then((graph) => {
        if (current === version.current)
          setCorrection(
            graph.concepts.find((c) => c.name.toLowerCase() === name.toLowerCase())?.correction ??
              null,
          );
      })
      .catch((e) => {
        if (current === version.current) setError(e.message);
      });
    return () => {
      version.current++;
    };
  }, [name]);
  async function correct(kind: 'known' | 'unknown') {
    if (saving || disabled) return;
    version.current++;
    setSaving(kind);
    setError('');
    setStatus('');
    try {
      await api('/api/graph/correct', { name, kind });
      setCorrection(kind);
      setStatus(
        `${name}: ${kind === 'known' ? 'marked as known' : 'marked as not understood'}. Your correction overrides the estimate.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(undefined);
    }
  }
  // Overflow keeps both corrections reachable without two prominent buttons; selecting one saves it.
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center">
        {children}
        <DropdownMenu
          presentation="popover"
          alignment="end"
          renderTrigger={(props) => (
            <IconButton
              {...props}
              label={`Familiarity options for ${name}`}
              tooltip="Familiarity"
              icon={<EllipsisHorizontalIcon />}
              variant="ghost"
              size="sm"
              isLoading={!!saving}
              isDisabled={disabled}
            />
          )}
        >
          <DropdownMenuRadioGroup
            label={`Corrections for ${name}`}
            value={correction ?? undefined}
            onChange={(kind) => void correct(kind as 'known' | 'unknown')}
          >
            <DropdownMenuRadioItem value="known" label="I know this" />
            <DropdownMenuRadioItem value="unknown" label="I don't get this" />
          </DropdownMenuRadioGroup>
        </DropdownMenu>
      </HStack>
      <Text type="supporting" role="status" className="correction-status">
        {status}
      </Text>
      {error && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
    </VStack>
  );
}
