// Plain createElement so markdown.ts stays loadable by the node test runner.
import { createElement as h } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { useClipboard } from '@astryxdesign/core/hooks';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

// Quiet copy of exact source text; the check icon and announced "Copied" confirm in place.
export default function CopyButton({
    text,
    label,
    className,
}: {
    text: string;
    label: string;
    className?: string;
}) {
    const { copy, isCopied } = useClipboard({ announce: 'Copied' });
    return h(IconButton, {
        className,
        variant: 'ghost',
        size: 'sm',
        label: isCopied ? 'Copied' : label,
        tooltip: isCopied ? 'Copied' : label,
        icon: h(isCopied ? CheckIcon : ClipboardDocumentIcon),
        onClick: () => void copy(text),
    });
}
