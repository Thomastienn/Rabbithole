import { useEffect, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Icon } from '@astryxdesign/core/Icon';
import {
    ArrowUturnLeftIcon,
    ChartBarIcon,
    CpuChipIcon,
    LinkIcon,
    PuzzlePieceIcon,
    SwatchIcon,
} from '@heroicons/react/24/outline';
import EndpointSettings from './EndpointSettings';
import SuggestionSettings, { AutomaticSuggestions } from './SuggestionSettings';
import ChatSettings from './ChatSettings';
import SmartSettings, { VideoMode } from './SmartSettings';
import ModelProfiles from './ModelProfiles';
import TutorStyleSettings from './TutorStyleSettings';
import MemoryNoteSettings from './MemoryNoteSettings';
import SearchSettings from './SearchSettings';
import TutorToolsSettings from './TutorToolsSettings';
import AddonsSettings from './AddonsSettings';
import ClaudeSignIn from './ClaudeSignIn';
import UsageDashboard from '../usage/UsageDashboard';
import type { Model } from './models';
import type { ModelSelection } from '../chat/types';
import type { Appearance, ThemeChoice } from '../shell/appearance';
import InterfaceSettings, { Done, Section } from './InterfaceSettings';
import { useDesktopUpdate } from '../shell/UpdateBanner';

export type SettingsTab = 'models' | 'connections' | 'interface' | 'addons' | 'usage';
// tab: the section to scroll to (undefined opens at the top); focus is a selector to focus once open.
export type SettingsRequest = { tab?: SettingsTab; focus?: string };

const TABS: { id: SettingsTab; label: string; description: string; icon: typeof CpuChipIcon }[] = [
    {
        id: 'interface',
        label: 'Interface',
        description: 'How Rabbithole looks and how you move around it. Saved in this browser.',
        icon: SwatchIcon,
    },
    {
        id: 'models',
        label: 'Models',
        description:
            'A profile holds a model and effort for each role. Swapping profiles changes all three at once.',
        icon: CpuChipIcon,
    },
    {
        id: 'connections',
        label: 'Connections',
        description:
            'Providers that answer your questions. Trees save on this computer; questions go to the provider you pick for each conversation.',
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
        description:
            'Tokens providers reported for replies, suggestions and media. Kept even after content is deleted.',
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
    appearance,
    setAppearance,
    theme,
    setTheme,
}: {
    request?: SettingsRequest;
    close: () => void;
    models?: Model[];
    providers?: Record<string, { label: string; connected: boolean }>;
    modelError: string;
    loadModels: () => Promise<void>;
    profileActivated: (chat: ModelSelection) => void;
    auth?: { connected: boolean; email: string | null };
    version?: string;
    signIn: () => Promise<void>;
    vim: boolean;
    setVim: (on: boolean) => void;
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
                    <Text type="supporting" color="secondary">
                        {t.description}
                    </Text>
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
                        <Section title="Videos">
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
                    </>,
                )}
            {tab === 'connections' &&
                group(
                    'connections',
                    <>
                        <Section
                            title="Claude"
                            description="Uses your own Claude plan through Claude Code on this computer."
                        >
                            {providers && !modelError && providers.claude?.connected ? (
                                <Done>Claude: signed in through Claude Code</Done>
                            ) : (
                                <Text type="supporting">
                                    Claude:{' '}
                                    {providers && !modelError
                                        ? 'not signed in'
                                        : 'sign-in status unavailable'}
                                </Text>
                            )}
                            {modelError && (
                                <Text type="supporting" role="alert">
                                    {modelError}
                                </Text>
                            )}
                            {!providers?.claude?.connected && (
                                <ClaudeSignIn loadModels={loadModels} variant="secondary" />
                            )}
                        </Section>
                        <Divider />
                        <Section title="Codex" description="Uses your own ChatGPT plan.">
                            {auth?.connected ? (
                                <Done>Codex: connected {auth.email ?? 'to ChatGPT'}</Done>
                            ) : (
                                <Text type="supporting">Codex: not connected</Text>
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
                        </Section>
                        <Divider />
                        <EndpointSettings models={models} changed={loadModels} />
                        <Divider />
                        <SearchSettings />
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
                    <HStack
                        gap={4}
                        vAlign="end"
                        hAlign="between"
                        wrap="wrap"
                        className="settings-head"
                    >
                        <Heading level={1} id="settings-heading" tabIndex={-1}>
                            Settings
                        </Heading>
                        <Button
                            id="settings-return"
                            label="Return to learning tree"
                            variant="secondary"
                            icon={<ArrowUturnLeftIcon />}
                            onClick={close}
                        />
                    </HStack>
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
