import { useEffect, useRef } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { XMarkIcon } from '@heroicons/react/24/outline';

// The learner's strokes waiting for the next question (mockup Rabbithole-brd.14): one pill above the composer text,
// with a short line in the learner's ink. Its × takes them all back, and Ctrl/Cmd+Z the last one, so a mark the
// learner no longer means never reaches the tutor.
export default function PenMarks({
    marks,
    unstroke,
}: {
    marks: number;
    unstroke: (all: boolean) => void;
}) {
    const tray = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!marks) return;
        // Text fields keep their own undo, and a board out of sight takes no keys.
        const undo = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey)
                return;
            if (tray.current?.closest('[hidden]')) return;
            if (
                target.closest?.(
                    'input, textarea, select, [contenteditable]:not([contenteditable=false])',
                )
            )
                return;
            e.preventDefault();
            unstroke(false);
        };
        window.addEventListener('keydown', undo);
        return () => window.removeEventListener('keydown', undo);
    }, [marks, unstroke]);
    if (!marks) return null;
    return (
        <div ref={tray} className="board-tray">
            <span className="board-marks">
                <span aria-hidden />
                {marks === 1
                    ? '1 mark goes with your question'
                    : `${marks} marks go with your question`}
                <IconButton
                    label={marks === 1 ? 'Remove mark' : 'Remove marks'}
                    icon={<XMarkIcon />}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        unstroke(true);
                        // The pill goes once the server answers, so focus moves on to the question field.
                        document
                            .querySelector<HTMLElement>('.board-composer [role=textbox]')
                            ?.focus();
                    }}
                />
            </span>
        </div>
    );
}
