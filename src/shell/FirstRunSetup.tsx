import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import ModelPicker from '../settings/ModelPicker';
import { Divider } from '@astryxdesign/core/Divider';
import { Link } from '@astryxdesign/core/Link';
import { Code } from '@astryxdesign/core/Code';
import { CheckIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import SandboxSettings from '../settings/SandboxSettings';
import ClaudeSignIn from '../settings/ClaudeSignIn';
import FirstRunAddOns from './FirstRunAddOns';
import type { Model } from '../settings/models';
import type { ModelSelection, Providers } from '../chat/types';
import { request as api } from '../serverAccess';

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

function Install({
    cli,
    check,
    optional,
}: {
    cli: keyof typeof INSTALL;
    check: () => void;
    optional: boolean;
}) {
    const { name, page, command } = INSTALL[cli];
    return (
        <VStack gap={2}>
            <Text type="supporting">
                {optional && 'Optional. '}
                {name} is not installed. Install it from{' '}
                <Link href={page} isExternalLink>
                    the official {name} setup page
                </Link>{' '}
                or run <Code>{command}</Code> in a terminal, then check again.
            </Text>
            <HStack>
                <Button
                    label="Check again"
                    variant={optional ? 'ghost' : 'secondary'}
                    size="sm"
                    onClick={check}
                />
            </HStack>
        </VStack>
    );
}

type SystemPackages = { command?: string; words?: string };

// Linux only: system packages video making needs; chat, visuals and diagrams work without them.
function VideoPackages() {
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

// A connection's state beside its name: a tick when connected, plain grey otherwise, since one provider is enough.
function Connection({ name, connected }: { name: string; connected: boolean }) {
    return (
        <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>{name}</Heading>
            {connected ? (
                <span className="connection-status">
                    <CheckIcon aria-hidden />
                    Connected
                </span>
            ) : (
                <span className="connection-status" data-state="off">
                    Not set up
                </span>
            )}
        </HStack>
    );
}

const key = (m: Pick<Model, 'provider' | 'model'>) => `${m.provider}\n${m.model}`;

// First-run setup: sign in and confirm a prefilled chat model, then offer the add-ons; "Set up later" skips both.
export default function FirstRunSetup({
    models,
    providers,
    modelError,
    auth,
    loadModels,
    signIn,
    done,
}: {
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
        [error, setError] = useState(''),
        [step, setStep] = useState<1 | 2>(1);
    const moved = useRef(false);
    // Each step change moves focus to the new heading; the first render leaves focus alone.
    useEffect(() => {
        if (moved.current) document.getElementById('first-run-heading')?.focus();
        moved.current = true;
    }, [step]);
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
    const claude = !!providers?.claude?.connected,
        codex = !!auth?.connected;
    const missing = (cli: string) => providers?.[cli]?.installed === false;
    const region = (children: ReactNode) => (
        <VStack
            className="first-run"
            data-step={step}
            gap={5}
            role="region"
            aria-labelledby="first-run-heading"
        >
            {children}
        </VStack>
    );
    if (step === 2)
        return region(
            <FirstRunAddOns
                pending={pending}
                back={() => setStep(1)}
                leave={() =>
                    void finish(
                        chosen
                            ? { provider: chosen.provider, model: chosen.model, effort: null }
                            : null,
                    )
                }
                error={error}
            />,
        );
    return region(
        <>
            <VStack gap={2}>
                <Text type="supporting" className="first-run-step">
                    Step 1 of 2
                </Text>
                <Heading level={2} id="first-run-heading" tabIndex={-1}>
                    Before your first question
                </Heading>
                <Text color="secondary">
                    Sign in to Claude or Codex. One is enough, and you can add the other later in
                    Settings.
                </Text>
            </VStack>
            <VStack gap={2}>
                <Connection name="Claude" connected={claude} />
                {missing('claude') ? (
                    <Install cli="claude" check={loadModels} optional={codex} />
                ) : (
                    <>
                        <Text type="supporting">
                            {claude
                                ? 'Signed in through Claude Code.'
                                : `${codex ? 'Optional. ' : ''}Sign in with your Claude account.`}
                        </Text>
                        {!claude && (
                            <ClaudeSignIn
                                loadModels={loadModels}
                                variant={codex ? 'ghost' : 'secondary'}
                            />
                        )}
                    </>
                )}
            </VStack>
            <Divider />
            <VStack gap={2}>
                <Connection name="Codex" connected={codex} />
                {missing('codex') ? (
                    <Install cli="codex" check={loadModels} optional={claude} />
                ) : (
                    <>
                        <Text type="supporting">
                            {codex
                                ? `Connected ${auth?.email ?? 'to ChatGPT'}.`
                                : `${claude ? 'Optional. ' : ''}Sign in with your ChatGPT account.`}
                        </Text>
                        {!codex && (
                            <HStack>
                                <Button
                                    label="Continue with ChatGPT"
                                    variant={claude ? 'ghost' : 'secondary'}
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
            <VideoPackages />
            <SandboxSettings />
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
                        {models ? 'Sign in to either one to pick a chat model.' : 'Loading models…'}
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
                    label="Continue"
                    variant="primary"
                    isDisabled={!chosen || pending}
                    endContent={<ChevronRightIcon aria-hidden />}
                    onClick={() => setStep(2)}
                />
            </HStack>
        </>,
    );
}
