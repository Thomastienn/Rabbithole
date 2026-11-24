import { useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';

// A media card's version controls: "Try a new version…" opens an inline box for an optional
// instruction, and "Previous version" swaps back while a previous version exists.
// items go in the card's "..." menu; box renders under the card while open.
export function useNewVersion(
    hasPrevious: boolean | undefined,
    regenerate?: (instruction: string) => Promise<void>,
    previous?: () => Promise<void>,
    onCancel?: () => void,
) {
    const [open, setOpen] = useState(false);
    const items = [
        ...(regenerate ? [{ label: 'Try a new version…', onClick: () => setOpen(true) }] : []),
        ...(previous && hasPrevious
            ? [{ label: 'Previous version', onClick: () => void previous() }]
            : []),
    ];
    const box = open && regenerate && (
        <NewVersionBox
            submit={async (instruction) => {
                await regenerate(instruction);
                setOpen(false);
            }}
            cancel={() => {
                setOpen(false);
                onCancel?.();
            }}
        />
    );
    return { items, box };
}

function NewVersionBox({
    submit,
    cancel,
}: {
    submit: (instruction: string) => Promise<void>;
    cancel: () => void;
}) {
    const [value, setValue] = useState(''),
        [sending, setSending] = useState(false);
    const valid = value.trim().length <= 500;
    function send() {
        if (!valid || sending) return;
        setSending(true);
        void submit(value.trim()).finally(() => setSending(false));
    }
    return (
        <VStack
            gap={2}
            className="new-version"
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!sending) cancel();
                }
            }}
        >
            <TextInput
                label="What to change"
                isOptional
                value={value}
                onChange={setValue}
                size="sm"
                hasAutoFocus
                isDisabled={sending}
                description="Leave it empty for a different approach. Up to 500 characters."
                onEnter={send}
                status={
                    valid ? undefined : { type: 'error', message: 'Use 500 characters or fewer.' }
                }
            />
            <HStack gap={1}>
                <Button
                    label="Make new version"
                    variant="primary"
                    size="sm"
                    isLoading={sending}
                    isDisabled={!valid}
                    onClick={send}
                />
                <Button
                    label="Cancel"
                    variant="ghost"
                    size="sm"
                    isDisabled={sending}
                    onClick={cancel}
                />
            </HStack>
        </VStack>
    );
}
