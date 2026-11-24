import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';

// The desktop shell's update state (desktop/shell.mjs updateState); null and current show no banner.
export type Update = {
    stage: 'current' | 'available' | 'downloading' | 'ready' | 'failed' | 'restarting';
    version: string;
    current: string;
    percent?: number;
    transferred?: number;
    total?: number;
    reason?: string;
} | null;
type Action = 'install' | 'restart' | 'hide';
type Bridge = {
    update: (action: 'get' | 'install' | 'restart') => Promise<Update>;
    onUpdate: (listener: (update: Update) => void) => () => void;
};

// Only the desktop app's preload (desktop/preload.cjs) provides the bridge; in a browser nothing shows.
export function useDesktopUpdate(): [Update, (action: Action) => void] {
    const [update, setUpdate] = useState<Update>(null);
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        const desktop = (window as { rabbitholeDesktop?: Bridge }).rabbitholeDesktop;
        if (!desktop) return;
        const stop = desktop.onUpdate(setUpdate);
        void desktop.update('get').then(setUpdate);
        return stop;
    }, []);
    const act = useCallback((action: Action) => {
        if (action === 'hide') return setHidden(true);
        void (window as { rabbitholeDesktop?: Bridge }).rabbitholeDesktop
            ?.update(action)
            .then(setUpdate);
    }, []);
    // Hidden until the next launch; a started download carries on.
    return [hidden ? null : update, act];
}

const mb = (bytes = 0) => Math.round(bytes / 1e6);

export default function UpdateBanner({
    update,
    act,
}: {
    update: NonNullable<Update>;
    act: (action: Action) => void;
}) {
    const { stage, version } = update;
    const card = (icon: ReactNode, title: string, body: string, action?: ReactNode) => (
        <div className="update-card" role={stage === 'failed' ? 'alert' : 'status'}>
            <div className="update-head">
                {icon}
                <Text weight="semibold">{title}</Text>
                {stage !== 'restarting' && (
                    <IconButton
                        label="Hide until next launch"
                        icon={<XMarkIcon />}
                        variant="ghost"
                        size="sm"
                        onClick={() => act('hide')}
                    />
                )}
            </div>
            <Text type="supporting" color="secondary">
                {body}
            </Text>
            {action}
        </div>
    );
    const button = (label: string, icon: ReactNode, action: Action, primary = false) => (
        <Button
            label={label}
            icon={icon}
            variant={primary ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => act(action)}
        />
    );
    if (stage === 'available')
        return card(
            <SparklesIcon />,
            `Rabbithole ${version} is available`,
            `You have ${update.current}. Your trees stay as they are.`,
            button('Install', <ArrowDownTrayIcon />, 'install'),
        );
    if (stage === 'downloading')
        return card(
            <ArrowDownTrayIcon />,
            `Downloading ${version} · ${update.percent}%`,
            `${update.total ? `${mb(update.transferred)} of ${mb(update.total)} MB. ` : ''}Keep working; nothing changes until you restart.`,
            <ProgressBar label={`Downloading ${version}`} isLabelHidden value={update.percent} />,
        );
    if (stage === 'ready')
        return card(
            <CheckCircleIcon />,
            `${version} is ready`,
            'Restart to finish. Your map layout is saved first.',
            button('Restart to update', <ArrowPathIcon />, 'restart', true),
        );
    if (stage === 'failed')
        return card(
            <ExclamationTriangleIcon className="update-failed" />,
            'The update did not download',
            update.reason ?? '',
            button('Retry', <ArrowPathIcon />, 'install'),
        );
    return card(<ArrowPathIcon />, 'Restarting…', 'Saving your map layout.');
}
