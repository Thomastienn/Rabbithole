import { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ArrowLeftIcon, CubeIcon } from '@heroicons/react/24/outline';

type PieceRow = {
  id: string;
  name: string;
  look: string;
  improved: number;
  videos: { id: string; title: string }[];
};
type Piece = PieceRow & { roles: string[]; source: string; code: string };

// Pieces colour only through roles; the preview lends each role a house hue in order.
const HUES = ['amber', 'leaf', 'rust', 'lichen'];
const date = (t: number) =>
  new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// Read-only: the library is listed and previewed here, never edited or deleted.
export default function PieceLibrary({
  api,
}: {
  api: (path: string, body?: unknown) => Promise<any>;
}) {
  const [pieces, setPieces] = useState<PieceRow[]>();
  const [open, setOpen] = useState<Piece>();
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/pieces').then(setPieces, (e: Error) => setError(e.message));
  }, []);
  async function show(id: string) {
    setError('');
    try {
      setOpen(await api(`/api/pieces/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (open)
    return (
      <VStack gap={4} className="piece-detail">
        <Button
          label="All pieces"
          variant="ghost"
          size="sm"
          icon={<ArrowLeftIcon />}
          onClick={() => setOpen(undefined)}
        />
        <VStack gap={1}>
          <Heading level={2}>{open.name}</Heading>
          <Text color="secondary">{open.look}</Text>
        </VStack>
        <PiecePreview piece={open} />
        <CodeBlock code={open.source} language="tsx" title="Source (read-only)" hasLineNumbers />
      </VStack>
    );
  return (
    <VStack gap={3}>
      {error && <Text role="alert">{error}</Text>}
      {!pieces && !error && <Text role="status">Loading pieces…</Text>}
      {pieces && !pieces.length && (
        <EmptyState
          icon={<CubeIcon />}
          headingLevel={2}
          title="No saved pieces yet"
          description="New videos save their recurring objects here, so later videos can reuse them."
        />
      )}
      {!!pieces?.length && (
        <section className="piece-library" aria-label="Saved pieces">
          {pieces.map((p) => (
            <ClickableCard key={p.id} label={`Open ${p.name}`} onClick={() => void show(p.id)}>
              <VStack gap={1}>
                <Heading level={3}>{p.name}</Heading>
                <Text color="secondary">{p.look}</Text>
                <Text type="supporting" color="secondary">
                  {p.videos.length
                    ? `Used in ${p.videos.map((v) => v.title).join(', ')}`
                    : 'Not in a saved video'}
                </Text>
                <Text type="supporting" color="secondary">
                  Last improved {date(p.improved)}
                </Text>
              </VStack>
            </ClickableCard>
          ))}
        </section>
      )}
    </VStack>
  );
}

// The same opaque-origin, network-denied player frame live videos play in; the piece arrives as data.
function PiecePreview({ piece }: { piece: Piece }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    frame.current?.contentWindow?.postMessage(
      {
        type: 'piece',
        code: piece.code,
        name: piece.name,
        paletteRoles: Object.fromEntries(piece.roles.map((r, i) => [r, HUES[i % HUES.length]])),
      },
      '*',
    );
  }, [loaded, piece]);
  return (
    <iframe
      ref={frame}
      className="video-frame video-live"
      src="/player.html"
      sandbox="allow-scripts"
      title={`Preview: ${piece.name}`}
      onLoad={() => setLoaded(true)}
    />
  );
}
