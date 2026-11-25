import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Code } from '@astryxdesign/core/Code';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { request } from '../serverAccess';
import type { Download } from './downloadProgress';

const PAGES = {
    claude: { name: 'Claude Code', page: 'https://code.claude.com/docs/en/setup' },
    codex: { name: 'Codex', page: 'https://developers.openai.com/codex/cli' },
};

// Starts the server's official installer, then follows its download row until it ends.
function useInstall(cli: string, done: () => void) {
    const [status, setStatus] = useState<{ running: boolean; error?: string }>({
        running: false,
    });
    const source = useRef<EventSource>(null);
    useEffect(() => () => source.current?.close(), []);
    const start = () => {
        setStatus({ running: true });
        // The row is watched only once the server has started it, so an earlier failure is not read as this one.
        request(`/api/downloads/install/${cli}`, {}).then(
            () => {
                source.current?.close();
                const s = (source.current = new EventSource('/api/downloads'));
                s.onmessage = (e) => {
                    const row = (JSON.parse(e.data) as Download[]).find((d) => d.id === cli);
                    if (row?.state !== 'ready' && row?.state !== 'failed') return;
                    s.close();
                    setStatus({ running: false, error: row.error });
                    if (row.state === 'ready') done();
                };
            },
            (e: Error) => setStatus({ running: false, error: e.message }),
        );
    };
    return { ...status, start };
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
                ), then check again.
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
