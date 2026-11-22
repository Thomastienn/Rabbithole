import { useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import ArrowUpIcon from '@heroicons/react/24/outline/ArrowUpIcon';
import XMarkIcon from '@heroicons/react/24/outline/XMarkIcon';

// The map's branch question box: the passage box minus its quote and brief, beside the node it asks from.
export default function FreeBranchForm({
    address,
    busy,
    ask,
    close,
}: {
    address: string;
    busy: boolean;
    ask: (question: string, created: () => void) => Promise<void>;
    close: (refocus: boolean) => void;
}) {
    const [question, setQuestion] = useState('');
    const [sending, setSending] = useState(false);
    const form = useRef<HTMLFormElement>(null);
    useEffect(() => {
        if (sending) return;
        // An outside click closes the box; its own node, + included, keeps it open.
        const outside = (e: PointerEvent) => {
            if (!form.current?.closest('.react-flow__node')?.contains(e.target as Node))
                close(false);
        };
        document.addEventListener('pointerdown', outside, true);
        return () => document.removeEventListener('pointerdown', outside, true);
    }, [sending]);
    return (
        <form
            ref={form}
            role="dialog"
            aria-label={`Ask on the side from ${address}`}
            className="branch-form free-branch-form nodrag nopan nowheel"
            onSubmit={(e) => {
                e.preventDefault();
                if (sending || busy || !question.trim()) return;
                setSending(true);
                // A refused branch keeps the box and its question; the workspace banner names the reason.
                void ask(question, () => close(false)).finally(() => setSending(false));
            }}
            onKeyDown={(e) => {
                if (e.key === 'Escape' && !sending) {
                    e.preventDefault();
                    e.stopPropagation();
                    close(true);
                }
            }}
        >
            <VStack padding={2} gap={2}>
                <HStack gap={2} vAlign="center">
                    <Text className="node-address" hasTabularNumbers>
                        {address}
                    </Text>
                    <Text type="supporting" color="secondary" className="free-branch-head">
                        Ask on the side, after its latest reply
                    </Text>
                    <IconButton
                        label="Close"
                        icon={<XMarkIcon />}
                        variant="ghost"
                        size="sm"
                        onClick={() => close(true)}
                    />
                </HStack>
                <HStack gap={1} vAlign="center">
                    <TextInput
                        label="Question to ask on the side"
                        isLabelHidden
                        placeholder="Ask your own question"
                        size="sm"
                        value={question}
                        onChange={setQuestion}
                        isDisabled={sending}
                        hasAutoFocus
                        containerClassName="branch-question"
                    />
                    <IconButton
                        className="branch-send"
                        label={sending ? 'Preparing context…' : 'Create focused chat'}
                        type="submit"
                        icon={<ArrowUpIcon />}
                        variant="primary"
                        size="sm"
                        isLoading={sending}
                        isDisabled={sending || busy || !question.trim()}
                    />
                </HStack>
            </VStack>
        </form>
    );
}
