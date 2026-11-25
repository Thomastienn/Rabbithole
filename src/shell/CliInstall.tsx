import { useEffect, useEffectEvent, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Code } from '@astryxdesign/core/Code';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { request } from '../serverAccess';
import { useDownloadRows } from './useDownloadRows';

const PAGES = {
    claude: { name: 'Claude Code', page: 'https://code.claude.com/docs/en/setup' },
    codex: { name: 'Codex', page: 'https://developers.openai.com/codex/cli' },
};

// Starts the server's official installer, then follows its download row until it ends.
function useInstall(cli: string, done: () => void) {
    const row = useDownloadRows().find((download) => download.id === cli);
    const state = row?.state;
    const [pending, setPending] = useState(false);
    const [requestError, setRequestError] = useState('');
    const refresh = useEffectEvent(done);
    useEffect(() => {
        if (state) setPending(false);
        if (state === 'ready') refresh();
    }, [state]);
    const start = () => {
        setPending(true);
        setRequestError('');
        void request(`/api/downloads/install/${cli}`, {}).catch((error: Error) => {
            setPending(false);
            setRequestError(error.message);
        });
    };
    const running = pending || state === 'running';
    return { running, error: running ? '' : requestError || row?.error, start };
}

// A missing Claude Code or Codex: Install runs its official installer; the command and page stay for doing it by hand.
export default function CliInstall({
    cli,
    command,
    check,
    optional = false,
}: {
    cli: keyof typeof PAGES;
    command?: string;
    check: () => void;
    optional?: boolean;
}) {
    const { name, page } = PAGES[cli];
    const install = useInstall(cli, check);
    return (
        <VStack gap={2}>
            <Text type="supporting">
                {optional && 'Optional. '}
                {name} is not installed. Install it here, or run <Code>{command}</Code> yourself
                (see{' '}
                <Link href={page} isExternalLink>
                    the official {name} setup page
                </Link>
                ) and choose Check again.
            </Text>
            {install.running && <ProgressBar label={`Installing ${name}`} isIndeterminate />}
            {install.error && (
                <Text type="supporting" role="alert">
                    {install.error}
                </Text>
            )}
            <HStack gap={2}>
                <Button
                    label={install.error ? `Retry installing ${name}` : `Install ${name}`}
                    variant={optional ? 'ghost' : 'secondary'}
                    size="sm"
                    isDisabled={install.running}
                    onClick={install.start}
                >
                    {install.error ? 'Retry' : 'Install'}
                </Button>
                <Button
                    label="Check again"
                    variant="ghost"
                    size="sm"
                    isDisabled={install.running}
                    onClick={check}
                />
            </HStack>
        </VStack>
    );
}
