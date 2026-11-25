import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Code } from '@astryxdesign/core/Code';
import { request as api } from '../serverAccess';

type Started = { url?: string; command?: string };

// Shown while Claude is signed out: Claude Code opens its own sign-in page, and models reload every few seconds until signed in unmounts this.
export default function ClaudeSignIn({
    loadModels,
    variant,
}: {
    loadModels: () => void;
    variant: 'secondary' | 'ghost';
}) {
    const [started, setStarted] = useState<Started>(),
        [pending, setPending] = useState(false),
        [error, setError] = useState('');
    useEffect(() => {
        if (!started?.url) return;
        const timer = setInterval(loadModels, 3000);
        return () => clearInterval(timer);
    }, [started?.url]);
    async function signIn() {
        setPending(true);
        setError('');
        try {
            setStarted(await api('/api/claude/login', {}));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPending(false);
        }
    }
    return (
        <VStack gap={2}>
            {started?.url && (
                <Text type="supporting" role="status">
                    Finish signing in on the page that opened in your browser; Rabbithole notices by
                    itself. No page?{' '}
                    <Link href={started.url} isExternalLink>
                        Open the sign-in page
                    </Link>
                    .
                </Text>
            )}
            {started?.command && (
                <Text type="supporting" role="status">
                    Sign-in could not open here. Run <Code>{started.command}</Code> in a terminal,
                    then check again.
                </Text>
            )}
            {error && (
                <Text type="supporting" role="alert">
                    {error}
                </Text>
            )}
            <HStack gap={2}>
                <Button
                    label="Sign in to Claude"
                    variant={variant}
                    size="sm"
                    isDisabled={pending}
                    onClick={() => void signIn()}
                />
                {started?.command && (
                    <Button label="Check again" variant="ghost" size="sm" onClick={loadModels} />
                )}
            </HStack>
        </VStack>
    );
}
