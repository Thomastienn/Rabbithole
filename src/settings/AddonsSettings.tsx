import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Code } from '@astryxdesign/core/Code';
import { Icon } from '@astryxdesign/core/Icon';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    CheckIcon,
    CommandLineIcon,
    ExclamationTriangleIcon,
    FilmIcon,
    GlobeAltIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { useSandbox } from './SandboxSettings';
import { request as api } from '../serverAccess';
import { subscribeDownloads } from '../shell/useDownloadRows';

type Addon = {
    id: string;
    name: string;
    enables: string;
    size: number;
    dependency: string | null;
    state: 'installed' | 'not-installed' | 'downloading' | 'updating' | 'failed';
    percent: number | null;
    error?: string;
};

const TILES: Record<string, ComponentType> = {
    'video-tools': FilmIcon,
    'offline-python': CommandLineIcon,
    'web-search': GlobeAltIcon,
};
const mb = (bytes: number) => Math.round(bytes / 1e6);
const lower = (name: string) => name[0].toLowerCase() + name.slice(1);

// The state beside the name: always words, with an icon when it needs attention.
function State({ kind, icon, children }: { kind: string; icon?: ComponentType; children: string }) {
    return (
        <span
            className="addon__state"
            data-state={kind}
            role={kind === 'live' ? 'status' : undefined}
        >
            {icon && <Icon icon={icon} size="sm" />}
            {children}
        </span>
    );
}

function Row({
    icon,
    name,
    state,
    action,
    children,
    sandbox,
}: {
    icon: ComponentType;
    name: string;
    state: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    sandbox?: boolean;
}) {
    return (
        <li className="addon" data-sandbox={sandbox || undefined} aria-label={name}>
            <span className="addon__tile">
                <Icon icon={icon} size="md" />
            </span>
            <div>
                <div className="addon__name">
                    <Text weight="semibold">{name}</Text>
                    {state}
                </div>
                {children}
            </div>
            <div className="addon__act">{action}</div>
        </li>
    );
}

export function AddonRow({
    addon: a,
    dependency: dep,
    install,
}: {
    addon: Addon;
    dependency?: Addon;
    install: (addon: Addon) => void;
}) {
    const percent = a.percent ?? 0;
    const busy = a.state === 'downloading' || a.state === 'updating';
    // The server lists video tools as downloading while offline Python, queued first, still downloads.
    const waiting = a.state === 'downloading' && dep?.state === 'downloading';
    const state = waiting ? (
        <State kind="live">{`Waiting for ${lower(dep.name)}`}</State>
    ) : a.state === 'downloading' ? (
        <State kind="live">{`Downloading ${percent}%`}</State>
    ) : a.state === 'updating' ? (
        <State kind="live" icon={ArrowPathIcon}>{`Updating ${percent}%`}</State>
    ) : a.state === 'installed' ? (
        <State kind="ok" icon={CheckIcon}>
            Installed
        </State>
    ) : a.state === 'failed' ? (
        <State kind="err" icon={ExclamationTriangleIcon}>
            Download failed
        </State>
    ) : (
        <State kind="off">Not installed</State>
    );
    const meta =
        busy && !waiting
            ? [`${mb((a.size * percent) / 100)} of ${mb(a.size)} MB`]
            : [
                  `About ${mb(a.size)} MB`,
                  dep &&
                      (waiting
                          ? `Starts when ${lower(dep.name)} is ready`
                          : a.state === 'installed'
                            ? `Uses ${lower(dep.name)}`
                            : `Also installs ${lower(dep.name)}`),
              ];
    const action = a.state === 'failed' ? 'Retry' : a.state === 'not-installed' ? 'Install' : '';
    return (
        <Row
            icon={TILES[a.id] ?? ArrowDownTrayIcon}
            name={a.name}
            state={state}
            action={
                action && (
                    <Button
                        label={`${action} ${a.name}`}
                        variant="secondary"
                        size="sm"
                        icon={action === 'Retry' ? <ArrowPathIcon /> : <ArrowDownTrayIcon />}
                        onClick={() => install(a)}
                    >
                        {action}
                    </Button>
                )
            }
        >
            <Text type="supporting" color="secondary">
                {a.enables}
            </Text>
            <div className="addon__meta">
                {meta.filter(Boolean).map((m) => (
                    <span key={m}>{m}</span>
                ))}
            </div>
            {a.state === 'failed' && a.error && (
                <Text type="supporting" role="alert">
                    {a.error}
                </Text>
            )}
            {busy && (
                <ProgressBar
                    className="addon__bar"
                    label={`${a.name}: ${percent}%`}
                    isLabelHidden
                    value={waiting ? 0 : percent}
                />
            )}
        </Row>
    );
}

// The existing sandbox status as a row: bwrap on Linux, the Windows sandbox with its one-time setup.
function SandboxRow() {
    const { sandbox, pending, declined, error, check, enable } = useSandbox();
    if (!sandbox) return null;
    const state = sandbox.ready ? (
        <State kind="ok" icon={CheckIcon}>
            Ready
        </State>
    ) : !sandbox.windows ? (
        <State kind="err" icon={ExclamationTriangleIcon}>
            Bubblewrap missing
        </State>
    ) : pending ? (
        <State kind="live">Waiting for the administrator prompt…</State>
    ) : (
        <State kind="off">Off</State>
    );
    return (
        <Row
            icon={ShieldCheckIcon}
            name="Sandbox"
            state={state}
            sandbox
            action={
                sandbox.ready ? undefined : sandbox.windows ? (
                    <Button
                        label={declined ? 'Try again' : 'Enable sandbox'}
                        variant="secondary"
                        size="sm"
                        isLoading={pending}
                        isDisabled={pending}
                        onClick={() => void enable()}
                    />
                ) : (
                    <Button label="Check again" variant="secondary" size="sm" onClick={check} />
                )
            }
        >
            <Text type="supporting" color="secondary">
                {sandbox.ready ? (
                    'Code the tutor writes for videos and Python runs walled off from your files.'
                ) : sandbox.windows ? (
                    declined ? (
                        'The sandbox was not enabled. Videos and Python stay off until it is enabled.'
                    ) : (
                        'Videos and Python run model-written code in a Windows sandbox. Turning it on asks once for administrator rights.'
                    )
                ) : (
                    <>
                        Videos and Python need bubblewrap to wall off the tutor's code. Run{' '}
                        <Code>sudo apt install bubblewrap</Code> in a terminal, or install it with
                        your distribution's package manager, then check again.
                    </>
                )}
            </Text>
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
        </Row>
    );
}

// The add-on list, kept fresh by the download stream, and install or retry by row.
export function useAddons() {
    const [addons, setAddons] = useState<Addon[]>([]),
        [error, setError] = useState('');
    useEffect(() => {
        const load = () =>
            void api('/api/downloads/addons')
                .then((a) => setAddons(a as Addon[]))
                .catch(() => {});
        load();
        // The download stream changes with every whole percent, so each change reloads the rows.
        return subscribeDownloads(load);
    }, []);
    function install(addon: Addon) {
        setError('');
        const retry = addon.state === 'failed' ? '/retry' : '';
        return api(`/api/downloads/addons/${addon.id}${retry}`, {})
            .then((a) => setAddons(a as Addon[]))
            .catch((e) => setError((e as Error).message));
    }
    return { addons, error, install };
}

// Settings > Add-ons (mockup Rabbithole-aon.2): one row per add-on, then the code sandbox. Nothing removes an add-on.
export default function AddonsSettings() {
    const { addons, error, install } = useAddons();
    return (
        <VStack gap={6}>
            <ul className="addons" aria-label="Add-ons">
                {addons.map((a) => (
                    <AddonRow
                        key={a.id}
                        addon={a}
                        dependency={addons.find((d) => d.id === a.dependency)}
                        install={install}
                    />
                ))}
            </ul>
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
            <VStack gap={2}>
                <Heading level={3}>Code sandbox</Heading>
                <ul className="addons" aria-label="Code sandbox">
                    <SandboxRow />
                </ul>
            </VStack>
        </VStack>
    );
}
