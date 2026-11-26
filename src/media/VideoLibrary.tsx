import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import VideoCard from './VideoCard';
import { request as api } from '../serverAccess';

// Library rows carry no conversation, discussion text or production details.
export type LibraryVideo = {
    id: string;
    title: string;
    description: string;
    duration: number | null;
    created: number;
    // Address · conversation · learning tree still holding the video; null once it is deleted or regenerated.
    origin: string | null;
    available?: false;
    exported?: boolean;
    // Conversation of a pending video that plays live while it is generating.
    live?: string;
};

// Each card holds a player, so the library loads one page of videos at a time.
const PAGE = 24;

export default function VideoLibrary({ activity }: { activity: string }) {
    const [list, setList] = useState<{ videos: LibraryVideo[]; total: number }>();
    const [offset, setOffset] = useState(0);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [trashing, setTrashing] = useState<LibraryVideo>(),
        [busy, setBusy] = useState(false),
        [trashError, setTrashError] = useState('');
    const version = useRef(0);
    async function reveal(v: LibraryVideo) {
        setNotice('');
        try {
            await api(`/api/videos/${v.id}/reveal`, {});
            setNotice(`Opened the folder containing “${v.title}”.`);
        } catch (e) {
            setNotice((e as Error).message);
        }
    }
    async function trash() {
        const v = trashing!;
        setBusy(true);
        setTrashError('');
        try {
            const result: { missing: boolean } = await api(`/api/videos/${v.id}/trash`, {});
            // Remove locally only after the server confirms; a failure keeps the entry and the dialog open.
            setList(
                (l) => l && { videos: l.videos.filter((x) => x.id !== v.id), total: l.total - 1 },
            );
            // Emptying a later page steps back to the one before.
            if (list?.videos.length === 1 && offset > 0) setOffset(offset - PAGE);
            setTrashing(undefined);
            setNotice(
                v.exported === false
                    ? `Removed “${v.title}” and its saved work from Videos.`
                    : result.missing
                      ? `Removed “${v.title}” from Videos. Its file was already missing.`
                      : `Moved “${v.title}” to the system trash. Restore it from your desktop trash if needed.`,
            );
            requestAnimationFrame(() => document.getElementById('refresh-videos')?.focus());
        } catch (e) {
            setTrashError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    async function load() {
        const current = ++version.current;
        setError('');
        try {
            const data = await api(`/api/videos?offset=${offset}&limit=${PAGE}`);
            if (current === version.current) setList(data);
        } catch (e) {
            if (current === version.current) setError((e as Error).message);
        }
    }
    useEffect(() => {
        void load();
        return () => {
            version.current++;
        };
    }, [activity, offset]);
    const videos = list?.videos,
        total = list?.total ?? 0;
    const page = (to: number) => {
        setOffset(to);
        requestAnimationFrame(() => document.getElementById('refresh-videos')?.focus());
    };
    return (
        <VStack gap={6} className="knowledge-content video-page">
            <HStack gap={4} vAlign="end" wrap="wrap" className="library-head">
                <VStack gap={2}>
                    <Heading level={1}>Videos</Heading>
                    <Text color="secondary" className="library-intro">
                        Every saved video from your learning trees. Videos stay here after you
                        delete the conversation they came from.
                    </Text>
                </VStack>
                <Button
                    id="refresh-videos"
                    label="Refresh Videos"
                    variant="secondary"
                    icon={<ArrowPathIcon />}
                    onClick={() => void load()}
                />
            </HStack>
            {error && <Text role="alert">{error}</Text>}
            {/* Mounted while empty so notices announce; library.css takes it out of the flow until then. */}
            <Text role="status" color="secondary" className="library-notice">
                {notice}
            </Text>
            {!videos && !error && <Text role="status">Loading videos…</Text>}
            {videos && !videos.length && (
                <EmptyState
                    headingLevel={2}
                    title="No videos yet"
                    description="Ask the tutor to show something as a video and it is kept here."
                />
            )}
            {!!videos?.length && (
                <section className="video-library" aria-label="Saved videos">
                    {videos.map((v) => (
                        <VideoCard
                            key={v.id}
                            artifact={
                                v.live
                                    ? {
                                          ...v,
                                          status: 'pending',
                                          conversation: v.live,
                                          phase: 'playable',
                                      }
                                    : { ...v, status: 'ready', conversation: '' }
                            }
                            media={`/api/videos/${v.id}/media`}
                            cuts={v.live ? undefined : `/api/videos/${v.id}/cuts`}
                            origin={v.origin}
                            duration={v.duration}
                            onExported={() =>
                                setList(
                                    (l) =>
                                        l && {
                                            ...l,
                                            videos: l.videos.map((x) =>
                                                x.id === v.id ? { ...x, exported: true } : x,
                                            ),
                                        },
                                )
                            }
                            actions={
                                !v.live && (
                                    <>
                                        {v.exported && (
                                            <Button
                                                label="Show in folder"
                                                variant="ghost"
                                                size="sm"
                                                aria-label={`Show “${v.title}” in folder`}
                                                onClick={() => void reveal(v)}
                                            />
                                        )}
                                        <Button
                                            label="Remove"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={`${v.available === false ? 'Remove' : 'Move'} “${v.title}” ${v.available === false ? 'from Videos' : 'to the system trash'}`}
                                            onClick={() => {
                                                setTrashError('');
                                                setTrashing(v);
                                            }}
                                        />
                                    </>
                                )
                            }
                        />
                    ))}
                </section>
            )}
            {total > PAGE && (
                <nav aria-label="Video pages">
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
            <AlertDialog
                isOpen={!!trashing}
                onOpenChange={(open) => {
                    if (!open && !busy) setTrashing(undefined);
                }}
                title={
                    trashing?.available === false
                        ? `Remove “${trashing?.title ?? ''}” from Videos?`
                        : `Move “${trashing?.title ?? ''}” to the trash?`
                }
                description={`${trashing?.available === false ? 'Its saved file is already missing, so only the library entry is removed.' : trashing?.exported === false ? 'It was never exported, so its saved work is deleted and cannot be restored.' : 'The video file moves to your system trash, where you can restore it.'} Your usage history is kept, and Rabbithole will not regenerate it.${trashError ? ` ${trashError}` : ''}`}
                actionLabel={trashing?.available === false ? 'Remove from Videos' : 'Move to trash'}
                cancelLabel="Keep video"
                isActionLoading={busy}
                onAction={() => void trash()}
            />
        </VStack>
    );
}
