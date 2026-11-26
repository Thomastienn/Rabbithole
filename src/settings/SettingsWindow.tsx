import { useEffect, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Icon } from '@astryxdesign/core/Icon';
import {
    ArrowLeftIcon,
    ChartBarIcon,
    CpuChipIcon,
    LinkIcon,
    PuzzlePieceIcon,
    SwatchIcon,
} from '@heroicons/react/24/outline';
import EndpointSettings from './EndpointSettings';
import SuggestionSettings, { AutomaticSuggestions } from './SuggestionSettings';
import ChatSettings from './ChatSettings';
import SmartSettings, { VideoMode, VisualFrequency } from './SmartSettings';
import ModelProfiles from './ModelProfiles';
import TutorStyleSettings from './TutorStyleSettings';
import MemoryNoteSettings from './MemoryNoteSettings';
import SearchSettings from './SearchSettings';
import TutorToolsSettings from './TutorToolsSettings';
import AddonsSettings from './AddonsSettings';
import ClaudeSignIn from './ClaudeSignIn';
import UsageDashboard from '../usage/UsageDashboard';
import CliInstall from '../shell/CliInstall';
import type { Model } from './models';
import type { ModelSelection, Providers } from '../chat/types';
import type { Appearance, ThemeChoice } from '../shell/appearance';
import InterfaceSettings, { Done, Problem, Section } from './InterfaceSettings';
import { useDesktopUpdate } from '../shell/UpdateBanner';

export type SettingsTab = 'models' | 'connections' | 'interface' | 'addons' | 'usage';
// tab: the section to scroll to (undefined opens at the top); focus is a selector to focus once open.
export type SettingsRequest = { tab?: SettingsTab; focus?: string };

const TABS: { id: SettingsTab; label: string; description: string; icon: typeof CpuChipIcon }[] = [
    {
        id: 'interface',
        label: 'Interface',
        description: 'How Rabbithole looks and how its keys behave.',
        icon: SwatchIcon,
    },
    {
        id: 'models',
        label: 'Models',
        description: 'Which model does which job.',
        icon: CpuChipIcon,
    },
    {
        id: 'connections',
        label: 'Connections',
        description: 'Where replies come from.',
        icon: LinkIcon,
    },
    {
        id: 'addons',
        label: 'Add-ons',
        description:
            'Optional parts of Rabbithole. Chat works without any of them. Install one when you want what it adds. It downloads in the background while you keep chatting.',
        icon: PuzzlePieceIcon,
    },
    {
        id: 'usage',
        label: 'Usage',
        description: 'Tokens Rabbithole has sent and received. Costs depend on your provider.',
        icon: ChartBarIcon,
    },
];

// The version comes from the server; only the desktop app's update state adds the latest version or Up to date.
function AppVersion({ version }: { version?: string }) {
    const [update, act] = useDesktopUpdate();
    const newer = update?.stage !== 'current' && update;
    const action =
        update?.stage === 'ready'
            ? 'restart'
            : update?.stage === 'available' || update?.stage === 'failed'
              ? 'install'
              : null;
    return (
        <HStack gap={3} vAlign="center" wrap="wrap" className="settings-foot">
            <Text type="supporting" color="secondary">
                Rabbithole {version}
                {newer ? ` · Latest is ${newer.version}` : update ? ' · Up to date' : ''}
            </Text>
            {action && (
                <Button
                    label={action === 'restart' ? 'Restart to update' : 'Update'}
                    variant="secondary"
                    size="sm"
                    onClick={() => act(action)}
                />
            )}
        </HStack>
    );
}

// One provider (mockup Connections): name then status, what it uses, and Check again re-reading the provider status.
function Connection({
    name,
    status,
    ok,
    note,
    check,
    children,
}: {
    name: string;
    status: string;
    ok: boolean;
    note: string;
    check: () => Promise<void>;
    children?: ReactNode;
}) {
    return (
        <div className="settings-conn" role="group" aria-label={name}>
            <HStack gap={2} vAlign="center" wrap="wrap">
                <Text weight="semibold">{name}</Text>
                {ok ? <Done>{status}</Done> : <Problem>{status}</Problem>}
            </HStack>
            <Text type="supporting" color="secondary">
                {note}
            </Text>
            <Button
                className="settings-conn__check"
                label={`Check ${name} again`}
                variant="secondary"
                onClick={() => void check()}
            >
                Check again
            </Button>
            {children && <VStack gap={2}>{children}</VStack>}
        </div>
    );
}

export default function SettingsWindow({
    request,
    close,
    models,
    providers,
    modelError,
    loadModels,
    profileActivated,
    auth,
    version,
    signIn,
    vim,
    setVim,
    discord,
    setDiscord,
    appearance,
    setAppearance,
    theme,
    setTheme,
}: {
    request?: SettingsRequest;
    close: () => void;
    models?: Model[];
    providers?: Providers;
    modelError: string;
    loadModels: () => Promise<void>;
    profileActivated: (chat: ModelSelection) => void;
    auth?: { connected: boolean; email: string | null };
    version?: string;
    signIn: () => Promise<void>;
    vim: boolean;
    setVim: (on: boolean) => void;
    discord: boolean;
    setDiscord: (on: boolean) => void;
    appearance: Appearance;
    setAppearance: (next: Appearance) => void;
    theme: ThemeChoice;
    setTheme: (next: ThemeChoice) => void;
}) {
    const [tab, setTab] = useState<SettingsTab>('interface');
    const [authError, setAuthError] = useState('');
    const [chatVersion, setChatVersion] = useState(0),
        [rolesVersion, setRolesVersion] = useState(0);
    // Focus a section (or a control inside it); scroll only for requests, never for a nav switch.
    function reveal(target: string, scroll = true) {
        const el = document.querySelector<HTMLElement>(target);
        if (scroll) el?.scrollIntoView({ block: 'start' });
        el?.focus({ preventScroll: true });
    }
    // Switch page during render so the focus effect below finds the requested page already mounted.
    const [seen, setSeen] = useState(request);
    if (request !== seen) {
        setSeen(request);
        if (request) {
            setTab(request.tab ?? 'interface');
            setAuthError('');
        }
    }
    useEffect(() => {
        if (!request) return;
        const focus = () =>
            reveal(
                request.focus ??
                    (request.tab ? `#settings-section-${request.tab}` : '#settings-heading'),
            );
        // The modal drawer keeps the page inert until its closing transition finishes.
        const drawer = document.querySelector('dialog.astryx-drawer[open]');
        if (drawer) {
            drawer.addEventListener('close', focus, { once: true });
            return () => drawer.removeEventListener('close', focus);
        }
        const frame = requestAnimationFrame(focus);
        return () => cancelAnimationFrame(frame);
    }, [request]);
    function showTab(next: SettingsTab) {
        setTab(next);
        requestAnimationFrame(() => reveal(`#settings-section-${next}`, false));
    }
    async function connect() {
        setAuthError('');
        try {
            await signIn();
        } catch (e) {
            setAuthError((e as Error).message);
        }
    }
    const group = (id: SettingsTab, children: ReactNode) => {
        const t = TABS.find((t) => t.id === id)!;
        return (
            <VStack
                gap={6}
                as="section"
                className="settings-group"
                aria-labelledby={`settings-section-${id}`}
            >
                <VStack gap={1}>
                    <Heading level={2} id={`settings-section-${id}`} tabIndex={-1}>
                        {t.label}
                    </Heading>
                    <Text color="secondary">{t.description}</Text>
                </VStack>
                {children}
            </VStack>
        );
    };

    // One page at a time (mockup Settings); the nav picks the page.
    const panel = (
        <VStack gap={8} className="settings-panel">
            {tab === 'usage' && group('usage', <UsageDashboard providers={providers} />)}
            {tab === 'addons' && group('addons', <AddonsSettings />)}
            {tab === 'interface' &&
                group(
                    'interface',
                    <InterfaceSettings
                        appearance={appearance}
                        setAppearance={setAppearance}
                        theme={theme}
                        setTheme={setTheme}
                        vim={vim}
                        setVim={setVim}
                        discord={discord}
                        setDiscord={setDiscord}
                    />,
                )}
            {tab === 'models' &&
                group(
                    'models',
                    <>
                        <ModelProfiles
                            models={models}
                            providers={providers}
                            modelError={modelError}
                            reloadModels={loadModels}
                            connections={() => showTab('connections')}
                            version={rolesVersion}
                            onActivated={profileActivated}
                        >
                            <ChatSettings
                                models={models}
                                providers={providers}
                                onSaved={() => {
                                    setChatVersion((v) => v + 1);
                                    setRolesVersion((v) => v + 1);
                                }}
                            />
                            <SmartSettings
                                models={models}
                                providers={providers}
                                chatVersion={chatVersion}
                                onSaved={() => setRolesVersion((v) => v + 1)}
                            />
                            <SuggestionSettings
                                models={models}
                                providers={providers}
                                onSaved={() => setRolesVersion((v) => v + 1)}
                            />
                        </ModelProfiles>
                        <Divider />
                        <Section title="Visuals and videos">
                            <VisualFrequency />
                            <VideoMode />
                        </Section>
                        <Divider />
                        <Section title="Suggestions">
                            <AutomaticSuggestions />
                        </Section>
                        <Divider />
                        <TutorToolsSettings />
                        <Divider />
                        <TutorStyleSettings />
                        <Divider />
                        <MemoryNoteSettings />
                        <Divider />
                        <SearchSettings />
                    </>,
                )}
            {tab === 'connections' &&
                group(
                    'connections',
                    <>
                        <div>
                            <Connection
                                name="Claude"
                                status={
                                    providers?.claude?.installed === false
                                        ? 'Not installed'
                                        : providers && !modelError && providers.claude?.connected
                                          ? 'Connected'
                                          : providers && !modelError
                                            ? 'Not signed in'
                                            : 'Status unavailable'
                                }
                                ok={!!providers && !modelError && !!providers.claude?.connected}
                                note={
                                    providers?.claude?.connected
                                        ? 'Signed in through Claude Code on this computer.'
                                        : 'Uses your own Claude plan through Claude Code on this computer.'
                                }
                                check={loadModels}
                            >
                                {providers?.claude?.installed === false && (
                                    <CliInstall
                                        cli="claude"
                                        command={providers.claude.command}
                                        check={() => void loadModels()}
                                    />
                                )}
                                {modelError && (
                                    <Text type="supporting" role="alert">
                                        {modelError}
                                    </Text>
                                )}
                                {!providers?.claude?.connected &&
                                    providers?.claude?.installed !== false && (
                                        <ClaudeSignIn loadModels={loadModels} variant="secondary" />
                                    )}
                            </Connection>
                            <Connection
                                name="Codex"
                                status={auth?.connected ? 'Connected' : 'Not connected'}
                                ok={!!auth?.connected}
                                note={
                                    auth?.connected
                                        ? `Uses your own ChatGPT plan, signed in ${auth.email ? `as ${auth.email}` : 'to ChatGPT'}.`
                                        : 'Uses your own ChatGPT plan. Continue with ChatGPT, then check again.'
                                }
                                check={loadModels}
                            >
                                {providers?.codex?.installed === false && (
                                    <CliInstall
                                        cli="codex"
                                        command={providers.codex.command}
                                        check={() => void loadModels()}
                                    />
                                )}
                                <HStack>
                                    <Button
                                        label={
                                            auth?.connected
                                                ? 'Reconnect ChatGPT'
                                                : 'Continue with ChatGPT'
                                        }
                                        variant="secondary"
                                        size="sm"
                                        data-oai-siwc-button=""
                                        onClick={() => void connect()}
                                    >
                                        {auth?.connected
                                            ? 'Reconnect ChatGPT'
                                            : 'Continue with ChatGPT'}
                                    </Button>
                                </HStack>
                                {authError && (
                                    <Text type="supporting" role="alert">
                                        {authError}
                                    </Text>
                                )}
                            </Connection>
                        </div>
                        <EndpointSettings models={models} changed={loadModels} />
                    </>,
                )}
        </VStack>
    );

    const nav = (
        <SideNav aria-label="Settings sections" className="settings-nav">
            {TABS.map((t) => (
                <SideNavItem
                    key={t.id}
                    id={`settings-${t.id}`}
                    label={t.label}
                    icon={<Icon icon={t.icon} size="sm" color="primary" />}
                    isSelected={t.id === tab}
                    onClick={() => showTab(t.id)}
                />
            ))}
        </SideNav>
    );

    // A full page, not a dialog (mockup Settings, Usage); ChatPage maps Escape to close like the old window.
    return (
        <main hidden={!request} className="knowledge-panel settings-page" aria-label="Settings">
            {request && (
                <VStack gap={8} className="settings-content">
                    {/* Same return link as Knowledge, Videos and Pieces (ReturnPanel); the page name is for screen readers. */}
                    <HStack className="settings-head">
                        <Button
                            id="settings-return"
                            label="Return to learning tree"
                            variant="ghost"
                            icon={<ArrowLeftIcon />}
                            onClick={close}
                        />
                    </HStack>
                    <h1 id="settings-heading" tabIndex={-1} className="sr-only">
                        Settings
                    </h1>
                    <div className="settings-layout">
                        {nav}
                        {panel}
                    </div>
                    <AppVersion version={version} />
                </VStack>
            )}
        </main>
    );
}
