import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import {
    ArrowDownTrayIcon,
    ChevronLeftIcon,
    InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { AddonRow, useAddons } from '../settings/AddonsSettings';

const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

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
    const { addons, error: installError, install } = useAddons();
    const error = finishError || installError;
    // In list order, so a dependency listed later is already queued by its dependant.
    async function installAll() {
        for (const a of missing) await install(a);
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
                            onClick={() => void installAll()}
                        />
                    )}
                    {started && leaveButton}
                </HStack>
            </HStack>
        </>
    );
}
