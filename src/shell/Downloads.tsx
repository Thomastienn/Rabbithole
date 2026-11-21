import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Popover } from '@astryxdesign/core/Popover';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { session } from '../media/ExportButton';
import { downloadStatus, formatSize, overallPercent, type Download } from './downloadProgress';

const post = (path: string): Promise<void> =>
    fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': session.csrf },
        body: '{}',
    }).then(
        () => {},
        () => {},
    );

// Shown only while a download is queued, running, failed or newly ready; closing the opened list marks ready ones seen.
export default function Downloads({ rail = false }: { rail?: boolean }) {
    const [list, setList] = useState<Download[]>([]);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (typeof EventSource === 'undefined') return;
        const source = new EventSource('/api/downloads');
        source.onmessage = (e) => setList(JSON.parse(e.data));
        return () => source.close();
    }, []);
    if (!list.length) return null;
    const percent = overallPercent(list);
    const failed = list.some((d) => d.state === 'failed');
    const label = failed
        ? 'Downloads: a download failed'
        : list.every((d) => d.state === 'ready')
          ? 'Downloads ready'
          : `Downloads, ${percent}%`;
    return (
        <span className="downloads-button" data-failed={failed || undefined}>
            <Popover
                label="Downloads"
                width={300}
                placement="above"
                isOpen={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) void post('/api/downloads/seen');
                }}
                content={
                    <ul className="downloads-list" aria-label="Downloads">
                        {list.map((d) => (
                            <li key={d.id}>
                                <Text weight="semibold">{d.name}</Text>
                                {formatSize(d.total) && (
                                    <Text type="supporting" color="secondary">
                                        {formatSize(d.total)}
                                    </Text>
                                )}
                                <ProgressBar
                                    label={`${d.name}: ${downloadStatus(d)}`}
                                    isLabelHidden
                                    value={d.state === 'ready' ? 100 : (d.percent ?? 0)}
                                    isIndeterminate={d.state === 'running' && d.percent === null}
                                    variant={d.state === 'failed' ? 'error' : undefined}
                                />
                                <Text
                                    type="supporting"
                                    color="secondary"
                                    role={d.state === 'failed' ? 'alert' : undefined}
                                >
                                    {downloadStatus(d)}
                                </Text>
                                {d.state === 'failed' && (
                                    <Button
                                        label={`Retry ${d.name}`}
                                        variant="secondary"
                                        size="sm"
                                        clickAction={() => post(`/api/downloads/${d.id}/retry`)}
                                    >
                                        Retry
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                }
            >
                <Button
                    className="view-tab"
                    label={label}
                    tooltip={rail ? label : undefined}
                    icon={<ArrowDownTrayIcon />}
                    isIconOnly={rail}
                    variant="ghost"
                    size="sm"
                >
                    {rail ? undefined : 'Downloads'}
                </Button>
            </Popover>
            <svg className="downloads-ring" viewBox="0 0 36 36" aria-hidden>
                <circle
                    cx="18"
                    cy="18"
                    r="16"
                    pathLength={1}
                    strokeDasharray={`${percent / 100} 1`}
                />
            </svg>
        </span>
    );
}
