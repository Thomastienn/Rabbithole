import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import ModelPicker from '../settings/ModelPicker';
import { Divider } from '@astryxdesign/core/Divider';
import { Link } from '@astryxdesign/core/Link';
import { Code } from '@astryxdesign/core/Code';
import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import SandboxSettings from '../settings/SandboxSettings';
import type { Model } from '../settings/models';
import type { ModelSelection, Providers } from '../chat/types';

// Official installers; the app never installs or bundles either CLI.
const INSTALL = {
    claude: {
        name: 'Claude Code',
        page: 'https://code.claude.com/docs/en/setup',
        command: 'curl -fsSL https://claude.ai/install.sh | bash',
    },
    codex: {
        name: 'Codex',
        page: 'https://developers.openai.com/codex/cli',
        command: 'npm install -g @openai/codex',
    },
};

function Install({ cli, check }: { cli: keyof typeof INSTALL; check: () => void }) {
    const { name, page, command } = INSTALL[cli];
    return (
        <VStack gap={2}>
            <Text type="supporting">
                {name} is not installed. Install it from{' '}
                <Link href={page} isExternalLink>
                    the official {name} setup page
                </Link>{' '}
                or run <Code>{command}</Code> in a terminal, then check again.
            </Text>
            <HStack>
                <Button label="Check again" variant="secondary" size="sm" onClick={check} />
            </HStack>
        </VStack>
    );
}

type SystemPackages = { command?: string; words?: string };

// Linux only: system packages video making needs; chat, visuals and diagrams work without them.
function VideoPackages({ api }: { api: (path: string) => Promise<unknown> }) {
    const [system, setSystem] = useState<SystemPackages>({});
    const check = () =>
        void api('/api/setup/system')
            .then((s) => setSystem(s as SystemPackages))
            .catch(() => {});
    useEffect(check, []);
    if (!system.command && !system.words) return null;
    return (
        <>
            <VStack gap={2}>
                <Heading level={3}>Video tools</Heading>
                <Text type="supporting">
                    Video making needs a few system packages; chat works without them.{' '}
                    {system.command ? (
                        <>
                            Run <Code>{system.command}</Code> in a terminal, then check again.
                        </>
                    ) : (
                        `Install ${system.words} with your distribution's package manager, then check again.`
                    )}
                </Text>
                <HStack>
                    <Button label="Check again" variant="secondary" size="sm" onClick={check} />
                </HStack>
            </VStack>
            <Divider />
        </>
    );
}

// A connection's state beside its name: scarlet "Not found" when the CLI is missing, a tick when connected.
function Connection({
    name,
    missing,
    connected,
}: {
    name: string;
    missing: boolean;
    connected: boolean;
}) {
    return (
        <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>{name}</Heading>
            {missing ? (
                <span className="connection-status" data-state="missing">
                    <ExclamationTriangleIcon aria-hidden />
                    Not found
                </span>
            ) : (
                connected && (
                    <span className="connection-status">
                        <CheckIcon aria-hidden />
                        Connected
                    </span>
                )
            )}
        </HStack>
    );
}

const key = (m: Pick<Model, 'provider' | 'model'>) => `${m.provider}\n${m.model}`;

// First-run setup: sign in through the existing flows, confirm a prefilled chat model, or leave it for later.
export default function FirstRunSetup({
    api,
    models,
    providers,
    modelError,
    auth,
    loadModels,
    signIn,
    done,
}: {
    api: (path: string, body?: unknown) => Promise<unknown>;
    models?: Model[];
    providers?: Providers;
    modelError: string;
    auth?: { connected: boolean; email: string | null };
    loadModels: () => void;
    signIn: () => Promise<void>;
    done: (chat: ModelSelection | null) => void;
}) {
    const [picked, setPicked] = useState<string>(),
        [pending, setPending] = useState(false),
        [error, setError] = useState('');
    const available = (models ?? []).filter((m) => providers?.[m.provider]?.connected);
    // Prefilled with the first signed-in provider's default model at its default effort.
    const chosen =
        available.find((m) => key(m) === picked) ??
        available.find((m) => m.isDefault) ??
        available[0];
    // Smart and quick thinking follow the chat model in a new profile, so only chat is saved.
    async function finish(chat: ModelSelection | null) {
        setPending(true);
        setError('');
        try {
            if (chat) await api('/api/settings/chat', chat);
            await api('/api/setup', {});
            done(chat);
        } catch (e) {
            setError((e as Error).message);
            setPending(false);
        }
    }
    const claude = providers?.claude?.connected;
    const missing = (cli: string) => providers?.[cli]?.installed === false;
    return (
        <VStack className="first-run" gap={5} role="region" aria-labelledby="first-run-heading">
            <VStack gap={2}>
                <Heading level={2} id="first-run-heading">
                    Before your first question
                </Heading>
                <Text color="secondary">
                    Sign in to Claude or Codex with your own plan, then confirm the model that
                    answers you.
                </Text>
            </VStack>
            <VStack gap={2}>
                <Connection name="Claude" missing={missing('claude')} connected={!!claude} />
                {missing('claude') ? (
                    <Install cli="claude" check={loadModels} />
                ) : (
                    <>
                        <Text type="supporting">
                            {claude
                                ? 'Signed in through Claude Code.'
                                : 'Run claude in a terminal and sign in, then check again.'}
                        </Text>
                        {!claude && (
                            <HStack>
                                <Button
                                    label="Check again"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => loadModels()}
                                />
                            </HStack>
                        )}
                    </>
                )}
            </VStack>
            <Divider />
            <VStack gap={2}>
                <Connection name="Codex" missing={missing('codex')} connected={!!auth?.connected} />
                {missing('codex') ? (
                    <Install cli="codex" check={loadModels} />
                ) : (
                    <>
                        <Text type="supporting">
                            {auth?.connected
                                ? `Connected ${auth.email ?? 'to ChatGPT'}.`
                                : 'Sign in with your ChatGPT account.'}
                        </Text>
                        {!auth?.connected && (
                            <HStack>
                                <Button
                                    label="Continue with ChatGPT"
                                    variant="secondary"
                                    size="sm"
                                    data-oai-siwc-button=""
                                    onClick={() =>
                                        void signIn().catch((e) => setError((e as Error).message))
                                    }
                                />
                            </HStack>
                        )}
                    </>
                )}
            </VStack>
            <Divider />
            <VideoPackages api={api} />
            <SandboxSettings api={api} firstRun />
            <VStack gap={2}>
                <Heading level={3}>Chat model</Heading>
                {chosen ? (
                    <ModelPicker
                        label="Chat model"
                        value={key(chosen)}
                        isDisabled={pending}
                        options={Object.entries(providers ?? {})
                            .map(([provider, { label }]) => ({
                                type: 'section' as const,
                                title: label,
                                options: available
                                    .filter((m) => m.provider === provider)
                                    .map((m) => ({ value: key(m), label: m.label })),
                            }))
                            .filter((section) => section.options.length)}
                        onChange={setPicked}
                    />
                ) : (
                    <Text type="supporting">
                        {models ? 'Sign in above to choose a chat model.' : 'Loading models…'}
                    </Text>
                )}
                {modelError && !chosen && (
                    <Text type="supporting" role="status">
                        {modelError}
                    </Text>
                )}
                {error && (
                    <Text type="supporting" role="alert">
                        {error}
                    </Text>
                )}
            </VStack>
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <Button
                    label="Set up later"
                    variant="ghost"
                    isDisabled={pending}
                    onClick={() => void finish(null)}
                />
                <Button
                    label="Start asking"
                    variant="primary"
                    isDisabled={!chosen || pending}
                    onClick={() =>
                        chosen &&
                        void finish({
                            provider: chosen.provider,
                            model: chosen.model,
                            effort: null,
                        })
                    }
                />
            </HStack>
        </VStack>
    );
}
