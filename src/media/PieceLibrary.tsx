import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
    ArrowLeftIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { request as api } from '../serverAccess';

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

const PAGE = 24;

// Read-only: the library is listed and previewed here, never edited or deleted.
export default function PieceLibrary() {
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
        <VStack gap={6} className="knowledge-content piece-page">
            <HStack className="library-head">
                <VStack gap={2}>
                    <Heading level={1}>Pieces</Heading>
                    <Text color="secondary" className="library-intro">
                        The recurring objects videos draw, saved so later videos reuse them. Pieces
                        are read-only.
                    </Text>
                </VStack>
            </HStack>
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
                    {!open.source3d && (
                        <Text color="secondary">2D only: this piece has no 3D form.</Text>
                    )}
                    <CodeBlock
                        code={open.source}
                        language="tsx"
                        title="Source (read-only)"
                        hasLineNumbers
                    />
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
                <VStack gap={5}>
                    {error && <Text role="alert">{error}</Text>}
                    {!list && !error && <Text role="status">Loading pieces…</Text>}
                    {list && !total && !searched && (
                        <EmptyState
                            headingLevel={2}
                            title="No saved pieces yet"
                            description="When a video draws an object worth keeping, it is saved here."
                        />
                    )}
                    {(searched || !!total) && (
                        <TextInput
                            id="piece-search"
                            label="Search pieces"
                            isLabelHidden
                            placeholder="Search pieces"
                            startIcon={MagnifyingGlassIcon}
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
                                <ClickableCard
                                    key={p.id}
                                    label={`Open ${p.name}`}
                                    onClick={() => void show(p.id)}
                                >
                                    <PieceStill piece={p} />
                                    <Heading level={3}>{p.name}</Heading>
                                    <Text type="supporting" color="secondary">
                                        {p.videos.length
                                            ? `Used in ${p.videos.length} ${p.videos.length === 1 ? 'video' : 'videos'}`
                                            : 'Not in a saved video'}
                                    </Text>
                                </ClickableCard>
                            ))}
                        </section>
                    )}
                    {total > PAGE && (
                        <nav aria-label="Piece pages" className="piece-pages">
                            <HStack gap={1} vAlign="center" hAlign="end">
                                <Text type="supporting" color="secondary">
                                    {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
                                </Text>
                                <IconButton
                                    label="Previous page"
                                    icon={<ChevronLeftIcon />}
                                    variant="ghost"
                                    isDisabled={offset === 0}
                                    clickAction={() => page(Math.max(0, offset - PAGE))}
                                />
                                <IconButton
                                    label="Next page"
                                    icon={<ChevronRightIcon />}
                                    variant="ghost"
                                    isDisabled={offset + PAGE >= total}
                                    clickAction={() => page(offset + PAGE)}
                                />
                            </HStack>
                        </nav>
                    )}
                </VStack>
            )}
        </VStack>
    );
}

// One server-rendered 2D still per tile (mockup Pieces), never a live player; the 3D form shows in the piece's
// preview. The improvement time keeps the URL fresh.
function PieceStill({ piece }: { piece: PieceRow }) {
    return piece.still ? (
        <img
            className="piece-still"
            src={`/api/pieces/${piece.id}/still?v=${piece.improved}`}
            alt="2D form"
            loading="lazy"
        />
    ) : (
        <Text type="supporting" color="secondary" className="piece-still piece-still-pending">
            Still pending
        </Text>
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
                paletteRoles: Object.fromEntries(
                    piece.roles.map((r, i) => [r, HUES[i % HUES.length]]),
                ),
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
