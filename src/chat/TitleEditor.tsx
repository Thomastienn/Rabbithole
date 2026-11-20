import { useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { IconButton } from '@astryxdesign/core/IconButton';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function TitleEditor({
    title,
    save,
    cancel,
}: {
    title: string;
    save: (title: string) => Promise<void>;
    cancel: () => void;
}) {
    const [value, setValue] = useState(title),
        [saving, setSaving] = useState(false),
        [error, setError] = useState('');
    const valid = !!value.trim() && value.trim().length <= 200;
    function submit() {
        if (!valid || saving) return;
        setSaving(true);
        void save(value.trim()).catch((e) => {
            setError(e.message);
            setSaving(false);
        });
    }
    return (
        <VStack
            gap={2}
            className="title-editor"
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!saving) cancel();
                }
            }}
        >
            <TextInput
                label="Conversation title"
                isLabelHidden
                value={value}
                onChange={setValue}
                size="sm"
                hasAutoFocus
                isDisabled={saving}
                description="Up to 200 characters."
                onEnter={submit}
                status={
                    value.trim().length > 200
                        ? { type: 'error', message: 'Use 200 characters or fewer.' }
                        : undefined
                }
            />
            {error && <Text role="alert">{error}</Text>}
            <HStack gap={1}>
                <IconButton
                    label={saving ? 'Saving…' : 'Save title'}
                    icon={<CheckIcon />}
                    variant="primary"
                    size="sm"
                    isDisabled={saving || !valid}
                    onClick={submit}
                />
                <IconButton
                    label="Cancel rename"
                    icon={<XMarkIcon />}
                    variant="ghost"
                    size="sm"
                    isDisabled={saving}
                    onClick={cancel}
                />
            </HStack>
        </VStack>
    );
}
