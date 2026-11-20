import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

// The CSRF token from /api/state, set by the chat state so cards anywhere can start an export.
export const session = { csrf: '' };

type ExportState = { exported: boolean; exporting?: true; progress?: number; error?: string };

// Export MP4 at the top right of the player: starts or joins the video's one export, shows its progress as a
// ring, then downloads the kept MP4. The same component in the inline card, the large player and the library.
export default function ExportButton({
    id,
    title,
    onExported,
}: {
    id: string;
    title: string;
    onExported?: () => void;
}) {
    const [state, setState] = useState<ExportState>({ exported: false });
    const wanted = useRef(false);
    const download = () => {
        const link = document.createElement('a');
        link.href = `/api/videos/${id}/media?download`;
        link.download = '';
        link.click();
    };
    const settle = (next: ExportState) => {
        setState(next);
        if (next.exported && wanted.current) {
            wanted.current = false;
            download();
            onExported?.();
        }
    };
    // Polls only while rendering; pressing a card whose video is exporting elsewhere joins that export.
    useEffect(() => {
        if (!state.exporting) return;
        let stopped = false;
        const timer = setInterval(async () => {
            try {
                const next: ExportState = await (await fetch(`/api/videos/${id}/export`)).json();
                if (!stopped) settle(next);
            } catch {}
        }, 1000);
        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }, [id, state.exporting]);
    const start = async () => {
        wanted.current = true;
        try {
            const response = await fetch(`/api/videos/${id}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': session.csrf },
                body: '{}',
            });
            const next = await response.json();
            settle(response.ok ? next : { exported: false, error: next.error ?? 'Export failed.' });
        } catch {
            settle({ exported: false, error: 'Could not reach Rabbithole. Retry the export.' });
        }
    };
    const progress = state.progress ?? 0;
    return (
        <span className="export-button" data-exporting={state.exporting || undefined}>
            <IconButton
                label={`Export MP4: ${title}`}
                tooltip={
                    state.exporting ? `Exporting MP4, ${Math.round(progress * 100)}%` : 'Export MP4'
                }
                icon={<ArrowDownTrayIcon />}
                variant="ghost"
                size="sm"
                clickAction={start}
            />
            {state.exporting && (
                <svg
                    className="export-ring"
                    viewBox="0 0 36 36"
                    role="progressbar"
                    aria-label={`Exporting ${title}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                >
                    <circle
                        cx="18"
                        cy="18"
                        r="16"
                        pathLength={1}
                        strokeDasharray={`${progress} 1`}
                    />
                </svg>
            )}
            {state.error && (
                <>
                    <Text type="supporting" role="alert" className="export-error">
                        Export failed: {state.error}
                    </Text>
                    <Button label="Retry" variant="secondary" size="sm" clickAction={start} />
                </>
            )}
        </span>
    );
}
