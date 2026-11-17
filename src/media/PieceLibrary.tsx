import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ArrowLeftIcon, CubeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

type PieceRow = {
  id: string;
  name: string;
  look: string;
  improved: number;
  // Whether the piece has a 3D form, and which stills are rendered yet.
  solid: boolean;
  still: boolean;
  still3d: boolean;
  videos: { id: string; title: string }[];
};
type Piece = PieceRow & {
  roles: string[];
  source: string;
  code: string;
  source3d: string | null;
  code3d: string | null;
};

// Pieces colour only through roles; the preview lends each role a house hue in order.
const HUES = ['amber', 'leaf', 'rust', 'lichen'];
const date = (t: number) =>
  new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const PAGE = 24;

// Read-only: the library is listed and previewed here, never edited or deleted.
export default function PieceLibrary({
  api,
}: {
  api: (path: string, body?: unknown) => Promise<any>;
}) {
  const [list, setList] = useState<{ pieces: PieceRow[]; total: number }>();
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<Piece>();
  const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => {
    const current = ++version.current;
    const q = query.trim();
    // Typing waits a beat so each keystroke does not embed a query.
    const timer = setTimeout(
      () => {
        setError('');
        const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
        if (q) params.set('q', q);
        api(`/api/pieces?${params}`).then(
          (data) => current === version.current && setList(data),
          (e: Error) => current === version.current && setError(e.message),
        );
      },
      q ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, offset]);
  async function show(id: string) {
    setError('');
    try {
      setOpen(await api(`/api/pieces/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const pieces = list?.pieces,
    total = list?.total ?? 0,
    searched = !!query.trim();
  const page = (to: number) => {
    setOffset(to);
    requestAnimationFrame(() => document.getElementById('piece-search')?.focus());
  };
  return (
    <VStack gap={5} className="knowledge-content">
      <VStack gap={2}>
        <Heading level={1}>Pieces</Heading>
        <Text color="secondary" className="library-intro">
          The recurring objects videos draw, saved so later videos reuse them. Pieces are read-only.
        </Text>
      </VStack>
      {open ? (
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
          {!open.source3d && <Text color="secondary">2D only: this piece has no 3D form.</Text>}
          <CodeBlock code={open.source} language="tsx" title="Source (read-only)" hasLineNumbers />
          {open.source3d && (
            <CodeBlock
              code={open.source3d}
              language="tsx"
              title="3D source (read-only)"
              hasLineNumbers
            />
          )}
        </VStack>
      ) : (
        <VStack gap={3}>
          {error && <Text role="alert">{error}</Text>}
          {!list && !error && <Text role="status">Loading pieces…</Text>}
          {list && !total && !searched && (
            <EmptyState
              icon={<CubeIcon />}
              headingLevel={2}
              title="No saved pieces yet"
              description="New videos save their recurring objects here, so later videos can reuse them."
            />
          )}
          {(searched || !!total) && (
            <TextInput
              id="piece-search"
              label="Search pieces"
              isLabelHidden
              placeholder="Search pieces"
              startIcon={MagnifyingGlassIcon}
              size="sm"
              hasClear
              value={query}
              onChange={(v) => {
                setQuery(v);
                setOffset(0);
              }}
              width={320}
            />
          )}
          {list && searched && (
            <Text role="status" color="secondary">
              {total
                ? `${total} ${total === 1 ? 'piece matches' : 'pieces match'} “${query.trim()}”.`
                : `No pieces match “${query.trim()}”.`}
            </Text>
          )}
          {!!pieces?.length && (
            <section className="piece-library" aria-label="Saved pieces">
              {pieces.map((p) => (
                <ClickableCard key={p.id} label={`Open ${p.name}`} onClick={() => void show(p.id)}>
                  <VStack gap={1}>
                    <PieceStills piece={p} />
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
          {total > PAGE && (
            <nav aria-label="Piece pages">
              <HStack gap={2} vAlign="center">
                <Button
                  label="Previous page"
                  variant="secondary"
                  size="sm"
                  isDisabled={offset === 0}
                  onClick={() => page(Math.max(0, offset - PAGE))}
                />
                <Text color="secondary">
                  Page {offset / PAGE + 1} of {Math.ceil(total / PAGE)}
                </Text>
                <Button
                  label="Next page"
                  variant="secondary"
                  size="sm"
                  isDisabled={offset + PAGE >= total}
                  onClick={() => page(offset + PAGE)}
                />
              </HStack>
            </nav>
          )}
        </VStack>
      )}
    </VStack>
  );
}

// Stills rendered on the server, never a live player per card; the improvement time keeps the URL fresh.
function PieceStills({ piece }: { piece: PieceRow }) {
  const still = (form: string, shown: boolean, label: string) =>
    shown ? (
      <img src={`/api/pieces/${piece.id}/${form}?v=${piece.improved}`} alt={label} loading="lazy" />
    ) : (
      <Text type="supporting" color="secondary" className="piece-still-pending">
        {label}: still pending
      </Text>
    );
  return (
    <div className="piece-stills">
      {still('still', piece.still, '2D form')}
      {piece.solid ? (
        still('still3d', piece.still3d, '3D form')
      ) : (
        <Text type="supporting" color="secondary" className="piece-still-pending">
          2D only
        </Text>
      )}
    </div>
  );
}

// The same opaque-origin, network-denied player frame live videos play in; both forms arrive as data.
function PiecePreview({ piece }: { piece: Piece }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    frame.current?.contentWindow?.postMessage(
      {
        type: 'piece',
        code: piece.code,
        code3d: piece.code3d,
        name: piece.name,
        paletteRoles: Object.fromEntries(piece.roles.map((r, i) => [r, HUES[i % HUES.length]])),
      },
      '*',
    );
  }, [loaded, piece]);
  return (
    <iframe
      ref={frame}
      className={`video-frame video-live${piece.code3d ? ' piece-forms' : ''}`}
      src="/player.html"
      sandbox="allow-scripts"
      title={`Preview: ${piece.name}`}
      onLoad={() => setLoaded(true)}
    />
  );
}
