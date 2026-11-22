import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    CheckIcon,
    ChevronLeftIcon,
    CommandLineIcon,
    ExclamationTriangleIcon,
    FilmIcon,
    GlobeAltIcon,
    InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { request as api } from '../serverAccess';

type AddOn = {
    id: string;
    name: string;
    enables: string;
    size: number;
    dependency: string | null;
    state: 'installed' | 'not-installed' | 'downloading' | 'failed';
    percent: number | null;
    error?: string;
};

const ICONS: Record<string, typeof FilmIcon> = {
    'video-tools': FilmIcon,
    'offline-python': CommandLineIcon,
    'web-search': GlobeAltIcon,
};
const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
const lower = (name: string) => name[0].toLowerCase() + name.slice(1);

function Row({
    addon,
    dependency,
    install,
}: {
    addon: AddOn;
    dependency?: AddOn;
    install: () => void;
}) {
    const Icon = ICONS[addon.id] ?? ArrowDownTrayIcon;
    const needs = dependency && dependency.state !== 'installed' ? dependency : undefined;
    const waiting = addon.state === 'downloading' && needs;
    return (
        <li className="addon-row">
            <span className="addon-tile" aria-hidden>
                <Icon />
            </span>
            <VStack gap={1}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text weight="semibold">{addon.name}</Text>
                    {addon.state === 'installed' && (
                        <span className="connection-status">
                            <CheckIcon aria-hidden />
                            Installed
                        </span>
                    )}
                    {addon.state === 'failed' && (
                        <span className="connection-status" data-state="failed">
                            <ExclamationTriangleIcon aria-hidden />
                            Download failed
                        </span>
                    )}
                    {addon.state === 'downloading' && (
                        <span className="connection-status" data-state="live" role="status">
                            {waiting
                                ? `Waiting for ${lower(needs.name)}`
                                : `Downloading ${addon.percent ?? 0}%`}
                        </span>
                    )}
                </HStack>
                <Text type="supporting" color="secondary">
                    {addon.enables}
                </Text>
                {addon.state === 'failed' ? (
                    <Text type="supporting" className="addon-error">
                        {addon.error}
                    </Text>
                ) : (
                    <Text type="supporting" color="secondary">
                        About {megabytes(addon.size)}
                        {needs &&
                            (waiting
                                ? ` · Starts when ${lower(needs.name)} is ready`
                                : ` · Also installs ${lower(needs.name)}`)}
                    </Text>
                )}
                {addon.state === 'downloading' && (
                    <ProgressBar
                        label={`${addon.name} download`}
                        isLabelHidden
                        value={addon.percent ?? 0}
                    />
                )}
            </VStack>
            {(addon.state === 'not-installed' || addon.state === 'failed') && (
                <Button
                    label={`${addon.state === 'failed' ? 'Retry' : 'Install'} ${addon.name}`}
                    icon={addon.state === 'failed' ? <ArrowPathIcon /> : <ArrowDownTrayIcon />}
                    variant="secondary"
                    size="sm"
                    onClick={install}
                >
                    {addon.state === 'failed' ? 'Retry' : 'Install'}
                </Button>
            )}
        </li>
    );
}

// The last first-run step: offers each add-on; leaving never waits, downloads go on in the background.
export default function FirstRunAddOns({
    pending,
    back,
    leave,
    error: finishError,
}: {
    pending: boolean;
    back: () => void;
    leave: () => void;
    error: string;
}) {
    const [addons, setAddons] = useState<AddOn[]>([]),
        [installError, setError] = useState('');
    const error = finishError || installError;
    useEffect(() => {
        const load = () =>
            void api('/api/downloads/addons').then(
                (list) => setAddons(list as AddOn[]),
                () => {},
            );
        load();
        // The add-on list has no stream, so the step polls it while open.
        const timer = setInterval(load, 1000);
        return () => clearInterval(timer);
    }, []);
    // Rows show progress at once; the server's answer then replaces the guess.
    async function install(ids: string[]) {
        setError('');
        setAddons((list) =>
            list.map((a) =>
                a.state !== 'installed' &&
                (ids.includes(a.id) ||
                    list.some((b) => ids.includes(b.id) && b.dependency === a.id))
                    ? { ...a, state: 'downloading', percent: 0, error: undefined }
                    : a,
            ),
        );
        try {
            for (const id of ids)
                setAddons((await api(`/api/downloads/addons/${id}`, {})) as AddOn[]);
        } catch (e) {
            setError((e as Error).message);
        }
    }
    const missing = addons.filter((a) => a.state === 'not-installed');
    const started = addons.some((a) => a.state !== 'not-installed');
    const leaveButton = (
        <Button
            label={started ? 'Start chatting' : 'Skip'}
            variant={started ? 'primary' : 'secondary'}
            isDisabled={pending}
            onClick={leave}
        />
    );
    return (
        <>
            <VStack gap={2}>
                <Text type="supporting" className="first-run-step">
                    Step 2 of 2
                </Text>
                <Heading level={2} id="first-run-heading" tabIndex={-1}>
                    Add what you need
                </Heading>
                <Text color="secondary">
                    Chat works without any of these. Each one adds a feature and downloads in the
                    background, so you can start chatting right away.
                </Text>
            </VStack>
            <ul className="addon-rows" aria-label="Add-ons">
                {addons.map((a) => (
                    <Row
                        key={a.id}
                        addon={a}
                        dependency={addons.find((d) => d.id === a.dependency)}
                        install={() => void install([a.id])}
                    />
                ))}
            </ul>
            <HStack gap={2} vAlign="start" className="first-run-later">
                <InformationCircleIcon aria-hidden />
                <Text type="supporting" color="secondary">
                    {started
                        ? 'Downloads keep going while you chat. Follow them in the sidebar, or in Settings under Add-ons.'
                        : 'You can install or retry any of these later in Settings, under Add-ons.'}
                </Text>
            </HStack>
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <Button
                    label="Back"
                    icon={<ChevronLeftIcon />}
                    variant="ghost"
                    isDisabled={pending}
                    onClick={back}
                />
                <HStack gap={2}>
                    {!started && leaveButton}
                    {missing.length > 0 && (
                        <Button
                            label={`Install all · about ${megabytes(missing.reduce((sum, a) => sum + a.size, 0))}`}
                            icon={<ArrowDownTrayIcon />}
                            variant={started ? 'secondary' : 'primary'}
                            onClick={() => void install(missing.map((a) => a.id))}
                        />
                    )}
                    {started && leaveButton}
                </HStack>
            </HStack>
        </>
    );
}
